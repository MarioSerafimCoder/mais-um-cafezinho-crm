import type { CampaignAttempt } from '../types'

export function deliveryStatus(attempt: Pick<CampaignAttempt, 'provider_status' | 'delivery' | 'publication_verified'>) {
  if (attempt.publication_verified === false) return { title: 'Publicação divergente', detail: 'O estado remoto não corresponde à publicação esperada. Verifique a campanha na Buttondown.', warning: true }
  const metrics = attempt.delivery
  if (metrics && ((metrics.permanent_failures || 0) > 0 || (metrics.temporary_failures || 0) > 0)) return { title: 'Falha de entrega registrada', detail: `${metrics.temporary_failures || 0} falha(s) temporária(s) e ${metrics.permanent_failures || 0} permanente(s). Consulte os destinatários na Buttondown.`, warning: true }
  if (attempt.provider_status === 'sent' && metrics?.recipients === 0) return { title: 'Nenhum destinatário recebeu o disparo', detail: 'A Buttondown concluiu a publicação com zero destinatários. Revise a audiência antes de preparar outra edição.', warning: true }
  if (metrics?.deliveries && metrics.deliveries > 0) return { title: 'Entregas registradas pelo provedor', detail: `${metrics.deliveries} entrega(s) registrada(s)${metrics.recipients === undefined ? '' : ` para ${metrics.recipients} destinatário(s)`}. Isso não confirma a pasta de entrada nem a leitura.`, warning: false }
  const labels: Record<string, string> = { scheduled: 'Agendada na Buttondown', about_to_send: 'Na fila de envio', in_flight: 'Envio em andamento', throttled: 'Envio limitado pelo provedor', resending: 'Provedor retomando o envio', partially_sent: 'Envio parcial', sent: 'Envio concluído na Buttondown', draft: 'Campanha ainda em rascunho' }
  return { title: labels[attempt.provider_status || ''] || 'Solicitação aceita pela Buttondown', detail: attempt.provider_status === 'sent' ? 'A entrega ao destinatário ainda não foi comprovada. Consulte os registros abaixo ou a Buttondown.' : 'A entrega ainda não foi confirmada. O estado será consultado sem repetir o envio.', warning: true }
}
