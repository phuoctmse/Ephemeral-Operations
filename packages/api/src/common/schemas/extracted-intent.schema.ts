import { z } from 'zod';

export const ExtractedIntentSchema = z.object({
  instanceType: z.enum(['t3.micro', 't4g.nano']).nullable(),
  ttlHours: z.number().nullable(),
  confidence: z.enum(['high', 'low']),
  rawRequest: z
    .string()
    .describe('Brief technical interpretation of the user request'),
});

export type ExtractedIntent = z.infer<typeof ExtractedIntentSchema>;
