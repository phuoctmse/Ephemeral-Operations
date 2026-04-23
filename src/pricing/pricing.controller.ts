import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { SyncPricingDto } from './dto/pricing.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  async getPricing(@Query('region') region?: string) {
    const targetRegion = region ?? 'us-east-1';
    const table = await this.pricingService.getPricingTable(targetRegion);
    return { region: targetRegion, pricing: table };
  }

  @Post('sync')
  async syncPricing(@Body() dto: SyncPricingDto) {
    const region = dto.region ?? 'us-east-1';
    await this.pricingService.syncRegion(region);
    return { message: `Pricing synced for ${region}` };
  }
}
