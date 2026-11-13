import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { deliveryStatus } from '../lib/delivery-status'
import type { CampaignAttempt } from '../types'
import { Button } from './ui'

export function DeliveryOutcome({ draftId, attemptId, providerStatus }: { draftId: string; attemptId: string; providerStatus?: string }) {
  const [attempt, setAttempt] = useState<Pick<CampaignAttempt, 'provider_status' | 'delivery' | 'publication_verified'>>({ provider_status: providerStatus })
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let count = 0
    const check = async () => {
      setBusy(true)
      try {
        const result = await api.reconcileCampaignAttempt(draftId, attemptId)
        if (!active) return
        setAttempt(result.attempt); setError('')
        // Bounded, sequential reads only. Never repeat publication, including
        // after closing this view or losing an HTTP response.
        if (++count < 12 && !(result.attempt.delivery?.deliveries && result.attempt.provider_status === 'sent') && result.attempt.publication_verified !== false) timer = setTimeout(() => void check(), 10000)
      } catch { if (active) setError('Não foi possível consultar a entrega agora. A solicitação permanece registrada; atualizar não reenvia.') }
      finally { if (active) setBusy(false) }
    }
    void check()
    return () => { active = false; clearTimeout(timer) }
  }, [draftId, attemptId, refresh])
  const status = deliveryStatus(attempt)
  return <section aria-label="Acompanhamento de entrega" className="send-summary-card">
    <h2>{status.title}</h2><p role="status">{status.detail}</p>
    {attempt.delivery == null && <p>A Buttondown não disponibilizou métricas de entrega nesta consulta.</p>}
    {error && <p role="alert">{error}</p>}
    <Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? 'Consultando entrega…' : 'Atualizar resultado da entrega'}</Button>
  </section>
}
