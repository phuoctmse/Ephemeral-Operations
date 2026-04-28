import { useState, useEffect, useCallback } from 'react'
import { Environment, Metrics } from '@ephops/shared-types'
import MetricCard from '../components/MetricCard'
import EnvironmentTable from '../components/EnvironmentTable'
import Card from '../components/Card'
import Button from '../components/Button'
import ProvisionModal from '../components/ProvisionModal'
import { fetchEnvironments, fetchFinOpsMetrics } from '../lib/api'

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [provisionOpen, setProvisionOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setError(null)
    setMetricsError(null)
    setLoading(true)
    try {
      const [envsResult, metricsResult] = await Promise.allSettled([
        fetchEnvironments(),
        fetchFinOpsMetrics(),
      ])

      if (envsResult.status === 'fulfilled') {
        setEnvironments(envsResult.value)
      } else {
        setError(
          envsResult.reason instanceof Error
            ? envsResult.reason.message
            : 'Failed to load environments',
        )
      }

      if (metricsResult.status === 'fulfilled') {
        setMetrics(metricsResult.value)
      } else {
        setMetricsError(
          metricsResult.reason instanceof Error
            ? metricsResult.reason.message
            : 'Failed to load metrics',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-ephops-text-secondary">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ephops-text-primary">Dashboard</h1>
          <p className="text-sm text-ephops-text-secondary mt-1">
            Operational overview of ephemeral environments and FinOps metrics
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={fetchData}>Refresh</Button>
          <Button variant="primary" onClick={() => setProvisionOpen(true)}>Provision</Button>
        </div>
      </div>

      {/* Environment Error */}
      {error && (
        <Card className="bg-red-950 border-ephops-state-failed">
          <p className="text-ephops-state-failed text-sm">{error}</p>
        </Card>
      )}

      {/* Metrics Error */}
      {metricsError && (
        <Card className="bg-red-950 border-ephops-state-failed">
          <p className="text-ephops-state-failed text-sm">{metricsError}</p>
        </Card>
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4">
          <MetricCard label="Total Cost" value={`${metrics.totalCost.toFixed(2)}`} />
          <MetricCard label="Avg Latency" value={metrics.averageLatency} unit="ms" />
          <MetricCard label="Environments" value={metrics.environmentCount} />
          <MetricCard label="Active Agents" value={metrics.activeAgents} />
        </div>
      )}

      {/* Environments Section */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ephops-text-primary">Environments</h2>
          <p className="text-sm text-ephops-text-secondary mt-1">
            {environments.length} environments across all regions
          </p>
        </div>
        <EnvironmentTable environments={environments} />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ephops-text-secondary">
            Most Expensive
          </h3>
          <div className="mt-3 space-y-2">
            <p className="text-base font-mono text-ephops-text-primary">Production Cluster</p>
            <p className="text-xs text-ephops-text-secondary">$345.67 · 4 instances</p>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ephops-text-secondary">
            Last 24h Activity
          </h3>
          <div className="mt-3">
            <p className="text-base font-mono text-ephops-text-primary">23 deployments</p>
            <p className="text-xs text-ephops-text-secondary">$156.34 cost</p>
          </div>
        </Card>
      </div>

      <ProvisionModal
        open={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  )
}
