import { IsIn, IsOptional, IsString } from 'class-validator';

export const SUPPORTED_PRICING_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'eu-west-1',
  'eu-central-1',
] as const;

export class SyncPricingDto {
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_PRICING_REGIONS)
  region?: string;
}
