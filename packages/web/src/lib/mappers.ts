import type { Environment, ActionLog, Metrics } from '@ephops/shared-types'

// Backend DTO types
export interface SandboxEnvResponseDto {
  id: string
  prompt: string
  status: 'CREATING' | 'RUNNING' | 'FAILED' | 'DESTROYED'
  costIncurred: number
  instanceType: string
  createdAt: string | Date
  expiresAt?: string | Date
}

export interface ActionLogResponseDto {
  id: string
  envId: string
  agentReasoning: string
  toolCalled: string
  output: string // JSON string
  timestamp: string | Date
}

export interface FinOpsMetrics {
  cost: {
    totalIncurredCostUsd: number
  }
  llm: {
    avgDecisionLatencyMs: number | null
  }
  environments: {
    totalCount: number
    activeCount: number
  }
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

export function mapSandboxEnvToEnvironment(dto: SandboxEnvResponseDto): Environment {
  return {
    id: dto.id,
    name: dto.prompt,
    state: dto.status,
    cost: dto.costIncurred,
    region: dto.instanceType,
    instanceCount: 1,
    agentReasoning: '',
    createdAt: toIsoString(dto.createdAt),
    destroyedAt:
      dto.status === 'DESTROYED' && dto.expiresAt !== undefined
        ? toIsoString(dto.expiresAt)
        : undefined,
  }
}

export function mapActionLogResponseToActionLog(dto: ActionLogResponseDto): ActionLog {
  let output: Record<string, unknown> = {}
  try {
    output = JSON.parse(dto.output) as Record<string, unknown>
  } catch {
    output = {}
  }

  return {
    id: dto.id,
    envId: dto.envId,
    agentReasoning: dto.agentReasoning,
    toolCalled: dto.toolCalled,
    output,
    createdAt: toIsoString(dto.timestamp),
    durationMs: 0,
  }
}

export function mapFinOpsMetricsToMetrics(dto: FinOpsMetrics): Metrics {
  return {
    totalCost: dto.cost.totalIncurredCostUsd,
    averageLatency: dto.llm.avgDecisionLatencyMs ?? 0,
    environmentCount: dto.environments.totalCount,
    activeAgents: dto.environments.activeCount,
  }
}
