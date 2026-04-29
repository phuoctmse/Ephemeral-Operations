import clsx from 'clsx'
import { ReactNode } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = 'rounded-md px-4 py-1.5 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ephops-accent-blue focus:ring-offset-ephops-base disabled:opacity-40 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-ephops-accent-blue text-white hover:bg-blue-400',
    ghost: 'text-ephops-text-secondary hover:bg-ephops-elevated',
    danger: 'text-ephops-state-failed hover:bg-ephops-elevated',
  }

  return (
    <button
      className={clsx(baseStyles, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  )
}
