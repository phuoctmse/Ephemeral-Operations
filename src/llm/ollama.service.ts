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
import { PricingService } from '../pricing/pricing.service';
import { PolicyRetrieverService } from '../policy/policy-retriever.service';

const BASE_SYSTEM_PROMPT = `You are a FinOps Infrastructure Agent. Your mission is to analyze test environment requests and provision infrastructure at the lowest possible cost. You must NEVER provision resources outside the free tier or low-cost categories (t3.micro, t4g.nano). If a request exceeds capabilities, you must REJECT it and explain why.

Available tools:
- get_pricing_estimate: Look up estimated cost for an instance type.
- provision_resources: Request the backend to create a server via AWS SDK.
- log_reasoning: Save your logical analysis to the database before taking action.

Current on-demand EC2 pricing (USD/hour):
{{PRICING_TABLE}}

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

export interface LlmAnalysisResult {
  decision: AgentDecision;
  durationMs: number;
  fallbackUsed: boolean;
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fallbackModel: string;
  private readonly timeoutMs: number;
  private readonly region: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly pricingService: PricingService,
    private readonly policyRetriever: PolicyRetrieverService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'app.ollamaBaseUrl',
      'http://localhost:11434',
    );
    this.model = this.configService.get<string>('app.ollamaModel', 'llama3.2');
    this.fallbackModel = this.configService.get<string>(
      'app.ollamaFallbackModel',
      '',
    );
    this.timeoutMs = this.configService.get<number>(
      'app.ollamaTimeoutMs',
      15000,
    );
    this.region = this.configService.get<string>('app.awsRegion', 'us-east-1');
  }

  async analyzePrompt(
    prompt: string,
    instanceType: AllowedInstanceType,
    ttlHours: number,
  ): Promise<LlmAnalysisResult> {
    let hourlyCost: number;
    try {
      hourlyCost = await this.pricingService.getHourlyCost(
        instanceType,
        this.region,
      );
    } catch {
      hourlyCost = PRICING_TABLE[instanceType] ?? 0;
    }
    const totalExpected = hourlyCost * ttlHours;

    const pricingContext = await this.pricingService
      .getPricingTableForPrompt(this.region)
      .then((context) => {
        if (context.trim().length === 0)
          throw new Error('Empty pricing context');
        return context;
      })
      .catch(() => this.formatStaticPricingTable());

    const systemPrompt = BASE_SYSTEM_PROMPT.replace(
      '{{PRICING_TABLE}}',
      pricingContext,
    );

    // Inject relevant policy/runbook context if available
    const policyContext = this.policyRetriever.buildContextSnippet(prompt);
    const augmentedSystemPrompt = policyContext
      ? `${systemPrompt}\n\n## Relevant Policy Context\n${policyContext}`
      : systemPrompt;

    const userMessage = `User request: "${prompt}"
Suggested config: instanceType=${instanceType}, ttlHours=${ttlHours}
Pricing estimate: $${hourlyCost}/hour, total ~$${totalExpected.toFixed(4)}

Analyze this request. Should we APPROVE or REJECT? Respond with JSON.`;

    const startTime = Date.now();

    // Try primary model first, then fallback if configured
    const modelsToTry = [this.model];
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      modelsToTry.push(this.fallbackModel);
    }

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const isFallback = i > 0;

      if (isFallback) {
        this.logger.warn(
          `Primary model "${modelsToTry[0]}" failed, retrying with fallback model "${currentModel}"`,
        );
      } else {
        this.logger.log(`Sending prompt to Ollama model: ${currentModel}`);
      }

      try {
        const decision = await this.callOllama(
          currentModel,
          augmentedSystemPrompt,
          userMessage,
          hourlyCost,
          totalExpected,
        );

        const durationMs = Date.now() - startTime;

        if (isFallback) {
          this.logger.warn(
            `Fallback model "${currentModel}" succeeded after ${durationMs}ms`,
          );
        } else {
          this.logger.log(
            `LLM decision completed in ${durationMs}ms: ${decision.decision}`,
          );
        }

        return {
          decision: { ...decision, fallbackUsed: isFallback },
          durationMs,
          fallbackUsed: isFallback,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown LLM error';

        if (i < modelsToTry.length - 1) {
          this.logger.warn(
            `Model "${currentModel}" failed (${message}), trying fallback...`,
          );
          continue;
        }

        // All models exhausted — fail closed
        const durationMs = Date.now() - startTime;
        this.logger.error(
          `All LLM models failed after ${durationMs}ms. Last error: ${message}`,
        );

        return {
          decision: {
            decision: 'REJECT',
            reasoning: `LLM unavailable, request rejected for safety. Original error: ${message}`,
            config: {
              instanceType,
              ttlHours: Math.min(ttlHours, 2),
              region: this.region,
            },
            costAnalysis: { estimatedHourly: hourlyCost, totalExpected },
            fallbackUsed: isFallback,
          },
          durationMs,
          fallbackUsed: isFallback,
        };
      }
    }

    // Should never reach here, but TypeScript needs it
    const durationMs = Date.now() - startTime;
    return {
      decision: {
        decision: 'REJECT',
        reasoning: 'LLM unavailable, request rejected for safety.',
        config: {
          instanceType,
          ttlHours: Math.min(ttlHours, 2),
          region: this.region,
        },
        costAnalysis: { estimatedHourly: hourlyCost, totalExpected },
        fallbackUsed: false,
      },
      durationMs,
      fallbackUsed: false,
    };
  }

  private async callOllama(
    model: string,
    systemPrompt: string,
    userMessage: string,
    hourlyCost: number,
    totalExpected: number,
  ): Promise<AgentDecision> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          format: 'json',
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API returned ${response.status}: ${await response.text()}`,
        );
      }

      const data = (await response.json()) as { message: { content: string } };
      const content = data.message?.content ?? '';

      this.logger.debug(`Ollama raw response: ${content}`);

      const parsed = JSON.parse(content) as Record<string, unknown>;

      if (!parsed.costAnalysis) {
        parsed.costAnalysis = { estimatedHourly: hourlyCost, totalExpected };
      }

      return AgentDecisionSchema.parse(parsed);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Ollama request timed out after ${this.timeoutMs}ms for model "${model}"`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private formatStaticPricingTable(): string {
    return Object.entries(PRICING_TABLE)
      .map(([type, cost]) => `- ${type}: $${cost.toFixed(4)}/hour`)
      .join('\n');
  }
}
