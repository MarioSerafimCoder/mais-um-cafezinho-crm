import { useEffect, useState } from 'react'
import { CheckCircle2, Info, Send } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { DraftRecord, PreparedCampaignDelivery, Subscriber } from '../types'
import { Button } from './ui'

type Audience = { mode: 'all_active' } | { mode: 'selected'; subscriberIds: string[] }
type Prepared = PreparedCampaignDelivery & { draftId: string; preparationKey: string }
type Props = { draft: DraftRecord; audience: Audience; count: number; recipients: Subscriber[]; onBack: () => void; onTest: () => void; onPrepare: () => Promise<DraftRecord> }

function preparationKey(draft: DraftRecord, audience: Audience, count: number, recipients: Subscriber[]) {
  return JSON.stringify([
    draft.id, draft.subject, draft.description || '', draft.revision, draft.cloudRevision,
    draft.syncedRevision, draft.cloudSavedRevision, draft.document || draft.content,
    audience.mode, audience.mode === 'selected' ? audience.subscriberIds.slice().sort() : [], count,
    recipients.map((recipient) => [recipient.id, recipient.email_address]).sort(),
  ])
}

function isUncertain(cause: unknown) {
  return cause instanceof ApiError && (cause.status === 0 || cause.status >= 500)
}

function expiryLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'prazo não informado' : date.toLocaleString('pt-BR')
}

export function SendSummary({ draft, audience, count, recipients, onBack, onTest, onPrepare }: Props) {
  const [sendState, setSendState] = useState<'idle' | 'preparing' | 'ready' | 'confirming' | 'sent' | 'rejected' | 'uncertain'>('idle')
  const [message, setMessage] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [deliveryEnabled, setDeliveryEnabled] = useState<boolean | null>(null)
  const [deliveryStatusError, setDeliveryStatusError] = useState('')
  const currentKey = preparationKey(draft, audience, count, recipients)
  useEffect(() => {
    let active = true
    void api.campaignDeliveryStatus()
      .then(status => { if (active) { setDeliveryEnabled(status.enabled); setDeliveryStatusError('') } })
      .catch(cause => { if (active) { setDeliveryEnabled(false); setDeliveryStatusError(cause instanceof Error ? cause.message : 'Não foi possível consultar a autorização de envio.') } })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!prepared || prepared.preparationKey === currentKey || sendState === 'confirming') return
    // A changed subject, document, revision or audience invalidates the server preparation.
    // oxlint-disable-next-line react/set-state-in-effect
    setPrepared(null)
    setSendState('idle')
    setMessage('Os dados da edição mudaram. Prepare o envio novamente antes de confirmar.')
  }, [currentKey, prepared, sendState])

  const prepare = async () => {
    if (deliveryEnabled !== true || sendState === 'preparing' || sendState === 'confirming' || sendState === 'sent') return
    setPrepared(null); setSendState('preparing'); setMessage('')
    try {
      const latest = await onPrepare()
      if (!latest.buttondownId || !latest.cloudRevision) throw new Error('Sincronize a edição antes de preparar o envio.')
      const result = await api.campaignDelivery({ action: 'prepare', draftId: latest.id, cloudRevision: latest.cloudRevision, audience })
      if (!result.attemptId || typeof result.recipientCount !== 'number' || !Number.isSafeInteger(result.recipientCount) || result.recipientCount < 1 || !result.cloudRevision || !result.subject || !result.audienceMode || !result.expiresAt) throw new Error('Não foi possível preparar o envio.')
      setPrepared({ ...result as PreparedCampaignDelivery, draftId: latest.id, preparationKey: preparationKey(latest, audience, count, recipients) })
      setSendState('ready')
      setMessage('Preparação concluída. Confira os dados retornados pelo servidor antes de confirmar.')
    } catch (cause) { setPrepared(null); setSendState('rejected'); setMessage(cause instanceof Error ? cause.message : 'Não foi possível preparar o envio.') }
  }

  const confirm = async () => {
    if (!prepared || sendState !== 'ready' || prepared.preparationKey !== currentKey) return
    if (Date.parse(prepared.expiresAt) <= Date.now()) {
      setPrepared(null); setSendState('rejected'); setMessage('A preparação expirou. Prepare o envio novamente antes de confirmar.'); return
    }
    setSendState('confirming'); setMessage('')
    try {
      const result = await api.campaignDelivery({ action: 'confirm', draftId: prepared.draftId, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true })
      if (!result.accepted) throw new Error('A Buttondown recusou o envio. Consulte o estado da campanha antes de tentar novamente.')
      setSendState('sent'); setMessage('Campanha aceita pela Buttondown.')
    } catch (cause) {
      if (isUncertain(cause)) {
        setSendState('uncertain')
        setMessage('Resultado incerto. Não repita o envio; consulte o histórico da campanha e a Buttondown.')
      } else {
        setPrepared(null); setSendState('rejected')
        setMessage(cause instanceof Error ? cause.message : 'A Buttondown recusou o envio.')
      }
    }
  }
  const preparedSummary = prepared && sendState !== 'idle' && sendState !== 'preparing' && sendState !== 'rejected' && prepared.preparationKey === currentKey ? prepared : null
  return <section className="send-summary" aria-label="Resumo do envio">
    <div className="send-summary-heading"><div><p className="eyebrow">ETAPA 04 · RESUMO</p><h1>Resumo</h1><p>Prepare o envio para visualizar os dados confirmados pelo servidor.</p></div><Button variant="outline" onClick={onTest} disabled={sendState === 'preparing' || sendState === 'confirming'}>Enviar email de teste</Button></div>
    {deliveryEnabled === false && <p className="send-delivery-status" role="status">Campanhas bloqueadas pelo proprietário. O envio está desativado neste ambiente.</p>}
    {deliveryEnabled === null && !deliveryStatusError && <p className="send-delivery-status" role="status">Verificando autorização de envio…</p>}
    {deliveryStatusError && <p className="send-summary-message is-error" role="alert"><Info size={16} />{deliveryStatusError}</p>}
    <div className="send-summary-layout"><div className="send-summary-card"><h2>Envio</h2><p>{preparedSummary ? 'A campanha será enviada imediatamente após sua confirmação final.' : 'Prepare o envio para conferir a audiência real antes da confirmação final.'}</p>{preparedSummary && <div className="send-server-summary" aria-label="Dados confirmados pelo servidor"><dl><div><dt>Assunto confirmado</dt><dd>{preparedSummary.subject}</dd></div><div><dt>Audiência confirmada</dt><dd>{preparedSummary.audienceMode === 'all_active' ? 'Todos os assinantes ativos' : 'Contatos selecionados'}</dd></div><div><dt>Destinatários confirmados</dt><dd>{preparedSummary.recipientCount}</dd></div></dl>{preparedSummary.selectedRecipients?.length ? <details><summary>Ver destinatários selecionados</summary><ul>{preparedSummary.selectedRecipients.map(recipient => <li key={recipient.id}>{recipient.email_address}</li>)}</ul></details> : null}<p className="send-preparation-expiry">Preparação válida até {expiryLabel(preparedSummary.expiresAt)}.</p></div>}<div className="send-summary-actions"><Button variant="outline" onClick={onBack} disabled={sendState === 'preparing' || sendState === 'confirming'}>Voltar à revisão</Button>{!preparedSummary && <Button icon={<Send size={15} />} disabled={deliveryEnabled !== true || sendState === 'preparing'} onClick={() => void prepare()}>{sendState === 'preparing' ? 'Preparando envio…' : 'Preparar envio'}</Button>}{preparedSummary && sendState === 'ready' && <Button icon={<Send size={15} />} onClick={() => void confirm()}>Confirmar e enviar campanha</Button>}{sendState === 'confirming' && <Button icon={<Send size={15} />} disabled>Confirmando envio…</Button>}{sendState === 'sent' && <Button disabled>Campanha aceita</Button>}</div>{message && <p className={`send-summary-message ${sendState === 'sent' ? 'is-success' : sendState === 'uncertain' ? 'is-warning' : 'is-error'}`} role={sendState === 'sent' ? 'status' : 'alert'}>{sendState === 'sent' ? <CheckCircle2 size={16} /> : <Info size={16} />}{message}</p>}</div><aside className="send-summary-side"><span className="eyebrow">FALTA POUCO</span><h2>{preparedSummary ? 'Dados reais da preparação' : 'Prepare antes de enviar'}</h2><p>{preparedSummary ? 'Estes dados foram retornados e validados pela API do CRM. A confirmação abaixo é uma ação separada.' : 'O resumo exibirá assunto, audiência, quantidade e seleção depois da preparação.'}</p>{preparedSummary ? <dl><div><dt>Assunto</dt><dd>{preparedSummary.subject}</dd></div><div><dt>Destinatários</dt><dd>{preparedSummary.recipientCount} · {preparedSummary.audienceMode === 'all_active' ? 'Todos os assinantes ativos' : 'Contatos selecionados'}</dd></div><div><dt>Validade</dt><dd>{expiryLabel(preparedSummary.expiresAt)}</dd></div></dl> : <p className="send-summary-pending">Clique em “Preparar envio” para consultar os dados atuais da Buttondown.</p>}</aside></div>
  </section>
}

