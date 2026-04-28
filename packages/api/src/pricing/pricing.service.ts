import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { PrismaService } from '../prisma/prisma.service';
import { PRICING_TABLE } from '../common/constants/finops.constants';
import appConfig from '../common/config/app.config';

const REGION_TO_LOCATION: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'eu-west-1': 'EU (Ireland)',
  'eu-central-1': 'EU (Frankfurt)',
};

interface AwsPriceItem {
  product: {
    attributes: {
      instanceType: string;
    };
  };
  terms: {
    OnDemand: Record<
      string,
      {
        priceDimensions: Record<
          string,
          {
            unit: string;
            pricePerUnit: {
              USD: string;
            };
          }
        >;
      }
    >;
  };
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly pricingClient: PricingClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {
    // AWS Price List API is only available in us-east-1 and ap-south-1
    this.pricingClient = new PricingClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      },
    });
  }

  async syncRegion(region: string): Promise<boolean> {
    const location = REGION_TO_LOCATION[region];
    if (!location) {
      this.logger.warn(`Unknown region ${region}, skipping sync`);
      return false;
    }

    this.logger.log(`Syncing EC2 pricing for region: ${region} (${location})`);

    const instanceTypes = Object.keys(PRICING_TABLE);

    for (const instanceType of instanceTypes) {
      try {
        const hourlyCost = await this.fetchInstancePrice(
          location,
          instanceType,
        );
        if (hourlyCost === null) {
          continue;
        }
        if (!Number.isFinite(hourlyCost)) {
          this.logger.warn(
            `Skipping non-finite pricing for ${instanceType} in ${region}: ${hourlyCost}`,
          );
          continue;
        }

        await this.prisma.pricingCache.upsert({
          where: {
            instanceType_region: {
              instanceType,
              region,
            },
          },
          update: { hourlyCost },
          create: { instanceType, region, hourlyCost },
        });

        this.logger.debug(
          `Updated pricing: ${instanceType} @ ${region} = $${hourlyCost}/hr`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to sync pricing for ${instanceType} in ${region}: ${message}`,
        );
      }
    }

    this.logger.log(`Pricing sync completed for ${region}`);
    return true;
  }

  async getHourlyCost(instanceType: string, region: string): Promise<number> {
    const cached = await this.prisma.pricingCache.findUnique({
      where: { instanceType_region: { instanceType, region } },
    });

    if (cached) {
      const ageHours =
        (Date.now() - cached.updatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) {
        return cached.hourlyCost;
      }
      // Stale cache; trigger background refresh
      this.syncRegion(region).catch((err) =>
        this.logger.error(
          `Background pricing sync failed: ${err instanceof Error ? err.message : err}`,
        ),
      );
      return cached.hourlyCost;
    }

    // No cache; try to sync on demand
    try {
      await this.syncRegion(region);
      const refreshed = await this.prisma.pricingCache.findUnique({
        where: { instanceType_region: { instanceType, region } },
      });
      if (refreshed) {
        return refreshed.hourlyCost;
      }
    } catch {
      this.logger.warn(
        `On-demand pricing sync failed, falling back to static table`,
      );
    }

    // Final fallback: hardcoded constant
    return PRICING_TABLE[instanceType as keyof typeof PRICING_TABLE] ?? 0;
  }

  async getPricingTable(region: string): Promise<Record<string, number>> {
    const entries = await this.prisma.pricingCache.findMany({
      where: { region },
    });

    if (entries.length === 0) {
      await this.syncRegion(region);
      const refreshed = await this.prisma.pricingCache.findMany({
        where: { region },
      });
      if (refreshed.length === 0) {
        return { ...PRICING_TABLE };
      }
      return Object.fromEntries(
        refreshed.map((e) => [e.instanceType, e.hourlyCost]),
      );
    }

    const stale = entries.some((e) => {
      const ageHours = (Date.now() - e.updatedAt.getTime()) / (1000 * 60 * 60);
      return ageHours >= 24;
    });

    if (stale) {
      this.syncRegion(region).catch(() => null);
    }

    return Object.fromEntries(
      entries.map((e) => [e.instanceType, e.hourlyCost]),
    );
  }

  async getPricingTableForPrompt(region: string): Promise<string> {
    const table = await this.getPricingTable(region);
    if (Object.keys(table).length === 0) {
      return this.formatStaticPricingTable();
    }

    const lines = Object.entries(table).map(
      ([type, cost]) => `- ${type}: $${cost.toFixed(4)}/hour`,
    );
    return lines.join('\n');
  }

  private async fetchInstancePrice(
    location: string,
    instanceType: string,
  ): Promise<number | null> {
    const command = new GetProductsCommand({
      ServiceCode: 'AmazonEC2',
      Filters: [
        { Type: 'TERM_MATCH', Field: 'location', Value: location },
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
        { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
        { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
        { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
      ],
    });

    const response = await this.pricingClient.send(command);
    const rawPriceList: unknown = response.PriceList;
    const items: unknown[] = Array.isArray(rawPriceList)
      ? (rawPriceList as unknown[])
      : [];

    if (items.length === 0) {
      this.logger.warn(
        `No pricing data found for ${instanceType} in ${location}`,
      );
      return null;
    }

    const firstItem: unknown = items[0];
    const serialized =
      typeof firstItem === 'string' ? firstItem : JSON.stringify(firstItem);
    const parsed = JSON.parse(serialized) as unknown;

    if (!this.isAwsPriceItem(parsed)) {
      this.logger.warn(
        `Unexpected AWS pricing schema for ${instanceType} in ${location}`,
      );
      return null;
    }

    const product = parsed;
    const onDemandTerm = Object.values(product.terms.OnDemand)[0];
    if (!onDemandTerm) {
      this.logger.warn(
        `Missing OnDemand term for ${instanceType} in ${location}`,
      );
      return null;
    }

    const priceDimension = Object.values(onDemandTerm.priceDimensions)[0];
    if (!priceDimension) {
      this.logger.warn(
        `Missing price dimension for ${instanceType} in ${location}`,
      );
      return null;
    }

    const usdString = priceDimension.pricePerUnit.USD;
    const cost = Number.parseFloat(usdString);
    if (!Number.isFinite(cost)) {
      this.logger.warn(
        `Invalid USD pricing value for ${instanceType} in ${location}: ${usdString}`,
      );
      return null;
    }

    return cost;
  }

  private isAwsPriceItem(value: unknown): value is AwsPriceItem {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<AwsPriceItem>;
    if (!candidate.product?.attributes?.instanceType) {
      return false;
    }

    if (
      !candidate.terms?.OnDemand ||
      typeof candidate.terms.OnDemand !== 'object'
    ) {
      return false;
    }

    const onDemandTerms = Object.values(candidate.terms.OnDemand);
    if (onDemandTerms.length === 0) {
      return false;
    }

    const firstTerm = onDemandTerms[0];
    if (
      !firstTerm?.priceDimensions ||
      typeof firstTerm.priceDimensions !== 'object'
    ) {
      return false;
    }

    const priceDimensions = Object.values(firstTerm.priceDimensions);
    if (priceDimensions.length === 0) {
      return false;
    }

    const firstDimension = priceDimensions[0];
    if (typeof firstDimension?.pricePerUnit?.USD !== 'string') {
      return false;
    }

    return true;
  }

  private formatStaticPricingTable(): string {
    return Object.entries(PRICING_TABLE)
      .map(([type, cost]) => `- ${type}: $${cost.toFixed(4)}/hour`)
      .join('\n');
  }
}
