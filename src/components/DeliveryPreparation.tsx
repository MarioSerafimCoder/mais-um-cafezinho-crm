import { useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, History, Info, Mail, RefreshCw, Send, ShieldCheck, X } from 'lucide-react'
import type { DraftRecord } from '../types'
import { Button } from './ui'

type Attempt = { id: string; recipient: string; cloud_revision: number; state: string; created_at: string; provider_status: number | null }
type Config = { enabled: boolean; recipients: string[]; attempts: Attempt[] }
type PreparedAttempt = { attemptId: string; recipient: string; cloudRevision: number }

async function call(body?: unknown, draftId?: string) {
  const response = await fetch(`/api/editorial-test${!body && draftId ? `?draftId=${encodeURIComponent(draftId)}` : ''}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Resposta inválida. Verifique sua sessão e consulte o resultado antes de tentar novamente.')
  if (!response.ok) throw new Error(result.error || 'Falha na homologação.')
  return result
}

const labels: Record<string, string> = {
  prepared: 'Preparado — ainda não enviado',
  accepted: 'Aceito pela Buttondown — recebimento pendente',
  rejected: 'Recusado pelo provedor',
  attempted: 'Resultado incerto — repetição bloqueada',
  expired: 'Expirado — nenhum envio realizado',
  cancelled: 'Preparação cancelada',
}
const preparationLifetimeMs = 600000

function attemptLabel(attempt: Attempt) {
  if (attempt.state === 'prepared' && Date.now() - Date.parse(attempt.created_at) > preparationLifetimeMs) return labels.expired
  return labels[attempt.state] || attempt.state
}

export function DeliveryPreparation({ draft, onPrepare }: { draft?: DraftRecord; onPrepare?: () => Promise<DraftRecord> }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [index, setIndex] = useState('0')
  const [attempt, setAttempt] = useState<PreparedAttempt | null>(null)
  const [message, setMessage] = useState('Atualize o destinatário e confira o histórico antes de preparar o teste.')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na preparação.') }
    finally { setBusy(false) }
  }
  const refreshConfig = async () => {
    const next = await call(undefined, draft?.id) as Config
    setConfig(next)
    const recipient = next.recipients[Number(index)]
    const pending = next.attempts.find(item => item.recipient === recipient && item.state === 'prepared')
    if (pending) {
      const fresh = Date.now() - Date.parse(pending.created_at) <= preparationLifetimeMs
      if (fresh) {
        setAttempt({ attemptId: pending.id, recipient: pending.recipient, cloudRevision: pending.cloud_revision })
        setMessage('Preparação recuperada. Confira o endereço antes de confirmar o envio.')
      } else {
        setAttempt(null)
        setMessage('A preparação expirou. Nenhum e-mail foi enviado. Prepare um novo teste para continuar.')
      }
      return
    }
    setAttempt(null)
    const uncertain = next.attempts.find(item => item.recipient === recipient && item.state === 'attempted')
    setMessage(uncertain
      ? 'O resultado da tentativa anterior é incerto. Consulte o histórico e a Buttondown antes de qualquer novo envio.'
      : 'Destinatários e histórico atualizados. Nenhum envio realizado.')
  }
  const current = Boolean(draft && attempt && attempt.cloudRevision === draft.cloudRevision && draft.revision === draft.syncedRevision && draft.revision === draft.cloudSavedRevision)
  const ready = Boolean(draft?.cloudRevision && draft.buttondownId && draft.revision === draft.syncedRevision && draft.revision === draft.cloudSavedRevision)
  const warning = /expir|incert|falha|recus|bloque|desativ|nenhum e-mail foi enviado/i.test(message)
  const success = /aceito pela buttondown/i.test(message)

  return <section className="inspector-section test-delivery" aria-label="Teste por e-mail">
    <div className="test-delivery-heading">
      <div><span className="inspector-label">HOMOLOGAÇÃO INDIVIDUAL</span><h3>Enviar teste</h3></div>
      {attempt && <span className="test-state test-state-ready"><Clock3 size={12} />Pendente</span>}
    </div>
    <p className="test-delivery-intro">Envie esta newsletter apenas para um destinatário autorizado.</p>

    <ol className="test-flow" aria-label="Etapas do envio de teste">
      <li><span>1</span>Destino</li><li><span>2</span>Preparação</li><li><span>3</span>Confirmação</li>
    </ol>

    <Button className="test-action-button" size="sm" variant="outline" icon={<RefreshCw size={14} />} disabled={busy} onClick={() => void run(refreshConfig)}>
      Atualizar destinatário e histórico
    </Button>

    {config && !config.enabled && <div className="test-feedback test-feedback-warning" role="status"><AlertCircle size={16} />Teste indisponível ou sem destinatários autorizados.</div>}
    {config?.enabled && <>
      <label className="test-recipient-field"><span>Destinatário autorizado</span><select disabled={busy || Boolean(attempt)} value={index} onChange={event => { setIndex(event.target.value) }}>{config.recipients.map((email, i) => <option value={i} key={email}>{email}</option>)}</select></label>
      {!ready && <div className={`test-feedback ${onPrepare ? 'test-feedback-neutral' : 'test-feedback-warning'}`} role="status"><Info size={16} />{onPrepare ? 'A edição será salva e sincronizada automaticamente ao preparar o teste.' : 'Salve e sincronize a revisão atual da newsletter antes de preparar o teste.'}</div>}

      {!attempt && <Button className="test-action-button" variant="outline" icon={<Mail size={15} />} disabled={busy || (!ready && !onPrepare) || !config.recipients.length} onClick={() => void run(async () => {
        try {
          const latest = ready ? draft : await onPrepare?.()
          if (!latest?.buttondownId || !latest.cloudRevision || latest.revision !== latest.syncedRevision || latest.revision !== latest.cloudSavedRevision) throw new Error('Não foi possível sincronizar a revisão atual. Confira a conexão e tente novamente.')
          const prepared = await call({ draftId: latest.id, cloudRevision: latest.cloudRevision, recipientIndex: Number(index) })
          setAttempt(prepared)
          setMessage('Preparação registrada. Confira o destinatário e confirme somente se estiver correto.')
        } catch (error) {
          await refreshConfig()
          if (!(error instanceof Error) || !error.message.includes('preparação ativa')) throw error
        }
      })}>{busy ? 'Salvando e preparando…' : 'Preparar novo teste'}</Button>}

      {attempt && <div className="test-confirmation-card">
        <div className="test-confirmation-heading"><ShieldCheck size={16} /><strong>Revise antes de enviar</strong></div>
        <span className="test-recipient-label">O teste será enviado para</span>
        <p className="test-recipient-address">{attempt.recipient}</p>
        <span className="test-revision">Versão {attempt.cloudRevision}{!current ? ' · revisão desatualizada' : ''}</span>

        <Button className="test-action-button" icon={<Send size={15} />} disabled={!current || busy} onClick={() => void run(async () => {
          const prepared = attempt
          setAttempt(null)
          try { await call({ draftId: draft?.id, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true }) }
          catch (error) { await refreshConfig(); throw error }
          await refreshConfig()
          setMessage('Teste aceito pela Buttondown. O recebimento ainda precisa ser confirmado na caixa de entrada.')
        })}>Enviar este teste</Button>
        <button className="test-cancel-button" disabled={busy} onClick={() => void run(async () => {
          await call({ draftId: draft?.id, cloudRevision: draft?.cloudRevision, attemptId: attempt.attemptId, cancel: true })
          setAttempt(null)
          await refreshConfig()
          setMessage('Preparação cancelada. Nenhum envio realizado.')
        })}><X size={13} />Cancelar preparação</button>
      </div>}
    </>}

    <div className={`test-feedback ${warning ? 'test-feedback-warning' : success ? 'test-feedback-success' : 'test-feedback-neutral'}`} role="status">
      {warning ? <AlertCircle size={16} /> : success ? <CheckCircle2 size={16} /> : <Info size={16} />}
      <span>{message}</span>
    </div>

    {config?.attempts?.length ? <details className="test-history">
      <summary><History size={14} />Histórico de tentativas <span>{config.attempts.length}</span></summary>
      <ol aria-label="Histórico de testes">{config.attempts.map(item => <li key={item.id}>
        <span className="test-history-status">{attemptLabel(item)}</span>
        <span className="test-history-recipient">{item.recipient}</span>
        <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time>
        {item.provider_status ? <span>Resposta do provedor: HTTP {item.provider_status}</span> : null}
        <code>{item.id}</code>
      </li>)}</ol>
    </details> : null}
  </section>
}
