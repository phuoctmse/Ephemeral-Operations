import { Test, TestingModule } from '@nestjs/testing';
import { AgentMetricsService } from './agent-metrics.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  sandboxEnv: {
    groupBy: jest.fn(),
  },
  actionLog: {
    findMany: jest.fn(),
  },
};

describe('AgentMetricsService', () => {
  let service: AgentMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMetricsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AgentMetricsService>(AgentMetricsService);
    jest.clearAllMocks();
  });

  it('should return zero metrics when no data exists', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([]);
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const metrics = await service.getFinOpsMetrics();

    expect(metrics.decisions.approveCount).toBe(0);
    expect(metrics.decisions.rejectCount).toBe(0);
    expect(metrics.decisions.approveRate).toBe(0);
    expect(metrics.guardrails.blockCount).toBe(0);
    expect(metrics.llm.fallbackUsedCount).toBe(0);
    expect(metrics.llm.avgDecisionLatencyMs).toBeNull();
    expect(metrics.cost.totalIncurredCostUsd).toBe(0);
    expect(metrics.environments.totalCount).toBe(0);
  });

  it('should correctly count approve/reject decisions', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([]);
    mockPrisma.actionLog.findMany.mockResolvedValue([
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE', fallbackUsed: false }),
        durationMs: 1000,
      },
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE', fallbackUsed: false }),
        durationMs: 2000,
      },
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'REJECT', fallbackUsed: false }),
        durationMs: 500,
      },
    ]);

    const metrics = await service.getFinOpsMetrics();

    expect(metrics.decisions.approveCount).toBe(2);
    expect(metrics.decisions.rejectCount).toBe(1);
    expect(metrics.decisions.total).toBe(3);
    expect(metrics.decisions.approveRate).toBeCloseTo(66.67, 1);
  });

  it('should track fallback usage', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([]);
    mockPrisma.actionLog.findMany.mockResolvedValue([
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE', fallbackUsed: true }),
        durationMs: 3000,
      },
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE', fallbackUsed: false }),
        durationMs: 1000,
      },
    ]);

    const metrics = await service.getFinOpsMetrics();

    expect(metrics.llm.fallbackUsedCount).toBe(1);
    expect(metrics.llm.fallbackRate).toBe(50);
  });

  it('should calculate latency stats correctly', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([]);
    mockPrisma.actionLog.findMany.mockResolvedValue([
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE' }),
        durationMs: 1000,
      },
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE' }),
        durationMs: 2000,
      },
      {
        toolCalled: 'log_reasoning',
        output: JSON.stringify({ decision: 'APPROVE' }),
        durationMs: 3000,
      },
    ]);

    const metrics = await service.getFinOpsMetrics();

    expect(metrics.llm.avgDecisionLatencyMs).toBe(2000);
    expect(metrics.llm.p95DecisionLatencyMs).toBeDefined();
  });

  it('should count guardrails blocks by type', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([]);
    mockPrisma.actionLog.findMany.mockResolvedValue([
      {
        toolCalled: 'guardrails_block',
        output: JSON.stringify({ reason: 'invalid_instance_type' }),
        durationMs: null,
      },
      {
        toolCalled: 'guardrails_concurrency_block',
        output: JSON.stringify({ reason: 'concurrency_limit_exceeded' }),
        durationMs: null,
      },
      {
        toolCalled: 'guardrails_concurrency_block',
        output: JSON.stringify({ reason: 'concurrency_limit_exceeded' }),
        durationMs: null,
      },
    ]);

    const metrics = await service.getFinOpsMetrics();

    expect(metrics.guardrails.blockCount).toBe(3);
    expect(metrics.guardrails.instanceTypeBlockCount).toBe(1);
    expect(metrics.guardrails.concurrencyBlockCount).toBe(2);
  });

  it('should aggregate cost from environment stats', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([
      {
        status: 'RUNNING',
        _count: { id: 1 },
        _sum: { hourlyCost: 0.0104, costIncurred: 0.0052 },
        _avg: { hourlyCost: 0.0104 },
      },
      {
        status: 'DESTROYED',
        _count: { id: 2 },
        _sum: { hourlyCost: 0.0208, costIncurred: 0.0156 },
        _avg: { hourlyCost: 0.0104 },
      },
    ]);
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const metrics = await service.getFinOpsMetrics();

    expect(metrics.cost.totalEstimatedCostUsd).toBeCloseTo(0.0312, 4);
    expect(metrics.cost.totalIncurredCostUsd).toBeCloseTo(0.0208, 4);
    expect(metrics.environments.activeCount).toBe(1);
    expect(metrics.environments.destroyedCount).toBe(2);
    expect(metrics.environments.totalCount).toBe(3);
  });

  it('should handle malformed action log output gracefully', async () => {
    mockPrisma.sandboxEnv.groupBy.mockResolvedValue([]);
    mockPrisma.actionLog.findMany.mockResolvedValue([
      {
        toolCalled: 'log_reasoning',
        output: 'not valid json {{{',
        durationMs: 1000,
      },
    ]);

    // Should not throw
    const metrics = await service.getFinOpsMetrics();
    expect(metrics.decisions.total).toBe(0);
  });
});
