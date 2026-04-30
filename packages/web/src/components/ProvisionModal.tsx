import { useState, useEffect } from 'react'
import { provisionEnvironment } from '../lib/api'
import { ApiError } from '../lib/ApiError'
import Button from './Button'
import Card from './Card'

interface ProvisionModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const PROGRESS_STEPS = [
  { after: 0,  label: 'Analyzing your request with LLM…' },
  { after: 8,  label: 'Running FinOps guardrails check…' },
  { after: 20, label: 'Provisioning EC2 instance…' },
  { after: 35, label: 'Almost there, waiting for instance to start…' },
]

export default function ProvisionModal({ open, onClose, onSuccess }: ProvisionModalProps) {
  const [prompt, setPrompt] = useState('')
  const [instanceType, setInstanceType] = useState<'t3.micro' | 't4g.nano' | ''>('')
  const [ttlHours, setTtlHours] = useState<number | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressLabel, setProgressLabel] = useState(PROGRESS_STEPS[0].label)

  // Cycle through progress hints while the request is in-flight so the user
  // knows the app is working and not frozen.
  useEffect(() => {
    if (!submitting) {
      setProgressLabel(PROGRESS_STEPS[0].label)
      return
    }

    const timers = PROGRESS_STEPS.slice(1).map(({ after, label }) =>
      setTimeout(() => setProgressLabel(label), after * 1000),
    )

    return () => timers.forEach(clearTimeout)
  }, [submitting])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await provisionEnvironment({
        prompt,
        instanceType: instanceType || undefined,
        ttlHours: ttlHours !== '' ? ttlHours : undefined,
      })
      onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to provision environment')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-md">
        <h2 className="text-lg font-semibold text-ephops-text-primary mb-4">Provision Environment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-ephops-text-secondary mb-1">Prompt</label>
            <textarea
              className="w-full bg-ephops-surface border border-ephops-border-default rounded px-3 py-2 text-sm text-ephops-text-primary resize-none"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-ephops-text-secondary mb-1">Instance Type</label>
            <select
              className="w-full bg-ephops-surface border border-ephops-border-default rounded px-3 py-2 text-sm text-ephops-text-primary"
              value={instanceType}
              onChange={(e) => setInstanceType(e.target.value as 't3.micro' | 't4g.nano' | '')}
            >
              <option value="">Default</option>
              <option value="t3.micro">t3.micro</option>
              <option value="t4g.nano">t4g.nano</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-ephops-text-secondary mb-1">TTL (hours)</label>
            <input
              type="number"
              className="w-full bg-ephops-surface border border-ephops-border-default rounded px-3 py-2 text-sm text-ephops-text-primary"
              value={ttlHours}
              onChange={(e) => setTtlHours(e.target.value === '' ? '' : Number(e.target.value))}
              min={1}
            />
          </div>
          {error && <p className="text-ephops-state-failed text-sm">{error}</p>}
          {submitting && (
            <p className="text-ephops-text-secondary text-xs animate-pulse">{progressLabel}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Provisioning…' : 'Provision'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
