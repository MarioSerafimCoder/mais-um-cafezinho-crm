import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { AlertCircle, Check, LoaderCircle } from 'lucide-react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'outline' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, className = '', children, ...props }: ButtonProps) {
  return <button className={`button button-${variant} button-${size} ${className}`} {...props}>
    {icon}{children}
  </button>
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-title-row">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
    {action && <div className="page-title-action">{action}</div>}
  </div>
}

export function StatusPill({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }>) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return <div className="state-panel" role="status"><LoaderCircle className="spin" size={18} /><span>{label}</span></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="state-panel error-panel" role="alert"><AlertCircle size={18} /><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}>Tentar novamente</button>}</div>
}

export function SuccessMessage({ children }: PropsWithChildren) {
  return <div className="success-message" role="status"><Check size={16} />{children}</div>
}

export function DemoNotice() {
  return <div className="demo-notice"><span className="demo-mark">D</span><span><strong>Modo demonstração.</strong> Os dados exibidos são fictícios; os rascunhos ficam neste navegador.</span></div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-rule" /><p className="eyebrow">SEM REGISTROS</p><h2>{title}</h2><p>{description}</p>{action}</div>
}

export function Field({ label, hint, children }: PropsWithChildren<{ label: string; hint?: string }>) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}
