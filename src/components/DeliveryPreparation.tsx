import { useState } from 'react'
import type { DraftRecord } from '../types'
async function call(body?: unknown) {
  const response = await fetch('/api/editorial-test', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Falha na homologação.')
  return result
}
export function DeliveryPreparation({ draft }: { draft?: DraftRecord }) {
  const [config, setConfig] = useState<{ enabled: boolean; recipients: string[] } | null>(null)
  const [index, setIndex] = useState('0')
  const [attempt, setAttempt] = useState<{ attemptId: string; recipient: string; cloudRevision: number } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('Nenhum envio habilitado por padrão.')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setConfirmed(false)
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na preparação.') }
    finally { setBusy(false) }
  }
  const current = draft && attempt && attempt.cloudRevision === draft.cloudRevision && draft.revision === draft.syncedRevision && draft.revision === draft.cloudSavedRevision
  return <details className="inspector-section"><summary>Homologação por e-mail</summary>
    <p>Destinos definidos no servidor. Uma confirmação vale para uma tentativa e uma revisão.</p>
    <button disabled={busy} onClick={() => void run(async () => { setConfig(await call()); setAttempt(null); setMessage('Configuração consultada. Nenhum envio realizado.') })}>Consultar autorização do servidor</button>
    {config && (config.enabled ? <>
      <label>Destino autorizado<select value={index} onChange={e => { setIndex(e.target.value); setAttempt(null); setConfirmed(false) }}>{config.recipients.map((email, i) => <option value={i} key={email}>{email}</option>)}</select></label>
      <button disabled={busy || !draft?.cloudRevision || !config.recipients.length} onClick={() => void run(async () => { setAttempt(await call({ draftId: draft?.id, cloudRevision: draft?.cloudRevision, recipientIndex: Number(index) })); setMessage('Preparação registrada. Confira o destino.') })}>Preparar teste sem enviar</button>
      {attempt && <><p>Destino: <strong>{attempt.recipient}</strong> · revisão D1 {attempt.cloudRevision}</p><label><input type="checkbox" checked={confirmed} disabled={!current || busy} onChange={e => setConfirmed(e.target.checked)} />Confirmo este envio de teste para o endereço acima.</label><button disabled={!current || !confirmed || busy} onClick={() => void run(async () => { const prepared = attempt; setAttempt(null); await call({ draftId: draft?.id, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true }); setMessage('Teste aceito pela Buttondown. Confira a caixa de entrada.') })}>Enviar somente este teste</button></>}
    </> : <p>Homologação desativada no servidor. A ativação exige autorização posterior do proprietário.</p>)}
    <p role="status">{message}</p>
  </details>
}
