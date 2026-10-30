import { activeSubscriberQuery, isActiveSubscriberType } from '../shared/audience'
import { buttondown, json, pageResult, type AppEnv } from './_utils'
type Context = { request: Request; env: AppEnv }
export type AudienceSubscriber = { id: string; email_address: string; type: string }
export async function subscriberPage(context: Context, query: URLSearchParams) {
  for (let retry = 0; ; retry++) {
    try { return pageResult(await buttondown(context, `/subscribers?${query}`)) }
    catch (error) {
      const rate = error as { status?: number; retryAfterMs?: number }
      if (rate.status !== 429 || retry >= 2 || Number(rate.retryAfterMs) > 5000) throw error
      await new Promise(resolve => setTimeout(resolve, Math.max(250 * 2 ** retry, rate.retryAfterMs || 0)))
    }
  }
}
export async function countActiveSubscribers(context: Context) {
  const page = await subscriberPage(context, activeSubscriberQuery({ page: '1' }))
  if (page.count === null) throw new Error('INVALID_SUBSCRIBER_COUNT')
  return page.count
}
export async function validateSelectedSubscribers(context: Context, ids: string[]) {
  const results = new Map<string, AudienceSubscriber>()
  const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50))
  let next = 0; let failed = false
  await Promise.all([0, 1].map(async () => {
    while (!failed && next < batches.length) {
      const batch = batches[next++]
      try {
        for (let page = 1; ; page++) {
          if (page > 50) throw new Error('SUBSCRIBER_PAGINATION_LIMIT')
          const query = new URLSearchParams({ page: String(page) })
          batch.forEach(id => query.append('ids', id))
          const data = await subscriberPage(context, query)
          for (const raw of data.results) {
            const subscriber = raw as AudienceSubscriber
            if (!subscriber || !batch.includes(subscriber.id) || results.has(subscriber.id) || !isActiveSubscriberType(subscriber.type) || typeof subscriber.email_address !== 'string') throw json({ error: 'Um contato selecionado mudou ou está indisponível. Atualize a seleção.' }, 409)
            results.set(subscriber.id, subscriber)
          }
          if (!data.next) break
          if (!data.results.length) throw new Error('EMPTY_SUBSCRIBER_PAGE')
        }
      } catch (error) { failed = true; throw error }
    }
  }))
  if (results.size !== ids.length) throw json({ error: 'A seleção mudou ou contém contatos indisponíveis. Atualize os destinatários.' }, 409)
  return ids.map(id => results.get(id)!)
}
