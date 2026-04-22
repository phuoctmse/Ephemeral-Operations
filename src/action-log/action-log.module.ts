import { Module } from '@nestjs/common';
import { ActionLogController } from './action-log.controller';
import { ActionLogService } from './action-log.service';
import { ActionLogRepository } from './action-log.repository';

@Module({
  controllers: [ActionLogController],
  providers: [ActionLogService, ActionLogRepository],
  exports: [ActionLogService, ActionLogRepository],
})
export class ActionLogModule {}
