import { useParams } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import type { Environment, ActionLog } from '@ephops/shared-types'
import Card from '../components/Card'
import StatusBadge from '../components/StatusBadge'
import Button from '../components/Button'
import { fetchEnvironmentById, fetchActionLogs, terminateEnvironment } from '../lib/api'
import { ApiError } from '../lib/ApiError'
import { formatUsd } from '../lib/formatters'

export default function EnvironmentDetail() {
  const { id } = useParams<{ id: string }>()
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [envError, setEnvError] = useState<string | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [terminating, setTerminating] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) {
      setEnvError('Environment ID is missing')
      setLoading(false)
      return
    }

    setLoading(true)
    setEnvError(null)
    setLogsError(null)

    const [envResult, logsResult] = await Promise.allSettled([
      fetchEnvironmentById(id),
      fetchActionLogs(id),
    ])

    if (envResult.status === 'fulfilled') {
      setEnvironment(envResult.value)
      setEnvError(null)
    } else {
      const err = envResult.reason as Error
      if (err instanceof ApiError && err.status === 404) {
        setEnvError('Environment not found')
      } else {
        setEnvError(err.message || 'Failed to load environment')
      }
    }

    if (logsResult.status === 'fulfilled') {
      setLogs(logsResult.value)
      setLogsError(null)
    } else {
      const err = logsResult.reason as Error
      setLogsError(err.message || 'Failed to load action logs')
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleTerminate = async () => {
    setTerminating(true)
    setTerminateError(null)
    setConfirmOpen(false)
    try {
      await terminateEnvironment(id!)
      const updated = await fetchEnvironmentById(id!)
      setEnvironment(updated)
    } catch (err) {
      const e = err as Error
      setTerminateError(e.message || 'Failed to terminate environment')
    } finally {
      setTerminating(false)
    }
  }

  const reasoningLog = logs.find((log) => log.toolCalled === 'log_reasoning')
  const displayAgentReasoning =
    environment?.agentReasoning || reasoningLog?.agentReasoning || logs[0]?.agentReasoning || 'No agent reasoning available'

  const formatLogOutput = (output: unknown): string => {
    if (output === null || output === undefined) {
      return 'No output available'
    }

    if (typeof output === 'string') {
      try {
        const parsed = JSON.parse(output) as unknown
        return JSON.stringify(parsed, null, 2)
      } catch {
        return output
      }
    }

    if (typeof output === 'number' || typeof output === 'boolean') {
      return String(output)
    }

    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }

  const tryParseJson = (output: unknown): unknown => {
    if (typeof output !== 'string') {
      return output
    }

    try {
      return JSON.parse(output) as unknown
    } catch {
      return output
    }
  }

  const renderLogOutputDetails = (log: ActionLog) => {
    const parsedOutput = tryParseJson(log.output)

    if (log.toolCalled === 'log_reasoning' && parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
      const payload = parsedOutput as Record<string, unknown>

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded border border-ephops-border-subtle bg-ephops-surface px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-ephops-text-secondary">Decision</p>
              <p className="mt-1 font-mono text-sm text-ephops-text-primary">
                {typeof payload.decision === 'string' ? payload.decision : 'N/A'}
              </p>
            </div>
            <div className="rounded border border-ephops-border-subtle bg-ephops-surface px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-ephops-text-secondary">Config</p>
              <p className="mt-1 font-mono text-sm text-ephops-text-primary">
                {payload.config ? 'present' : 'missing'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary mb-1">
              Reasoning
            </p>
            <p className="text-sm text-ephops-text-primary">
              {typeof payload.reasoning === 'string' ? payload.reasoning : log.agentReasoning}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary mb-1">
              Output
            </p>
            <pre className="bg-ephops-elevated border border-ephops-border-default rounded p-3 text-xs font-mono text-ephops-text-primary overflow-x-auto">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </div>
      )
    }

    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary mb-1">
          Output
        </p>
        <pre className="bg-ephops-elevated border border-ephops-border-default rounded p-3 text-xs font-mono text-ephops-text-primary overflow-x-auto">
          {formatLogOutput(parsedOutput)}
        </pre>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-ephops-text-secondary">Loading environment details...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {envError ? (
            <p className="text-ephops-state-failed">{envError}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold text-ephops-text-primary">{environment!.name}</h1>
                <StatusBadge state={environment!.state} />
              </div>
              <p className="text-sm text-ephops-text-secondary font-mono">{environment!.id}</p>
            </>
          )}
        </div>
        {!envError && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => void fetchData()}>Refresh</Button>
              <Button
                variant="danger"
                disabled={terminating || environment?.state === 'DESTROYED'}
                onClick={() => setConfirmOpen(true)}
              >
                {terminating ? 'Terminating...' : 'Terminate'}
              </Button>
            </div>
            {terminateError && (
              <p className="text-xs text-ephops-state-failed">{terminateError}</p>
            )}
            {confirmOpen && (
              <div className="bg-ephops-surface border border-ephops-border-default rounded-lg p-4 mt-2 w-80">
                <p className="text-sm text-ephops-text-primary mb-4">
                  Are you sure you want to terminate this environment?
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleTerminate}>
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overview Grid — only when env loaded */}
      {environment && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
                Region
              </p>
              <p className="text-base font-mono text-ephops-text-primary mt-2">{environment.region}</p>
            </Card>

            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
                Instances
              </p>
              <p className="text-base font-mono text-ephops-text-primary mt-2">
                {environment.instanceCount}
              </p>
            </Card>

            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
                Total Cost
              </p>
              <p className="text-base font-mono text-ephops-text-primary mt-2">
                {formatUsd(environment.cost)}
              </p>
            </Card>

            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
                Created
              </p>
              <p className="text-sm text-ephops-text-primary mt-2">
                {new Date(environment.createdAt).toLocaleDateString()}
              </p>
            </Card>
          </div>

          {/* Agent Reasoning */}
          <Card>
            <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Agent Reasoning
            </p>
            <p className="text-sm text-ephops-text-primary mt-2">{displayAgentReasoning}</p>
          </Card>
        </>
      )}

      {/* Action Logs */}
      <div>
        <h2 className="text-lg font-semibold text-ephops-text-primary mb-4">Action Logs</h2>
        {logsError ? (
          <p className="text-sm text-ephops-state-failed">{logsError}</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-ephops-text-secondary">No action logs found</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-ephops-surface border border-ephops-border-default rounded-lg overflow-hidden"
              >
                {/* Collapsed View */}
                <button
                  onClick={() =>
                    setExpandedLog(expandedLog === log.id ? null : log.id)
                  }
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-ephops-elevated transition-colors text-left"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-ephops-text-secondary">
                      {expandedLog === log.id ? '▼' : '▶'}
                    </span>
                    <span className="text-xs font-mono text-ephops-text-secondary">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="px-2 py-1 bg-ephops-elevated rounded text-xs font-medium text-ephops-text-primary">
                      {log.toolCalled}
                    </span>
                    <span className="text-xs text-ephops-text-muted">
                      {log.durationMs}ms
                    </span>
                  </div>
                </button>

                {/* Expanded View */}
                {expandedLog === log.id && (
                  <div className="border-t border-ephops-border-subtle px-4 py-3 space-y-3 bg-ephops-base">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary mb-1">
                        Reasoning
                      </p>
                      <p className="text-sm text-ephops-text-primary">
                        {log.agentReasoning}
                      </p>
                    </div>

                    {renderLogOutputDetails(log)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
