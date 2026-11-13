import { isActiveSubscriberType } from '../shared/audience'
import { buttondown, json, type AppEnv } from './_utils'
import { validateSelectedSubscribers, type AudienceSubscriber } from './_subscriber-audience'
type Context = { request: Request; env: AppEnv }

// Immutable per campaign + exact selection: changing a preparation cannot widen
// the audience of a publication already queued by the provider.
export async function selectedAudienceKey(campaignId: string, subscribers: AudienceSubscriber[]) {
  if (!subscribers.length || subscribers.length > 500 || subscribers.some(s => !isActiveSubscriberType(s.type) || !s.email_address || !/^sub_[a-zA-Z0-9_-]+$/.test(s.id)) || new Set(subscribers.map(s => s.email_address.toLowerCase())).size !== subscribers.length || new Set(subscribers.map(s => s.id)).size !== subscribers.length) throw new Error('INVALID_SELECTED_AUDIENCE')
  const identity = subscribers.map(s => [s.id, s.email_address]).sort((a, b) => a[0].localeCompare(b[0]))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([campaignId, identity])))
  return 'crm_audience_' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function selectedAudienceFilters(key: string, subscribers: AudienceSubscriber[]) {
  if (!/^crm_audience_[a-f0-9]{64}$/.test(key) || !subscribers.length || subscribers.some(s => s.metadata?.[key] !== 'included')) throw json({ error: 'A segmentação ainda não está confirmada na Buttondown. Prepare o envio novamente.' }, 409)
  return { predicate: 'and', groups: [], filters: [{ field: `subscriber.metadata.${key}`, operator: 'equals', value: 'included' }] }
}
export async function prepareSelectedAudience(context: Context, campaignId: string, subscribers: AudienceSubscriber[]) {
  const key = await selectedAudienceKey(campaignId, subscribers)
  const missing = subscribers.filter(s => s.metadata?.[key] !== 'included').map(s => s.id)
  if (!missing.length) return
  // Never omit ids or send []: either means ALL subscribers in this API.
  const pending: string[] = []
  for (let offset = 0; offset < missing.length; offset += 200) {
    const action = await buttondown(context, '/bulk_actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'apply_metadata', metadata: { action: 'add', metadata: { [key]: 'included' }, ids: missing.slice(offset, offset + 200) } }) }) as { id?: string; status?: string }
    if (!action?.id || action.status === 'failed') throw json({ error: 'A Buttondown não conseguiu preparar a segmentação. Nenhum envio foi iniciado.' }, 502)
    if (action.status !== 'processed') pending.push(action.id)
  }
  for (let round = 0; pending.length && round < 3; round++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    for (let index = pending.length - 1; index >= 0; index--) {
      const action = await buttondown(context, `/bulk_actions/${encodeURIComponent(pending[index])}`) as { status?: string }
      if (action?.status === 'failed') throw json({ error: 'A Buttondown não conseguiu preparar a segmentação. Nenhum envio foi iniciado.' }, 502)
      if (action?.status === 'processed') pending.splice(index, 1)
    }
  }
  if (pending.length) throw json({ error: 'A Buttondown ainda está preparando os destinatários. Aguarde alguns instantes e prepare novamente; nenhum envio foi iniciado.' }, 409)
  const confirmed = await validateSelectedSubscribers(context, subscribers.map(s => s.id))
  if (await selectedAudienceKey(campaignId, confirmed) !== key) throw json({ error: 'Um destinatário mudou durante a preparação. Confira a seleção novamente.' }, 409)
  selectedAudienceFilters(key, confirmed)
}
