import { z } from 'zod';

export const AgentDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reasoning: z
    .string()
    .describe('Explanation for why this configuration was chosen'),
  config: z
    .object({
      instanceType: z.enum(['t3.micro', 't4g.nano']),
      ttlHours: z.number().min(0.5).max(2),
      region: z.string().default('us-east-1'),
    })
    .optional(),
  costAnalysis: z
    .object({
      estimatedHourly: z.number(),
      totalExpected: z.number(),
    })
    .optional(),
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
