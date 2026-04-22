import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentDecisionSchema,
  type AgentDecision,
} from '../common/schemas/agent-decision.schema';
import {
  PRICING_TABLE,
  type AllowedInstanceType,
} from '../common/constants/finops.constants';

const SYSTEM_PROMPT = `You are a FinOps Infrastructure Agent. Your mission is to analyze test environment requests and provision infrastructure at the lowest possible cost. You must NEVER provision resources outside the free tier or low-cost categories (t3.micro, t4g.nano). If a request exceeds capabilities, you must REJECT it and explain why.

Available tools:
- get_pricing_estimate: Look up estimated cost for an instance type.
- provision_resources: Request the backend to create a server via AWS SDK.
- log_reasoning: Save your logical analysis to the database before taking action.

You must respond with a JSON object matching this exact schema:
{
  "decision": "APPROVE" | "REJECT",
  "reasoning": "string explaining your decision",
  "config": {
    "instanceType": "t3.micro" | "t4g.nano",
    "ttlHours": number,
    "region": "us-east-1"
  },
  "costAnalysis": {
    "estimatedHourly": number,
    "totalExpected": number
  }
}`;

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'app.ollamaBaseUrl',
      'http://localhost:11434',
    );
    this.model = this.configService.get<string>('app.ollamaModel', 'llama3.2');
  }

  async analyzePrompt(
    prompt: string,
    instanceType: AllowedInstanceType,
    ttlHours: number,
  ): Promise<AgentDecision> {
    const hourlyCost = PRICING_TABLE[instanceType] ?? 0;
    const totalExpected = hourlyCost * ttlHours;

    const userMessage = `User request: "${prompt}"
Suggested config: instanceType=${instanceType}, ttlHours=${ttlHours}
Pricing estimate: $${hourlyCost}/hour, total ~$${totalExpected.toFixed(4)}

Analyze this request. Should we APPROVE or REJECT? Respond with JSON.`;

    this.logger.log(`Sending prompt to Ollama model: ${this.model}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          format: 'json',
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API returned ${response.status}: ${await response.text()}`,
        );
      }

      const data = (await response.json()) as { message: { content: string } };
      const content = data.message?.content ?? '';

      this.logger.debug(`Ollama raw response: ${content}`);

      // Parse and validate with Zod
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // Inject costAnalysis if the LLM omitted it (common with small models)
      if (!parsed.costAnalysis) {
        parsed.costAnalysis = {
          estimatedHourly: hourlyCost,
          totalExpected,
        };
      }

      return AgentDecisionSchema.parse(parsed);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown LLM error';
      this.logger.error(`LLM analysis failed: ${message}`);

      // Fallback: fail closed to avoid unintended provisioning when LLM is unavailable
      return {
        decision: 'REJECT',
        reasoning: `LLM unavailable, request rejected for safety. Original error: ${message}`,
        config: {
          instanceType,
          ttlHours: Math.min(ttlHours, 2),
          region: 'us-east-1',
        },
        costAnalysis: {
          estimatedHourly: hourlyCost,
          totalExpected,
        },
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
