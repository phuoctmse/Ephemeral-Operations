import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { AgentMetricsService } from './agent-metrics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [AgentMetricsService],
  exports: [AgentMetricsService],
})
export class MetricsModule {}
