import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { SandboxEnvRepository } from './sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { OllamaService } from '../llm/ollama.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ActionLogRepository } from '../action-log/action-log.repository';
import { CreateSandboxEnvDto } from './dto/sandbox-env.dto';
import {
  MAX_TOTAL_EXPECTED_COST,
  PRICING_TABLE,
} from '../common/constants/finops.constants';
import {
  ProvisioningError,
  UnrecognizedInstanceTypeError,
  UnresolvableTtlError,
} from '../common/exceptions/finops.exceptions';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import appConfig from '../common/config/app.config';

@Injectable()
export class SandboxEnvService {
  private readonly logger = new Logger(SandboxEnvService.name);

  constructor(
    private readonly repo: SandboxEnvRepository,
    private readonly ec2Service: AwsEc2Service,
    private readonly llmService: OllamaService,
    private readonly guardrailsService: GuardrailsService,
    private readonly actionLogRepo: ActionLogRepository,
    private readonly pricingService: PricingService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly prisma: PrismaService,
  ) {}

  async provision(dto: CreateSandboxEnvDto) {
    const maxTtl = this.config.maxTtlHours;
    const region = this.config.awsRegion;

    let instanceType: string;
    let ttlHours: number;
    let intentExtractionLog: Record<string, unknown> | null = null;

    if (dto.instanceType) {
      instanceType = dto.instanceType;
      ttlHours = Math.min(dto.ttlHours ?? 1, maxTtl);
    } else {
      const llmIntentResult = await this.llmService.extractIntent(dto.prompt);
      const { intent, durationMs, fallbackUsed } = llmIntentResult;

      intentExtractionLog = {
        instanceType: intent.instanceType,
        ttlHours: intent.ttlHours,
        confidence: intent.confidence,
        rawRequest: intent.rawRequest,
        durationMs,
        fallbackUsed,
      };

      try {
        this.guardrailsService.validateIntent(intent);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown guardrails error';
        this.logger.warn(`Intent validation blocked request: ${message}`);

        const blockedEnv = await this.repo.create({
          prompt: dto.prompt,
          instanceType: intent.instanceType ?? 'unknown',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          hourlyCost: 0,
        });
        await this.repo.updateToFailed(blockedEnv.id, message);
        await this.actionLogRepo.create({
          envId: blockedEnv.id,
          agentReasoning: message,
          toolCalled: 'guardrails_intent_block',
          output: JSON.stringify({
            reason:
              error instanceof UnrecognizedInstanceTypeError
                ? 'unrecognized_instance_type'
                : error instanceof UnresolvableTtlError
                  ? 'unresolvable_ttl'
                  : 'intent_validation_failed',
            intentExtractionLog,
          }),
        });

        throw new BadRequestException({
          error:
            error instanceof UnrecognizedInstanceTypeError
              ? 'unrecognized_instance_type'
              : 'unresolvable_ttl',
          message,
        });
      }

      // At this point intent is valid — safe to unwrap
      instanceType = intent.instanceType!;
      ttlHours = Math.min(intent.ttlHours!, maxTtl);
    }

    let hourlyCost: number;
    try {
      hourlyCost = await this.pricingService.getHourlyCost(
        instanceType,
        region,
      );
    } catch {
      hourlyCost =
        PRICING_TABLE[instanceType as keyof typeof PRICING_TABLE] ?? 0;
    }
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const totalExpected = Number((hourlyCost * ttlHours).toFixed(6));
    const policyCompliant = this.isPolicyCompliant(ttlHours, totalExpected);

    try {
      this.guardrailsService.validateInstanceType(instanceType);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown guardrails error';
      this.logger.warn(`Guardrails blocked request: ${message}`);

      const blockedEnv = await this.repo.create({
        prompt: dto.prompt,
        instanceType,
        expiresAt,
        hourlyCost,
      });
      await this.repo.updateToFailed(blockedEnv.id, message);
      await this.actionLogRepo.create({
        envId: blockedEnv.id,
        agentReasoning: message,
        toolCalled: 'guardrails_block',
        output: JSON.stringify({
          reason: 'invalid_instance_type',
          instanceType,
        }),
      });

      throw new BadRequestException({
        error: 'invalid_instance_type',
        message,
        instanceType,
      });
    }

    const env = await this.prisma
      .$transaction(async (tx) => {
        const maxConcurrent = this.config.maxConcurrentEnvs;
        const admittedCount = await tx.sandboxEnv.count({
          where: { status: { in: ['RUNNING', 'CREATING'] } },
        });

        if (admittedCount >= maxConcurrent) {
          throw Object.assign(
            new Error(
              `Maximum concurrent environments (${maxConcurrent}) reached. Please destroy an existing environment first.`,
            ),
            { name: 'ConcurrencyLimitError', maxConcurrent },
          );
        }

        return tx.sandboxEnv.create({
          data: { prompt: dto.prompt, instanceType, expiresAt, hourlyCost },
        });
      })
      .catch(async (error) => {
        if (error instanceof Error && error.name === 'ConcurrencyLimitError') {
          this.logger.warn(`Guardrails blocked request: ${error.message}`);

          const blockedEnv = await this.repo.create({
            prompt: dto.prompt,
            instanceType,
            expiresAt,
            hourlyCost,
          });
          await this.repo.updateToFailed(blockedEnv.id, error.message);
          await this.actionLogRepo.create({
            envId: blockedEnv.id,
            agentReasoning: error.message,
            toolCalled: 'guardrails_concurrency_block',
            output: JSON.stringify({ reason: 'concurrency_limit_exceeded' }),
          });

          const maxConcurrent = (error as unknown as Record<string, unknown>)
            .maxConcurrent as number;
          throw new HttpException(
            {
              error: 'concurrency_limit_exceeded',
              message: error.message,
              maxConcurrent,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw error;
      });

    try {
      const llmResult = await this.llmService.analyzePrompt(
        dto.prompt,
        instanceType as 't3.micro' | 't4g.nano',
        ttlHours,
      );
      const { decision, durationMs, fallbackUsed } = llmResult;

      if (fallbackUsed) {
        this.logger.warn(
          `LLM fallback was used for env ${env.id} (durationMs=${durationMs})`,
        );
      }

      const finalDecision = policyCompliant
        ? decision.decision === 'REJECT'
          ? {
              ...decision,
              decision: 'APPROVE' as const,
              reasoning: `Provision approved. Policy check passed for ${instanceType} at ${ttlHours}h with estimated total ${totalExpected.toFixed(4)}.`,
              llmReasoning: decision.reasoning,
              config: {
                instanceType: instanceType as 't3.micro' | 't4g.nano',
                ttlHours,
                region,
              },
              costAnalysis: {
                estimatedHourly: hourlyCost,
                totalExpected,
              },
              guardrailsTriggered: false,
            }
          : decision
        : {
            ...decision,
            decision: 'REJECT' as const,
            reasoning: `Provision rejected by guardrails. Allowed instance types are t3.micro/t4g.nano, TTL must stay within 0.5-${maxTtl}h, and total expected cost must stay at or below ${MAX_TOTAL_EXPECTED_COST.toFixed(3)}.`,
            llmReasoning: decision.reasoning,
            config: {
              instanceType: instanceType as 't3.micro' | 't4g.nano',
              ttlHours,
              region,
            },
            costAnalysis: {
              estimatedHourly: hourlyCost,
              totalExpected,
            },
            guardrailsTriggered: true,
          };

      const policyOverride = policyCompliant && decision.decision === 'REJECT';
      await this.actionLogRepo.create({
        envId: env.id,
        agentReasoning: finalDecision.reasoning,
        toolCalled: 'log_reasoning',
        output: JSON.stringify({
          ...finalDecision,
          fallbackUsed,
          // Observability fields for hallucination rate monitoring
          policyOverride,
          llmRawDecision: decision.decision,
          llmRawReasoning: decision.reasoning,
          // Include intent extraction log if this was a prompt-only request
          ...(intentExtractionLog
            ? { intentExtraction: intentExtractionLog }
            : {}),
        }),
        durationMs,
      });

      if (finalDecision.decision === 'REJECT') {
        await this.repo.updateToFailed(env.id, finalDecision.reasoning);
        return { ...env, status: 'FAILED', decision: finalDecision };
      }

      const instanceId = await this.ec2Service.runInstance(instanceType);

      await this.ec2Service.createTags(instanceId, {
        Project: 'EphOps',
        EnvId: env.id,
      });

      const updated = await this.repo.updateStatus(env.id, 'RUNNING', {
        resourceId: instanceId,
      });

      await this.actionLogRepo.create({
        envId: env.id,
        agentReasoning: `Provisioned ${instanceType} with TTL ${ttlHours}h`,
        toolCalled: 'provision_resources',
        output: `InstanceId: ${instanceId}`,
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Provisioning failed for env ${env.id}: ${message}`);
      await this.repo.updateToFailed(env.id, message);
      throw new ProvisioningError(message);
    }
  }

  private isPolicyCompliant(ttlHours: number, totalExpected: number): boolean {
    return (
      ttlHours >= 0.5 &&
      ttlHours <= this.config.maxTtlHours &&
      totalExpected <= MAX_TOTAL_EXPECTED_COST
    );
  }

  async findAll() {
    return this.repo.findAll();
  }

  async findById(id: string) {
    const env = await this.repo.findById(id);
    if (!env) {
      throw new Error(`Environment with id "${id}" not found.`);
    }
    return env;
  }

  async terminate(id: string) {
    const env = await this.repo.findById(id);
    if (!env) {
      throw new Error(`Environment with id "${id}" not found.`);
    }
    if (!env.resourceId) {
      throw new Error(`Environment ${id} has no resourceId to terminate.`);
    }

    try {
      await this.ec2Service.terminateInstance(env.resourceId);
    } catch (error) {
      this.logger.warn(
        `EC2 terminate failed for ${env.resourceId}, marking as DESTROYED anyway: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    const hoursElapsed =
      (Date.now() - env.createdAt.getTime()) / (1000 * 60 * 60);
    const costIncurred = Number((hoursElapsed * env.hourlyCost).toFixed(6));

    return this.repo.updateStatus(id, 'DESTROYED', { costIncurred });
  }
}
