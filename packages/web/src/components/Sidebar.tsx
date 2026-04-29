import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'

export default function Sidebar() {
  const location = useLocation()

  const navItems = [
    { label: 'Dashboard', href: '/', icon: '📊' },
    { label: 'Environments', href: '/environments', icon: '🌍' },
    { label: 'Metrics', href: '/metrics', icon: '📈' },
    { label: 'Logs', href: '/logs', icon: '📝' },
    { label: 'Settings', href: '/settings', icon: '⚙️' },
  ]

  return (
    <aside className="w-64 border-r border-ephops-border-default bg-ephops-surface">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-ephops-border-default">
          <h1 className="text-lg font-semibold text-ephops-text-primary">EphOps</h1>
          <p className="text-xs text-ephops-text-secondary mt-1">v0.0.1</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-ephops-elevated text-ephops-text-primary border-l-2 border-ephops-accent-blue'
                    : 'text-ephops-text-secondary hover:bg-ephops-elevated'
                )}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-ephops-border-default text-xs text-ephops-text-muted">
          <p>© 2026 EphOps</p>
        </div>
      </div>
    </aside>
  )
}
