import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { ActionLogRepository } from '../action-log/action-log.repository';

@Injectable()
export class CleanupWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupWorkerService.name);

  constructor(
    private readonly sandboxEnvRepo: SandboxEnvRepository,
    private readonly ec2Service: AwsEc2Service,
    private readonly actionLogRepo: ActionLogRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      'Cleanup worker initialized. Running startup reconciliation and then every 5 minutes.',
    );
    await this.runCleanup('startup').catch((error: unknown) => {
      this.logger.error(
        `Startup cleanup failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    });
  }

  onModuleDestroy(): void {
    this.logger.log('Cleanup worker shutting down.');
  }

  @Cron('*/5 * * * *')
  async handleCron(): Promise<void> {
    await this.runCleanup('cron');
  }

  private async runCleanup(source: 'startup' | 'cron'): Promise<void> {
    this.logger.log(
      source === 'startup'
        ? 'Running cleanup reconciliation on startup...'
        : 'Running cleanup cron job...',
    );

    try {
      const expiredEnvs = await this.sandboxEnvRepo.findExpiredRunning();

      if (expiredEnvs.length === 0) {
        this.logger.log('No expired environments found.');
        return;
      }

      this.logger.warn(
        `Found ${expiredEnvs.length} expired environment(s) to clean up.`,
      );

      for (const env of expiredEnvs) {
        try {
          // Terminate EC2 instance
          if (env.resourceId) {
            await this.ec2Service.terminateInstance(env.resourceId);
          }

          // Calculate cost incurred
          const hoursElapsed =
            (Date.now() - env.createdAt.getTime()) / (1000 * 60 * 60);
          const costIncurred = Number(
            (hoursElapsed * env.hourlyCost).toFixed(6),
          );

          // Update DB status
          await this.sandboxEnvRepo.updateStatus(env.id, 'DESTROYED', {
            costIncurred,
          });

          // Log the cleanup
          await this.actionLogRepo.create({
            envId: env.id,
            agentReasoning: `TTL expired at ${env.expiresAt.toISOString()}. Auto-cleanup triggered.`,
            toolCalled: 'cleanup_worker',
            output: `Terminated ${env.resourceId}, cost incurred: $${costIncurred}`,
          });

          this.logger.log(
            `Cleaned up environment ${env.id} (${env.resourceId})`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to clean up environment ${env.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Cleanup cron job failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }
}
