import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/app-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { SandboxEnvModule } from './sandbox-env/sandbox-env.module';
import { ActionLogModule } from './action-log/action-log.module';
import { LlmModule } from './llm/llm.module';
import { AwsEc2Module } from './aws-ec2/aws-ec2.module';
import { GuardrailsModule } from './guardrails/guardrails.module';
import { CleanupWorkerModule } from './cleanup-worker/cleanup-worker.module';
import { PricingModule } from './pricing/pricing.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    SandboxEnvModule,
    ActionLogModule,
    LlmModule,
    AwsEc2Module,
    GuardrailsModule,
    CleanupWorkerModule,
    PricingModule,
  ],
})
export class AppModule {}
