/**
 * Environment State Types
 */
export type EnvironmentState = 'CREATING' | 'RUNNING' | 'FAILED' | 'DESTROYED'

export interface Environment {
  id: string
  name: string
  state: EnvironmentState
  createdAt: string
  destroyedAt?: string
  resourceId?: string | null
  cost: number
  region: string
  instanceCount: number
  agentReasoning: string
}

/**
 * Metrics Types
 */
export interface Metrics {
  totalCost: number
  averageLatency: number
  environmentCount: number
  activeAgents: number
}

/**
 * Action Log Types
 */
export interface ActionLog {
  id: string
  envId: string
  toolCalled: string
  durationMs: number
  agentReasoning: string
  output: unknown
  createdAt: string
}

/**
 * Pricing Cache Types
 */
export interface PricingCache {
  id: string
  ec2InstanceType: string
  regionCode: string
  pricePerHour: number
  lastUpdated: string
}
