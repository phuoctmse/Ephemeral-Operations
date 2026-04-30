import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AgentDecisionSchema,
  type AgentDecision,
} from '../common/schemas/agent-decision.schema';
import {
  ExtractedIntentSchema,
  type ExtractedIntent,
} from '../common/schemas/extracted-intent.schema';
import {
  PRICING_TABLE,
  MAX_TOTAL_EXPECTED_COST,
  type AllowedInstanceType,
} from '../common/constants/finops.constants';
import { PricingService } from '../pricing/pricing.service';
import { PolicyRetrieverService } from '../policy/policy-retriever.service';
import appConfig from '../common/config/app.config';

// ---------------------------------------------------------------------------
// Intent extraction — LLM parses natural language into structured intent.
// LLM does NOT approve or reject here; it only maps words to known types.
// ---------------------------------------------------------------------------
const INTENT_EXTRACTION_SYSTEM_PROMPT = `You are an infrastructure request parser.

Your ONLY job is to extract the EC2 instance type and TTL duration from the user's request.
You do NOT approve or reject requests. You do NOT make policy decisions.

## Known EC2 instance types (the ONLY valid values):
- t3.micro
- t4g.nano

## Rules:
- If the user mentions a GPU, gaming hardware, "powerful machine", or any hardware that does
  not map to t3.micro or t4g.nano, set instanceType to null.
- If the user mentions "nvidia", "rtx", "gpu", "cuda", or any GPU brand, set instanceType to null.
- If no TTL is mentioned, set ttlHours to null.
- Set confidence to "high" if both fields are clearly stated, "low" otherwise.
- rawRequest should be a brief technical restatement of what the user asked for.

## Response format (JSON only, no other text):
{
  "instanceType": "t3.micro" | "t4g.nano" | null,
  "ttlHours": number | null,
  "confidence": "high" | "low",
  "rawRequest": "brief technical interpretation"
}`;

const DECISION_SYSTEM_PROMPT = `You are a FinOps Infrastructure Agent. Your job is to evaluate infrastructure requests and respond with a JSON decision.

## APPROVED instance types (ONLY these two are allowed):
- t3.micro
- t4g.nano

## APPROVED TTL range: 0.5 hours to MAX_TTL_HOURS hours

## APPROVED cost limit: $MAX_COST_LIMIT USD total per request

## Current EC2 pricing (USD/hour):
PRICING_TABLE_PLACEHOLDER

## Examples of correct decisions:

Request: instanceType=t3.micro, ttlHours=1, totalCost=$0.0104
All checks: instanceType=t3.micro [ALLOWED] | ttlHours=1 [IN RANGE 0.5-2] | cost=$0.0104 [UNDER $0.025]
Decision: APPROVE

Request: instanceType=m5.xlarge, ttlHours=1, totalCost=$0.19
All checks: instanceType=m5.xlarge [NOT ALLOWED]
Decision: REJECT

Request: instanceType=t3.micro, ttlHours=5, totalCost=$0.052
All checks: instanceType=t3.micro [ALLOWED] | ttlHours=5 [EXCEEDS MAX 2] | cost=$0.052 [EXCEEDS $0.025]
Decision: REJECT

## Response format (JSON only, no other text):
{
  "decision": "APPROVE" or "REJECT",
  "reasoning": "brief explanation referencing the checks above",
  "config": {
    "instanceType": "t3.micro" or "t4g.nano",
    "ttlHours": number,
    "region": "us-east-1"
  },
  "costAnalysis": {
    "estimatedHourly": number,
    "totalExpected": number
  }
}`;

const INTENT_EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    instanceType: {
      oneOf: [
        { type: 'string', enum: ['t3.micro', 't4g.nano'] },
        { type: 'null' },
      ],
    },
    ttlHours: {
      oneOf: [{ type: 'number' }, { type: 'null' }],
    },
    confidence: {
      type: 'string',
      enum: ['high', 'low'],
    },
    rawRequest: { type: 'string' },
  },
  required: ['instanceType', 'ttlHours', 'confidence', 'rawRequest'],
};

const AGENT_DECISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: ['APPROVE', 'REJECT'],
    },
    reasoning: {
      type: 'string',
    },
    config: {
      type: 'object',
      properties: {
        instanceType: {
          type: 'string',
          enum: ['t3.micro', 't4g.nano'],
        },
        ttlHours: {
          type: 'number',
        },
        region: {
          type: 'string',
        },
      },
      required: ['instanceType', 'ttlHours', 'region'],
    },
    costAnalysis: {
      type: 'object',
      properties: {
        estimatedHourly: { type: 'number' },
        totalExpected: { type: 'number' },
      },
      required: ['estimatedHourly', 'totalExpected'],
    },
  },
  required: ['decision', 'reasoning', 'config', 'costAnalysis'],
};

export interface LlmAnalysisResult {
  decision: AgentDecision;
  durationMs: number;
  fallbackUsed: boolean;
}

export interface LlmIntentResult {
  intent: ExtractedIntent;
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
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly pricingService: PricingService,
    private readonly policyRetriever: PolicyRetrieverService,
  ) {
    this.baseUrl = this.config.ollamaBaseUrl;
    this.model = this.config.ollamaModel;
    this.fallbackModel = this.config.ollamaFallbackModel;
    this.timeoutMs = this.config.ollamaTimeoutMs;
    this.region = this.config.awsRegion;
  }

  async extractIntent(prompt: string): Promise<LlmIntentResult> {
    const startTime = Date.now();
    const modelsToTry = this.getModelsToTry();

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const isFallback = i > 0;

      if (isFallback) {
        this.logger.warn(
          `Primary model "${modelsToTry[0]}" failed for intent extraction, retrying with "${currentModel}"`,
        );
      } else {
        this.logger.log(
          `Extracting intent from prompt using model: ${currentModel}`,
        );
      }

      try {
        const intent = await this.callOllamaForIntent(
          currentModel,
          INTENT_EXTRACTION_SYSTEM_PROMPT,
          prompt,
        );

        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Intent extracted in ${durationMs}ms: instanceType=${intent.instanceType ?? 'null'}, ttlHours=${intent.ttlHours ?? 'null'}, confidence=${intent.confidence}`,
        );

        return { intent, durationMs, fallbackUsed: isFallback };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown LLM error';

        if (i < modelsToTry.length - 1) {
          this.logger.warn(
            `Model "${currentModel}" failed intent extraction (${message}), trying fallback...`,
          );
          continue;
        }

        // All models exhausted — fail closed: treat as unrecognized intent
        const durationMs = Date.now() - startTime;
        this.logger.error(
          `All LLM models failed intent extraction after ${durationMs}ms. Last error: ${message}`,
        );

        // Return null intent so guardrails reject it
        return {
          intent: {
            instanceType: null,
            ttlHours: null,
            confidence: 'low',
            rawRequest: `LLM unavailable: ${message}`,
          },
          durationMs,
          fallbackUsed: isFallback,
        };
      }
    }

    // Should never reach here
    return {
      intent: {
        instanceType: null,
        ttlHours: null,
        confidence: 'low',
        rawRequest: 'LLM unavailable',
      },
      durationMs: Date.now() - startTime,
      fallbackUsed: false,
    };
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

    const systemPrompt = DECISION_SYSTEM_PROMPT.replace(
      'PRICING_TABLE_PLACEHOLDER',
      pricingContext,
    )
      .replace('MAX_TTL_HOURS', String(this.config.maxTtlHours))
      .replace('MAX_COST_LIMIT', MAX_TOTAL_EXPECTED_COST.toFixed(3));

    const policyContext = this.policyRetriever.buildContextSnippet(prompt);
    const augmentedSystemPrompt = policyContext
      ? systemPrompt + '\n\n## Relevant Policy Context\n' + policyContext
      : systemPrompt;

    const instanceAllowed =
      instanceType === 't3.micro' || instanceType === 't4g.nano';
    const ttlInRange = ttlHours >= 0.5 && ttlHours <= this.config.maxTtlHours;
    const costUnderLimit = totalExpected <= MAX_TOTAL_EXPECTED_COST;
    const allChecksPassed = instanceAllowed && ttlInRange && costUnderLimit;

    const instanceCheck = instanceAllowed
      ? '[ALLOWED] (in approved list)'
      : '[NOT ALLOWED] (not in approved list: t3.micro, t4g.nano)';

    const ttlCheck = ttlInRange
      ? '[IN RANGE] (' +
        ttlHours +
        ' is between 0.5 and ' +
        this.config.maxTtlHours +
        ')'
      : '[OUT OF RANGE] (' +
        ttlHours +
        ' is outside 0.5-' +
        this.config.maxTtlHours +
        ')';

    const costCheck = costUnderLimit
      ? '[UNDER LIMIT] (' +
        totalExpected.toFixed(4) +
        ' <= ' +
        MAX_TOTAL_EXPECTED_COST.toFixed(3) +
        ')'
      : '[EXCEEDS LIMIT] (' +
        totalExpected.toFixed(4) +
        ' > ' +
        MAX_TOTAL_EXPECTED_COST.toFixed(3) +
        ')';

    const userMessage =
      'User request: "' +
      prompt +
      '"\n\n' +
      '## Pre-computed policy checks for this request:\n' +
      '- instanceType: ' +
      instanceType +
      ' -> ' +
      instanceCheck +
      '\n' +
      '- ttlHours: ' +
      ttlHours +
      ' -> ' +
      ttlCheck +
      '\n' +
      '- totalCost: ' +
      totalExpected.toFixed(4) +
      ' -> ' +
      costCheck +
      '\n\n' +
      'All checks passed: ' +
      (allChecksPassed
        ? 'YES -> decision should be APPROVE'
        : 'NO -> decision should be REJECT') +
      '\n\n' +
      'Respond with JSON decision.';

    const startTime = Date.now();
    const modelsToTry = this.getModelsToTry();

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
          instanceType,
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

    // Should never reach here
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

  private getModelsToTry(): string[] {
    const models = [this.model];
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      models.push(this.fallbackModel);
    }
    return models;
  }

  private async callOllamaForIntent(
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<ExtractedIntent> {
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
            { role: 'user', content: userPrompt },
          ],
          format: INTENT_EXTRACTION_JSON_SCHEMA,
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

      this.logger.debug(`Ollama intent extraction raw response: ${content}`);

      const parsed = JSON.parse(content) as Record<string, unknown>;
      const intent = ExtractedIntentSchema.parse(parsed);

      if (intent.confidence === 'low') {
        this.logger.warn(
          `Low-confidence intent extraction for prompt: "${userPrompt.slice(0, 80)}"`,
        );
      }

      return intent;
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

  private async callOllama(
    model: string,
    systemPrompt: string,
    userMessage: string,
    requestedInstanceType: string,
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
          format: AGENT_DECISION_JSON_SCHEMA,
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

      const decision = AgentDecisionSchema.parse(parsed);

      // Semantic Consistency Validation — catches hallucinations that pass schema
      // but contradict the input context.
      this.validateSemanticConsistency(
        decision,
        requestedInstanceType,
        totalExpected,
      );

      return decision;
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

  private validateSemanticConsistency(
    decision: AgentDecision,
    requestedInstanceType: string,
    totalExpected: number,
  ): void {
    if (
      decision.decision === 'APPROVE' &&
      decision.costAnalysis !== undefined &&
      decision.costAnalysis.totalExpected > MAX_TOTAL_EXPECTED_COST
    ) {
      this.logger.warn(
        'Semantic inconsistency: LLM approved but reported cost ' +
          decision.costAnalysis.totalExpected.toFixed(4) +
          ' exceeds limit ' +
          MAX_TOTAL_EXPECTED_COST.toFixed(3) +
          '. Correcting costAnalysis to actual computed value.',
      );
      decision.costAnalysis.totalExpected = totalExpected;
    }

    if (
      decision.config !== undefined &&
      decision.config.instanceType !== requestedInstanceType
    ) {
      this.logger.warn(
        'Config drift detected: requested ' +
          requestedInstanceType +
          ', LLM returned ' +
          decision.config.instanceType +
          '. Correcting to requested value.',
      );
      decision.config.instanceType = requestedInstanceType as
        | 't3.micro'
        | 't4g.nano';
    }

    if (decision.reasoning.trim().length < 15) {
      this.logger.warn(
        'Suspiciously short LLM reasoning (' +
          decision.reasoning.trim().length +
          ' chars): "' +
          decision.reasoning +
          '". Model may have produced degenerate output.',
      );
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
      .map(([type, cost]) => `- ${type}: ${cost.toFixed(4)}/hour`)
      .join('\n');
  }
}
