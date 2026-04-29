import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  AgentMetricsService,
  type FinOpsMetrics,
} from './agent-metrics.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('Metrics')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: AgentMetricsService) {}

  @Get('finops')
  @ApiOperation({
    summary: 'Get FinOps agent metrics',
    description:
      'Returns aggregated metrics for agent decisions, guardrails blocks, LLM fallback usage, latency, and cost tracking.',
  })
  @ApiResponse({
    status: 200,
    description: 'FinOps metrics snapshot',
    schema: {
      example: {
        decisions: {
          approveCount: 12,
          rejectCount: 3,
          approveRate: 80,
          total: 15,
        },
        guardrails: {
          blockCount: 2,
          instanceTypeBlockCount: 1,
          concurrencyBlockCount: 1,
        },
        llm: {
          fallbackUsedCount: 1,
          fallbackRate: 6.67,
          avgDecisionLatencyMs: 1240,
          p95DecisionLatencyMs: 3100,
        },
        cost: {
          totalEstimatedCostUsd: 0.0312,
          totalIncurredCostUsd: 0.0208,
          avgHourlyCostUsd: 0.0104,
        },
        environments: {
          activeCount: 1,
          destroyedCount: 11,
          failedCount: 3,
          totalCount: 15,
        },
        generatedAt: '2025-04-25T10:00:00.000Z',
      },
    },
  })
  async getFinOpsMetrics(): Promise<FinOpsMetrics> {
    return this.metricsService.getFinOpsMetrics();
  }
}
