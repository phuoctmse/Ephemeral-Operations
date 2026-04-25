import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FinOpsMetrics {
  decisions: {
    approveCount: number;
    rejectCount: number;
    approveRate: number;
    total: number;
  };
  guardrails: {
    blockCount: number;
    instanceTypeBlockCount: number;
    concurrencyBlockCount: number;
  };
  llm: {
    fallbackUsedCount: number;
    fallbackRate: number;
    avgDecisionLatencyMs: number | null;
    p95DecisionLatencyMs: number | null;
  };
  cost: {
    totalEstimatedCostUsd: number;
    totalIncurredCostUsd: number;
    avgHourlyCostUsd: number | null;
  };
  environments: {
    activeCount: number;
    destroyedCount: number;
    failedCount: number;
    totalCount: number;
  };
  generatedAt: string;
}

@Injectable()
export class AgentMetricsService {
  private readonly logger = new Logger(AgentMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getFinOpsMetrics(): Promise<FinOpsMetrics> {
    const [envStats, actionLogs] = await Promise.all([
      this.prisma.sandboxEnv.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { hourlyCost: true, costIncurred: true },
        _avg: { hourlyCost: true },
      }),
      this.prisma.actionLog.findMany({
        select: {
          toolCalled: true,
          output: true,
          durationMs: true,
        },
      }),
    ]);

    // Environment counts
    const envCountByStatus = Object.fromEntries(
      envStats.map((s) => [s.status, s._count.id]),
    );
    const activeCount = envCountByStatus['RUNNING'] ?? 0;
    const destroyedCount = envCountByStatus['DESTROYED'] ?? 0;
    const failedCount = envCountByStatus['FAILED'] ?? 0;
    const creatingCount = envCountByStatus['CREATING'] ?? 0;
    const totalCount =
      activeCount + destroyedCount + failedCount + creatingCount;

    // Cost aggregation
    const totalEstimatedCostUsd = envStats.reduce(
      (sum, s) => sum + (s._sum.hourlyCost ?? 0),
      0,
    );
    const totalIncurredCostUsd = envStats.reduce(
      (sum, s) => sum + (s._sum.costIncurred ?? 0),
      0,
    );
    const totalEnvCount = envStats.reduce((sum, s) => sum + s._count.id, 0);
    const avgHourlyCostUsd =
      totalEnvCount > 0 ? totalEstimatedCostUsd / totalEnvCount : null;

    // Decision metrics from action logs
    const reasoningLogs = actionLogs.filter(
      (l) => l.toolCalled === 'log_reasoning',
    );

    let approveCount = 0;
    let rejectCount = 0;
    let fallbackUsedCount = 0;
    const latencies: number[] = [];

    for (const log of reasoningLogs) {
      try {
        const parsed = JSON.parse(log.output) as {
          decision?: string;
          fallbackUsed?: boolean;
        };
        if (parsed.decision === 'APPROVE') approveCount++;
        if (parsed.decision === 'REJECT') rejectCount++;
        if (parsed.fallbackUsed === true) fallbackUsedCount++;
      } catch {
        // malformed log entry — skip
      }

      if (log.durationMs !== null && log.durationMs !== undefined) {
        latencies.push(log.durationMs);
      }
    }

    const totalDecisions = approveCount + rejectCount;
    const approveRate =
      totalDecisions > 0
        ? Math.round((approveCount / totalDecisions) * 10000) / 100
        : 0;
    const fallbackRate =
      totalDecisions > 0
        ? Math.round((fallbackUsedCount / totalDecisions) * 10000) / 100
        : 0;

    // Latency stats
    let avgDecisionLatencyMs: number | null = null;
    let p95DecisionLatencyMs: number | null = null;
    if (latencies.length > 0) {
      avgDecisionLatencyMs = Math.round(
        latencies.reduce((a, b) => a + b, 0) / latencies.length,
      );
      const sorted = [...latencies].sort((a, b) => a - b);
      const p95Index = Math.max(
        0,
        Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1),
      );
      p95DecisionLatencyMs = sorted[p95Index];
    }

    // Guardrails block counts
    const guardrailsInstanceTypeLogs = actionLogs.filter(
      (l) => l.toolCalled === 'guardrails_block',
    );
    const guardrailsConcurrencyLogs = actionLogs.filter(
      (l) => l.toolCalled === 'guardrails_concurrency_block',
    );
    const instanceTypeBlockCount = guardrailsInstanceTypeLogs.length;
    const concurrencyBlockCount = guardrailsConcurrencyLogs.length;
    const blockCount = instanceTypeBlockCount + concurrencyBlockCount;

    return {
      decisions: {
        approveCount,
        rejectCount,
        approveRate,
        total: totalDecisions,
      },
      guardrails: {
        blockCount,
        instanceTypeBlockCount,
        concurrencyBlockCount,
      },
      llm: {
        fallbackUsedCount,
        fallbackRate,
        avgDecisionLatencyMs,
        p95DecisionLatencyMs,
      },
      cost: {
        totalEstimatedCostUsd: Math.round(totalEstimatedCostUsd * 1e6) / 1e6,
        totalIncurredCostUsd: Math.round(totalIncurredCostUsd * 1e6) / 1e6,
        avgHourlyCostUsd:
          avgHourlyCostUsd !== null
            ? Math.round(avgHourlyCostUsd * 1e6) / 1e6
            : null,
      },
      environments: {
        activeCount,
        destroyedCount,
        failedCount,
        totalCount,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
