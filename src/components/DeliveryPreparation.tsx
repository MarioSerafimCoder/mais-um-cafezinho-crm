import { useState } from 'react'
import type { DraftRecord } from '../types'
type Attempt = { id: string; recipient: string; state: string; created_at: string; provider_status: number | null }
type Config = { enabled: boolean; recipients: string[]; attempts: Attempt[] }
async function call(body?: unknown, draftId?: string) {
  const response = await fetch(`/api/editorial-test${!body && draftId ? `?draftId=${encodeURIComponent(draftId)}` : ''}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Resposta inválida. Verifique sua sessão e consulte o resultado antes de tentar novamente.')
  if (!response.ok) throw new Error(result.error || 'Falha na homologação.')
  return result
}
export function DeliveryPreparation({ draft }: { draft?: DraftRecord }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [index, setIndex] = useState('0')
  const [attempt, setAttempt] = useState<{ attemptId: string; recipient: string; cloudRevision: number } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('Salve e sincronize o rascunho antes de escolher um destinatário.')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setConfirmed(false)
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na preparação.') }
    finally { setBusy(false) }
  }
  const current = draft && attempt && attempt.cloudRevision === draft.cloudRevision && draft.revision === draft.syncedRevision && draft.revision === draft.cloudSavedRevision
  const ready = draft?.cloudRevision && draft.buttondownId && draft.revision === draft.syncedRevision && draft.revision === draft.cloudSavedRevision
  const labels: Record<string, string> = { prepared: 'Preparado — ainda não enviado', accepted: 'Aceito pela Buttondown — recebimento pendente', rejected: 'Recusado pelo provedor', attempted: 'Resultado incerto — repetição bloqueada', expired: 'Preparação expirada', cancelled: 'Preparação cancelada' }
  return <section className="inspector-section" aria-label="Teste por e-mail"><h3>Enviar teste</h3>
    <p>Destinos definidos no servidor. Uma confirmação vale para uma tentativa e uma revisão.</p>
    <button disabled={busy} onClick={() => void run(async () => { setConfig(await call(undefined, draft?.id)); setMessage('Destinatários e histórico atualizados. Nenhum envio realizado.') })}>Consultar destinatários e resultado</button>
    {config && (config.enabled ? <>
      <label>Destino autorizado<select disabled={busy || Boolean(attempt)} value={index} onChange={e => { setIndex(e.target.value); setConfirmed(false) }}>{config.recipients.map((email, i) => <option value={i} key={email}>{email}</option>)}</select></label>
      {!ready && <p>Use Salvar rascunho na Buttondown para salvar e sincronizar a revisão atual.</p>}
      <button disabled={busy || !ready || !config.recipients.length || Boolean(attempt)} onClick={() => void run(async () => { setAttempt(await call({ draftId: draft?.id, cloudRevision: draft?.cloudRevision, recipientIndex: Number(index) })); setMessage('Preparação registrada. Confira o destino.') })}>Preparar novo teste</button>
      {attempt && <><p>Destino: <strong>{attempt.recipient}</strong> · revisão D1 {attempt.cloudRevision}</p><label><input type="checkbox" checked={confirmed} disabled={!current || busy} onChange={e => setConfirmed(e.target.checked)} />Confirmo este envio de teste para o endereço acima.</label><button disabled={!current || !confirmed || busy} onClick={() => void run(async () => { const prepared = attempt; setAttempt(null); try { await call({ draftId: draft?.id, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true }); setMessage('Teste aceito pela Buttondown. Recebimento pendente: confira a caixa de entrada e spam.') } finally { setConfig(await call(undefined, draft?.id)) } })}>Enviar teste</button></>}
    </> : <p>Teste desativado ou sem destinos autorizados. A configuração inicial é feita no servidor.</p>)}
    <p role="status">{message}</p>
    {attempt && <button disabled={busy} onClick={() => void run(async () => { await call({ draftId: draft?.id, cloudRevision: draft?.cloudRevision, attemptId: attempt.attemptId, cancel: true }); setAttempt(null); setConfig(await call(undefined, draft?.id)); setMessage('Preparação cancelada. Nenhum envio realizado.') })}>Cancelar preparação</button>}
    {config?.attempts?.length ? <ul aria-label="Histórico de testes">{config.attempts.map(item => <li key={item.id}>{new Date(item.created_at).toLocaleString('pt-BR')} · {item.recipient} · {labels[item.state] || item.state}{item.provider_status ? ` · HTTP ${item.provider_status}` : ''}<small> · {item.id}</small></li>)}</ul> : null}
  </section>
}
