import { Module } from '@nestjs/common';
import { SandboxEnvController } from './sandbox-env.controller';
import { SandboxEnvService } from './sandbox-env.service';
import { SandboxEnvRepository } from './sandbox-env.repository';
import { AwsEc2Module } from '../aws-ec2/aws-ec2.module';
import { LlmModule } from '../llm/llm.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { ActionLogModule } from '../action-log/action-log.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    AwsEc2Module,
    LlmModule,
    GuardrailsModule,
    ActionLogModule,
    PricingModule,
  ],
  controllers: [SandboxEnvController],
  providers: [SandboxEnvService, SandboxEnvRepository],
  exports: [SandboxEnvService, SandboxEnvRepository],
})
export class SandboxEnvModule {}
