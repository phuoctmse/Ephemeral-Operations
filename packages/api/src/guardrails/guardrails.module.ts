import { Module } from '@nestjs/common';
import { GuardrailsService } from './guardrails.service';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';

@Module({
  providers: [GuardrailsService, SandboxEnvRepository],
  exports: [GuardrailsService],
})
export class GuardrailsModule {}
