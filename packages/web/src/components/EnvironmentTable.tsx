import type { Environment } from '@ephops/shared-types'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import { formatUsd } from '../lib/formatters'
import { terminateEnvironment } from '../lib/api'

interface EnvironmentTableProps {
  environments: Environment[]
  onActionComplete?: () => Promise<void> | void
}

export default function EnvironmentTable({ environments, onActionComplete }: EnvironmentTableProps) {
  const navigate = useNavigate()
  const tableRef = useRef<HTMLDivElement | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [terminatingId, setTerminatingId] = useState<string | null>(null)
  const [pendingTerminateId, setPendingTerminateId] = useState<string | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!tableRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null)
        setPendingTerminateId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null)
        setPendingTerminateId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value)
  }

  const handleTerminate = async (env: Environment) => {
    if (!env.resourceId) {
      return
    }

    setTerminatingId(env.id)
    try {
      await terminateEnvironment(env.id)
      setPendingTerminateId(null)
      setOpenMenuId(null)
      await onActionComplete?.()
    } finally {
      setTerminatingId(null)
    }
  }

  return (
    <div ref={tableRef} className="overflow-x-auto rounded-lg border border-ephops-border-default">
      <table className="w-full">
        <thead>
          <tr className="bg-ephops-elevated border-b border-ephops-border-default">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              State
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Region
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Cost
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Instances
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Created
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-ephops-text-secondary">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {environments.map((env) => (
            <tr
              key={env.id}
              onClick={() => navigate(`/environments/${env.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/environments/${env.id}`)
                }
              }}
              tabIndex={0}
              role="link"
              className="bg-ephops-surface border-b border-ephops-border-subtle hover:bg-ephops-elevated transition-colors cursor-pointer"
            >
              <td className="px-4 py-3 font-mono text-sm text-ephops-text-primary truncate">
                {env.id.slice(0, 8)}
              </td>
              <td className="px-4 py-3 text-sm text-ephops-text-primary">{env.name}</td>
              <td className="px-4 py-3">
                <StatusBadge state={env.state} />
              </td>
              <td className="px-4 py-3 text-sm text-ephops-text-secondary">{env.region}</td>
              <td className="px-4 py-3 font-mono text-sm text-ephops-text-primary">
                {formatUsd(env.cost)}
              </td>
              <td className="px-4 py-3 text-sm text-ephops-text-primary">{env.instanceCount}</td>
              <td className="px-4 py-3 font-mono text-sm text-ephops-text-secondary">
                {new Date(env.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right relative">
                <div className="inline-flex justify-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setPendingTerminateId(null)
                      setOpenMenuId((current) => (current === env.id ? null : env.id))
                    }}
                    className="rounded-md border border-ephops-border-default bg-ephops-surface px-3 py-1.5 text-xs font-medium text-ephops-text-secondary transition-colors duration-150 hover:bg-ephops-elevated hover:text-ephops-text-primary focus:outline-none focus:ring-2 focus:ring-ephops-accent-blue focus:ring-offset-2 focus:ring-offset-ephops-base"
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === env.id}
                  >
                    More
                  </button>
                </div>

                {openMenuId === env.id && (
                  <div
                    role="menu"
                    aria-label={`Actions for ${env.name}`}
                    className="absolute right-4 top-full z-10 mt-2 w-52 rounded-md border border-ephops-border-default bg-ephops-elevated py-1 text-left shadow-none"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-3 py-2 text-left text-sm text-ephops-text-primary hover:bg-ephops-surface focus:bg-ephops-surface focus:outline-none"
                      onClick={() => navigate(`/environments/${env.id}`)}
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-3 py-2 text-left text-sm text-ephops-text-primary hover:bg-ephops-surface focus:bg-ephops-surface focus:outline-none"
                      onClick={async () => {
                        await copyToClipboard(env.id)
                        setOpenMenuId(null)
                      }}
                    >
                      Copy environment ID
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-3 py-2 text-left text-sm text-ephops-text-primary hover:bg-ephops-surface focus:bg-ephops-surface focus:outline-none disabled:cursor-not-allowed disabled:text-ephops-text-muted"
                      disabled={!env.resourceId}
                      onClick={async () => {
                        if (!env.resourceId) {
                          return
                        }
                        await copyToClipboard(env.resourceId)
                        setOpenMenuId(null)
                      }}
                    >
                      Copy resource ID
                    </button>

                    {pendingTerminateId === env.id ? (
                      <div className="border-t border-ephops-border-subtle px-3 py-2">
                        <p className="text-xs text-ephops-text-secondary">Terminate this environment?</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-ephops-border-default px-2.5 py-1 text-xs text-ephops-text-secondary hover:bg-ephops-surface focus:outline-none focus:ring-2 focus:ring-ephops-accent-blue focus:ring-offset-2 focus:ring-offset-ephops-elevated"
                            onClick={() => setPendingTerminateId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-md px-2.5 py-1 text-xs text-ephops-state-failed hover:bg-ephops-surface focus:outline-none focus:ring-2 focus:ring-ephops-state-failed focus:ring-offset-2 focus:ring-offset-ephops-elevated disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={terminatingId === env.id}
                            onClick={async () => {
                              await handleTerminate(env)
                            }}
                          >
                            {terminatingId === env.id ? 'Terminating...' : 'Confirm terminate'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full border-t border-ephops-border-subtle px-3 py-2 text-left text-sm text-ephops-state-failed hover:bg-ephops-surface focus:bg-ephops-surface focus:outline-none disabled:cursor-not-allowed disabled:text-ephops-text-muted"
                        disabled={!env.resourceId || env.state === 'DESTROYED'}
                        onClick={() => setPendingTerminateId(env.id)}
                      >
                        Terminate environment
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
