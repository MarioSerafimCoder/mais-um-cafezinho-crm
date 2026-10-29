import { useState } from 'react'
import { CheckCircle2, Info, Send } from 'lucide-react'
import { api } from '../lib/api'
import type { DraftRecord, Subscriber } from '../types'
import { Button } from './ui'

type Audience = { mode: 'all_active' } | { mode: 'selected'; subscriberIds: string[] }
type Props = { draft: DraftRecord; audience: Audience; count: number; recipients: Subscriber[]; onBack: () => void; onTest: () => void }

export function SendSummary({ draft, audience, count, recipients, onBack, onTest }: Props) {
  const [sendState, setSendState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const sendNow = async () => {
    if (sendState === 'busy' || sendState === 'sent') return
    setSendState('busy'); setMessage('')
    try {
      if (!draft.buttondownId || !draft.cloudRevision) throw new Error('Sincronize a edição antes de enviar.')
      const prepared = await api.campaignDelivery({ action: 'prepare', draftId: draft.id, cloudRevision: draft.cloudRevision, audience })
      if (!prepared.attemptId || !prepared.recipientCount) throw new Error('Não foi possível preparar o envio.')
      const result = await api.campaignDelivery({ action: 'confirm', draftId: draft.id, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true })
      if (!result.accepted) throw new Error('O provedor não confirmou o envio.')
      setSendState('sent'); setMessage(`Envio aceito para ${prepared.recipientCount} ${prepared.recipientCount === 1 ? 'destinatário' : 'destinatários'}.`)
    } catch (cause) { setSendState('error'); setMessage(cause instanceof Error ? cause.message : 'Não foi possível concluir o envio.') }
  }
  return <section className="send-summary" aria-label="Resumo do envio">
    <div className="send-summary-heading"><div><p className="eyebrow">ETAPA 04 · RESUMO</p><h1>Resumo</h1><p>Confira o último retrato da campanha antes de enviá-la.</p></div><Button variant="outline" onClick={onTest}>Enviar email de teste</Button></div>
    <div className="send-summary-layout"><div className="send-summary-card"><h2>Envio</h2><p>Esta campanha será enviada para a audiência selecionada abaixo.</p><label className="send-now-choice"><input type="radio" checked readOnly />Enviar agora</label><div className="send-summary-actions"><Button variant="outline" onClick={onBack}>Voltar à seleção</Button><Button icon={<Send size={15} />} disabled={sendState === 'busy' || sendState === 'sent'} onClick={() => void sendNow()}>{sendState === 'busy' ? 'Preparando…' : sendState === 'sent' ? 'Enviado' : 'Enviar campanha'}</Button></div>{message && <p className={`send-summary-message ${sendState === 'sent' ? 'is-success' : 'is-error'}`} role={sendState === 'sent' ? 'status' : 'alert'}>{sendState === 'sent' ? <CheckCircle2 size={16} /> : <Info size={16} />}{message}</p>}</div><aside className="send-summary-side"><span className="eyebrow">FALTA POUCO</span><h2>Revise os dados</h2><p>O destinatário final é atualizado no momento do envio. O rodapé de descadastro continua sendo acrescentado pela Buttondown.</p><dl><div><dt>Assunto</dt><dd>{draft.subject}</dd></div><div><dt>Destinatários</dt><dd>{count} · {audience.mode === 'all_active' ? 'Todos os assinantes ativos' : 'Contatos selecionados'}</dd></div><div><dt>Conteúdo</dt><dd>HTML compatível com a newsletter</dd></div></dl>{recipients.length > 0 && <details><summary>Ver seleção</summary><ul>{recipients.map(recipient => <li key={recipient.id}>{recipient.email_address}</li>)}</ul></details>}</aside></div>
  </section>
}

