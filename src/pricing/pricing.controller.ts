import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiSecurity,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { SUPPORTED_PRICING_REGIONS, SyncPricingDto } from './dto/pricing.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { PricingSyncRateLimitGuard } from '../common/guards/pricing-sync-rate-limit.guard';

@ApiTags('Pricing')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'Get pricing table for a region' })
  @ApiResponse({ status: 200, description: 'Pricing table returned' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  async getPricing(@Query('region') region?: string) {
    const targetRegion = region ?? 'us-east-1';
    const table = await this.pricingService.getPricingTable(targetRegion);
    return { region: targetRegion, pricing: table };
  }

  @Post('sync')
  @UseGuards(PricingSyncRateLimitGuard)
  @ApiOperation({ summary: 'Synchronize pricing data from AWS' })
  @ApiResponse({ status: 200, description: 'Pricing sync completed' })
  @ApiBadRequestResponse({ description: 'Unsupported pricing region' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiTooManyRequestsResponse({
    description: 'Pricing sync rate limit exceeded',
  })
  async syncPricing(@Body() dto: SyncPricingDto) {
    const region = dto.region ?? 'us-east-1';
    if (!(SUPPORTED_PRICING_REGIONS as readonly string[]).includes(region)) {
      throw new BadRequestException(`Unsupported pricing region: ${region}`);
    }

    const synced = await this.pricingService.syncRegion(region);
    if (!synced) {
      throw new BadRequestException(`Unsupported pricing region: ${region}`);
    }

    return { message: `Pricing synced for ${region}` };
  }
}
