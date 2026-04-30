/// <reference types="vite/client" />
import { ApiError } from './ApiError'
import type { Environment, ActionLog, Metrics } from '@ephops/shared-types'
import {
  mapSandboxEnvToEnvironment,
  mapActionLogResponseToActionLog,
  mapFinOpsMetricsToMetrics,
  type SandboxEnvResponseDto,
  type ActionLogResponseDto,
  type FinOpsMetrics,
} from './mappers'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const API_KEY = import.meta.env.VITE_API_KEY ?? 'ephops-123'

export interface ProvisionInput {
  prompt: string
  instanceType?: 't3.micro' | 't4g.nano'
  ttlHours?: number
}

// Default timeout for quick read operations (list, fetch by id, metrics).
const DEFAULT_TIMEOUT_MS = 10_000

// Provision involves two sequential LLM calls (intent extraction + decision)
// plus an EC2 API call. Each LLM call can take up to 15 s (OLLAMA_TIMEOUT_MS),
// so the frontend must wait long enough for the full pipeline to complete.
const PROVISION_TIMEOUT_MS = 90_000

async function request<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY,
        ...init?.headers,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      let message: string
      const text = await response.text()
      try {
        const body = JSON.parse(text) as { message?: string }
        message = body.message ?? text
      } catch {
        message = text
      }
      throw new ApiError(response.status, message)
    }

    return (await response.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchEnvironments(): Promise<Environment[]> {
  const data = await request<SandboxEnvResponseDto[]>('/sandbox')
  return data.map(mapSandboxEnvToEnvironment)
}

export async function fetchEnvironmentById(id: string): Promise<Environment> {
  const data = await request<SandboxEnvResponseDto>(`/sandbox/${id}`)
  return mapSandboxEnvToEnvironment(data)
}

export async function provisionEnvironment(input: ProvisionInput): Promise<Environment> {
  const data = await request<SandboxEnvResponseDto>(
    '/sandbox',
    { method: 'POST', body: JSON.stringify(input) },
    PROVISION_TIMEOUT_MS,
  )
  return mapSandboxEnvToEnvironment(data)
}

export async function terminateEnvironment(id: string): Promise<Environment> {
  const data = await request<SandboxEnvResponseDto>(`/sandbox/${id}`, {
    method: 'DELETE',
  })
  return mapSandboxEnvToEnvironment(data)
}

export async function fetchActionLogs(envId: string): Promise<ActionLog[]> {
  const data = await request<ActionLogResponseDto[]>(`/action-logs?envId=${envId}`)
  return data.map(mapActionLogResponseToActionLog)
}

export async function fetchFinOpsMetrics(): Promise<Metrics> {
  const data = await request<FinOpsMetrics>('/metrics/finops')
  return mapFinOpsMetricsToMetrics(data)
}
