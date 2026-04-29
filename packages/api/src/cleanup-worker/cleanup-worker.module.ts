import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupWorkerService } from './cleanup-worker.service';
import { SandboxEnvModule } from '../sandbox-env/sandbox-env.module';
import { AwsEc2Module } from '../aws-ec2/aws-ec2.module';
import { ActionLogModule } from '../action-log/action-log.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SandboxEnvModule,
    AwsEc2Module,
    ActionLogModule,
  ],
  providers: [CleanupWorkerService],
})
export class CleanupWorkerModule {}
