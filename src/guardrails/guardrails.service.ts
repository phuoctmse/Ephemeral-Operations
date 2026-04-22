import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';
import { ALLOWED_INSTANCE_TYPES } from '../common/constants/finops.constants';
import {
  UnauthorizedInstanceTypeError,
  ConcurrencyLimitError,
  TtlExceededError,
} from '../common/exceptions/finops.exceptions';

@Injectable()
export class GuardrailsService {
  private readonly maxConcurrentEnvs: number;
  private readonly maxTtlHours: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly sandboxEnvRepo: SandboxEnvRepository,
  ) {
    this.maxConcurrentEnvs = this.configService.get<number>('app.maxConcurrentEnvs', 2);
    this.maxTtlHours = this.configService.get<number>('app.maxTtlHours', 2);
  }

  validateInstanceType(instanceType: string): void {
    if (!ALLOWED_INSTANCE_TYPES.includes(instanceType as typeof ALLOWED_INSTANCE_TYPES[number])) {
      throw new UnauthorizedInstanceTypeError(instanceType);
    }
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
