interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  subLabel?: string
}

export default function MetricCard({ label, value, unit, subLabel }: MetricCardProps) {
  return (
    <div className="rounded-lg bg-ephops-surface border border-ephops-border-default p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
        {label}
      </p>
      <div className="mt-3">
        <p className="text-2xl font-semibold font-mono text-ephops-text-primary">
          {value}
          {unit && <span className="text-sm ml-1 font-sans">{unit}</span>}
        </p>
        {subLabel && <p className="text-xs text-ephops-text-muted mt-2">{subLabel}</p>}
      </div>
    </div>
  )
}
