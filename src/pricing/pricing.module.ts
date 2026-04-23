import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { PricingSyncRateLimitGuard } from '../common/guards/pricing-sync-rate-limit.guard';

@Module({
  controllers: [PricingController],
  providers: [PricingService, ApiKeyGuard, PricingSyncRateLimitGuard],
  exports: [PricingService],
})
export class PricingModule {}
