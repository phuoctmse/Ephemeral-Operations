export const ALLOWED_INSTANCE_TYPES = ['t3.micro', 't4g.nano'] as const;
export type AllowedInstanceType = (typeof ALLOWED_INSTANCE_TYPES)[number];

export const DEFAULT_REGION = 'us-east-1';
export const EPHOPS_TAG = { Project: 'EphOps' };
export const CLEANUP_CRON_EXPRESSION = '*/5 * * * *';
export const MAX_TOTAL_EXPECTED_COST = 0.025;

/** Pricing estimates (USD/hour) for allowed instance types */
export const PRICING_TABLE: Record<AllowedInstanceType, number> = {
  't3.micro': 0.0104,
  't4g.nano': 0.0042,
};
