import { CampaignHistory } from './CampaignHistory'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Info, Send } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { deliveryDraftKey, type PreparedDelivery } from '../lib/delivery-preparation'
import type { DraftRecord } from '../types'
import { Button } from './ui'

type Props = { draft: DraftRecord; prepared: PreparedDelivery; onBack: () => void }

export function SendSummary({ draft, prepared, onBack }: Props) {
  const [state, setState] = useState<'ready' | 'confirming' | 'sent' | 'rejected' | 'uncertain'>('ready')
  const [message, setMessage] = useState('')
  const [expired, setExpired] = useState(() => Date.parse(prepared.expiresAt) <= Date.now())
  const lock = useRef(false)
  const changed = prepared.draftKey !== deliveryDraftKey(draft)
  useEffect(() => {
    const remaining = Date.parse(prepared.expiresAt) - Date.now()
    const timer = setTimeout(() => setExpired(true), Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [prepared.expiresAt])
  const confirm = async () => {
    if (lock.current || state !== 'ready' || changed) return
    if (!Number.isFinite(Date.parse(prepared.expiresAt)) || Date.parse(prepared.expiresAt) <= Date.now()) { setExpired(true); return }
    lock.current = true; setState('confirming'); setMessage('')
    try {
      const result = await api.campaignDelivery({ action: 'confirm', draftId: prepared.draftId, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true })
      if (!result.accepted) throw new ApiError('Resposta de envio não confirmada. Consulte a Buttondown antes de repetir.', 502)
      setState('sent'); setMessage('Campanha aceita pela Buttondown.')
    } catch (cause) {
      const uncertain = cause instanceof ApiError && (cause.status === 0 || cause.status >= 500)
      setState(uncertain ? 'uncertain' : 'rejected')
      setMessage(uncertain ? 'Resultado incerto. Não repita o envio; consulte o histórico da campanha e a Buttondown.' : cause instanceof Error ? cause.message : 'Não foi possível enviar a campanha.')
    }
  }
  return <section className="send-summary" aria-label="Resumo do envio">
    <div className="send-summary-heading"><div><p className="eyebrow">ETAPA 04 · RESUMO E ENVIO</p><h1>Resumo e envio</h1><p>Confira os dados da campanha preparada antes de confirmar o envio.</p></div></div>
    <div className="send-summary-layout"><div className="send-summary-card"><h2>Confirme o envio</h2><p>A campanha será enviada imediatamente após sua confirmação. A contagem é estimada; a Buttondown aplica sua elegibilidade e eventuais supressões no envio.</p>
      <div className="send-server-summary" aria-label="Dados confirmados pelo servidor"><dl><div><dt>Assunto</dt><dd>{prepared.subject}</dd></div><div><dt>Audiência</dt><dd>{prepared.audienceMode === 'all_active' ? 'Todos os assinantes ativos' : 'Contatos selecionados'}</dd></div><div><dt>Destinatários estimados</dt><dd>{prepared.recipientCount}</dd></div></dl>
      {prepared.selectedRecipients?.length ? <details><summary>Ver destinatários selecionados</summary><ul>{prepared.selectedRecipients.map(recipient => <li key={recipient.id}>{recipient.email_address}</li>)}</ul></details> : null}
      <p className="send-preparation-expiry">Preparação válida até {new Date(prepared.expiresAt).toLocaleString('pt-BR')}.</p></div>
      {state === 'ready' && (changed || expired) && <p role="alert" className="send-summary-message is-error">{changed ? 'Os dados da edição mudaram.' : 'A preparação expirou.'} Volte à etapa 3 para preparar novamente.</p>}
      <div className="send-summary-actions"><Button variant="outline" onClick={onBack} disabled={state === 'confirming'}>Voltar à preparação</Button>{state === 'ready' && <Button icon={<Send size={15} />} disabled={changed || expired} onClick={() => void confirm()}>Confirmar e enviar campanha</Button>}{state === 'confirming' && <Button disabled>Enviando campanha…</Button>}{state === 'sent' && <Button disabled>Campanha aceita</Button>}</div>
      {message && <p className={`send-summary-message ${state === 'sent' ? 'is-success' : 'is-error'}`} role={state === 'sent' ? 'status' : 'alert'}>{state === 'sent' ? <CheckCircle2 size={16} /> : <Info size={16} />}{message}</p>}
    </div><aside className="send-summary-side"><span className="eyebrow">CONFIRMAÇÃO FINAL</span><h2>Pronta para enviar</h2><p>A audiência e a edição foram validadas na etapa 3. O envio real acontece ao clicar em “Confirmar e enviar campanha”.</p><p>A aceitação pela Buttondown não comprova entrega na caixa de entrada.</p></aside></div>
    {state === 'uncertain' && <CampaignHistory draftId={draft.id} />}
  </section>
}
