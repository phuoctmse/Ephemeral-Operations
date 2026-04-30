import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';
import { ALLOWED_INSTANCE_TYPES } from '../common/constants/finops.constants';
import {
  UnauthorizedInstanceTypeError,
  UnrecognizedInstanceTypeError,
  UnresolvableTtlError,
  ConcurrencyLimitError,
  TtlExceededError,
} from '../common/exceptions/finops.exceptions';
import { type ExtractedIntent } from '../common/schemas/extracted-intent.schema';
import appConfig from '../common/config/app.config';

@Injectable()
export class GuardrailsService {
  private readonly maxConcurrentEnvs: number;
  private readonly maxTtlHours: number;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly sandboxEnvRepo: SandboxEnvRepository,
  ) {
    this.maxConcurrentEnvs = this.config.maxConcurrentEnvs;
    this.maxTtlHours = this.config.maxTtlHours;
  }

  validateInstanceType(instanceType: string): void {
    if (
      !ALLOWED_INSTANCE_TYPES.includes(
        instanceType as (typeof ALLOWED_INSTANCE_TYPES)[number],
      )
    ) {
      throw new UnauthorizedInstanceTypeError(instanceType);
    }
  }

  validateIntent(intent: ExtractedIntent): void {
    if (intent.instanceType === null) {
      throw new UnrecognizedInstanceTypeError(intent.rawRequest);
    }

    if (intent.ttlHours === null) {
      throw new UnresolvableTtlError();
    }

    // Re-use existing hard checks on the resolved values
    this.validateInstanceType(intent.instanceType);
    this.enforceTtl(intent.ttlHours);
  }

  async validateConcurrency(): Promise<void> {
    const runningCount = await this.sandboxEnvRepo.countRunning();
    if (runningCount >= this.maxConcurrentEnvs) {
      throw new ConcurrencyLimitError(this.maxConcurrentEnvs);
    }
  }

  enforceTtl(ttlHours: number): number {
    if (ttlHours > this.maxTtlHours) {
      throw new TtlExceededError(ttlHours, this.maxTtlHours);
    }
    return Math.min(ttlHours, this.maxTtlHours);
  }

  overrideTtl(ttlHours: number): number {
    return Math.min(ttlHours, this.maxTtlHours);
  }
}
