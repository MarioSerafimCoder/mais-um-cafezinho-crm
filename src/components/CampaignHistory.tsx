import { useState } from 'react'
import { api } from '../lib/api'
import type { CampaignAttempt } from '../types'
import { Button } from './ui'
const stateLabels: Record<string, string> = { prepared: 'Preparada', attempted: 'Resultado incerto — repetição bloqueada', accepted: 'Publicação confirmada', rejected: 'Recusada', expired: 'Preparação expirada', cancelled: 'Cancelada' }
export function CampaignHistory({ draftId }: { draftId?: string }) {
  const [attempts, setAttempts] = useState<CampaignAttempt[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao consultar histórico.') } finally { setBusy(false) } }
  return <section aria-label="Histórico de envios"><h2>Histórico de envios</h2><p>Consulte o estado remoto de uma tentativa incerta. Esta consulta não reenvia a campanha.</p><Button variant="outline" disabled={busy} onClick={() => void run(async () => { const data = await api.campaignAttempts(draftId); setAttempts(data.attempts); setCursor(data.next || null); setLoaded(true) })}>Atualizar histórico de envios</Button>
    {error && <p role="alert">{error}</p>}{loaded && !attempts.length && <p>Nenhuma tentativa registrada.</p>}
    {cursor && <Button disabled={busy} variant="outline" onClick={() => void run(async () => { const data = await api.campaignAttempts(draftId, cursor); setAttempts(current => [...new Map([...current, ...data.attempts].map(item => [item.id, item])).values()]); setCursor(data.next || null) })}>Carregar mais tentativas</Button>}
    <ul>{attempts.map(attempt => <li key={attempt.id}><strong>{attempt.subject}</strong> · {new Date(attempt.created_at).toLocaleString('pt-BR')} · {attempt.state === 'accepted' && !attempt.publication_hash ? 'Aceitação antiga — verificar estado remoto' : stateLabels[attempt.state] || attempt.state}{attempt.provider_status && <p>Estado observado na Buttondown: {attempt.provider_status} · {attempt.observed_at ? new Date(attempt.observed_at).toLocaleString('pt-BR') : ''}</p>}{['attempted', 'accepted'].includes(attempt.state) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await api.reconcileCampaignAttempt(attempt.draft_id, attempt.id); setAttempts(current => current.map(item => item.id === attempt.id ? result.attempt : item)) })}>Consultar estado na Buttondown</Button>}</li>)}</ul>
  </section>
}
