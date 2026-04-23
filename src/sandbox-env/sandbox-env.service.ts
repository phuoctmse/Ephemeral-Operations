import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SandboxEnvRepository } from './sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { OllamaService } from '../llm/ollama.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ActionLogRepository } from '../action-log/action-log.repository';
import { CreateSandboxEnvDto } from './dto/sandbox-env.dto';
import { PRICING_TABLE } from '../common/constants/finops.constants';
import { ProvisioningError } from '../common/exceptions/finops.exceptions';
import type { AgentDecision } from '../common/schemas/agent-decision.schema';

@Injectable()
export class SandboxEnvService {
  private readonly logger = new Logger(SandboxEnvService.name);

  constructor(
    private readonly repo: SandboxEnvRepository,
    private readonly ec2Service: AwsEc2Service,
    private readonly llmService: OllamaService,
    private readonly guardrailsService: GuardrailsService,
    private readonly actionLogRepo: ActionLogRepository,
    private readonly configService: ConfigService,
  ) {}

  async provision(dto: CreateSandboxEnvDto) {
    const instanceType = dto.instanceType ?? 't3.micro';
    const maxTtl = this.configService.get<number>('app.maxTtlHours', 2);
    const requestedTtl = dto.ttlHours ?? 1;
    const ttlHours = Math.min(requestedTtl, maxTtl);
    const hourlyCost = PRICING_TABLE[instanceType] ?? 0;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Guardrails: pre-condition checks
    this.guardrailsService.validateInstanceType(instanceType);
    await this.guardrailsService.validateConcurrency();

    // Create DB record in CREATING state
    const env = await this.repo.create({
      prompt: dto.prompt,
      instanceType,
      expiresAt,
      hourlyCost,
    });

    try {
      // Ask LLM for decision
      const decision: AgentDecision = await this.llmService.analyzePrompt(
        dto.prompt,
        instanceType,
        ttlHours,
      );

      // Log AI reasoning
      await this.actionLogRepo.create({
        envId: env.id,
        agentReasoning: decision.reasoning,
        toolCalled: 'log_reasoning',
        output: JSON.stringify(decision),
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

      // Rollback: update status to FAILED
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

    // Calculate cost incurred
    const hoursElapsed =
      (Date.now() - env.createdAt.getTime()) / (1000 * 60 * 60);
    const costIncurred = Number((hoursElapsed * env.hourlyCost).toFixed(6));

    return this.repo.updateStatus(id, 'DESTROYED', { costIncurred });
  }
}
