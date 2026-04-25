import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SandboxEnvRepository } from './sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { OllamaService } from '../llm/ollama.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ActionLogRepository } from '../action-log/action-log.repository';
import { CreateSandboxEnvDto } from './dto/sandbox-env.dto';
import { PRICING_TABLE } from '../common/constants/finops.constants';
import { ProvisioningError } from '../common/exceptions/finops.exceptions';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';

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
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async provision(dto: CreateSandboxEnvDto) {
    const instanceType = dto.instanceType ?? 't3.micro';
    const maxTtl = this.configService.get<number>('app.maxTtlHours', 2);
    const requestedTtl = dto.ttlHours ?? 1;
    const ttlHours = Math.min(requestedTtl, maxTtl);
    const region = this.configService.get<string>('app.awsRegion', 'us-east-1');

    let hourlyCost: number;
    try {
      hourlyCost = await this.pricingService.getHourlyCost(
        instanceType,
        region,
      );
    } catch {
      hourlyCost = PRICING_TABLE[instanceType] ?? 0;
    }
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Guardrails: instance type check (no DB needed, safe to run outside transaction)
    try {
      this.guardrailsService.validateInstanceType(instanceType);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown guardrails error';
      this.logger.warn(`Guardrails blocked request: ${message}`);

      // Persist guardrails block — create a minimal env record to attach the log
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

    // Guardrails: concurrency check + env creation in a single transaction to prevent race condition
    const env = await this.prisma
      .$transaction(async (tx) => {
        const maxConcurrent = this.configService.get<number>(
          'app.maxConcurrentEnvs',
          2,
        );
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

          // Persist concurrency block — needs a separate env record
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
      // Ask LLM for decision (with latency tracking)
      const llmResult = await this.llmService.analyzePrompt(
        dto.prompt,
        instanceType,
        ttlHours,
      );
      const { decision, durationMs, fallbackUsed } = llmResult;

      if (fallbackUsed) {
        this.logger.warn(
          `LLM fallback was used for env ${env.id} (durationMs=${durationMs})`,
        );
      }

      // Log AI reasoning with latency
      await this.actionLogRepo.create({
        envId: env.id,
        agentReasoning: decision.reasoning,
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ ...decision, fallbackUsed }),
        durationMs,
      });

      if (decision.decision === 'REJECT') {
        await this.repo.updateToFailed(env.id, decision.reasoning);
        return { ...env, status: 'FAILED', decision };
      }

      // Provision EC2 instance
      const instanceId = await this.ec2Service.runInstance(instanceType);

      // Tag the resource
      await this.ec2Service.createTags(instanceId, {
        Project: 'EphOps',
        EnvId: env.id,
      });

      // Update to RUNNING
      const updated = await this.repo.updateStatus(env.id, 'RUNNING', {
        resourceId: instanceId,
      });

      // Log provisioning
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
