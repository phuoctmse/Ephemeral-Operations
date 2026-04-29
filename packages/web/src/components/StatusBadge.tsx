import clsx from 'clsx'
import type { EnvironmentState } from '@ephops/shared-types'

interface StatusBadgeProps {
  state: EnvironmentState
}

export default function StatusBadge({ state }: StatusBadgeProps) {
  const styles = {
    RUNNING: 'bg-emerald-950 text-ephops-state-running',
    CREATING: 'bg-amber-950 text-ephops-state-creating',
    FAILED: 'bg-red-950 text-ephops-state-failed',
    DESTROYED: 'bg-ephops-surface text-ephops-text-muted',
  }

  return (
    <span className={clsx('inline-block rounded-sm px-2 py-0.5 text-xs font-medium uppercase', styles[state])}>
      {state}
    </span>
  )
}
