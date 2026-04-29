import clsx from 'clsx'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export default function Card({ children, className }: CardProps) {
  return (
    <div className={clsx('rounded-lg bg-ephops-surface border border-ephops-border-default p-4', className)}>
      {children}
    </div>
  )
}
