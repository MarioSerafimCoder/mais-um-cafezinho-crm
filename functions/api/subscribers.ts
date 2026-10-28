import { buttondown, errorResponse, json, safePage, pageResult, parseJson } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }

export const onRequestGet = async ({ request, env }: Context) => {
  const incoming = new URL(request.url)
  const page = safePage(incoming.searchParams.get('page'))
  const emailAddress = (incoming.searchParams.get('email_address') || '').trim()
  const type = incoming.searchParams.get('type')
  if (!page) return json({ error: 'Página inválida.' }, 400)
  if (emailAddress.length > 120) return json({ error: 'A busca pode ter até 120 caracteres.' }, 400)
  if (type && !['regular', 'premium'].includes(type)) return json({ error: 'Status de assinante inválido.' }, 400)
  const params = new URLSearchParams({ page: String(page), ordering: '-creation_date' })
  if (emailAddress) params.set('email_address', emailAddress)
  if (type) params.set('type', type)
  try {
    const upstream = await buttondown({ request, env }, `/subscribers?${params}`) as { results?: unknown[]; count?: number; next?: string | null; previous?: string | null }
    return json(pageResult(upstream))
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPost = async ({ request, env }: Context) => {
  try {
    const input = await parseJson(request, 2_000)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Solicitação inválida.' }, 400)
    const values = input as Record<string, unknown>
    if (Object.keys(values).some((key) => key !== 'email_address') || typeof values.email_address !== 'string') return json({ error: 'Informe somente o e-mail do novo assinante.' }, 400)
    const emailAddress = values.email_address.trim().toLowerCase()
    if (emailAddress.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) return json({ error: 'Informe um endereço de e-mail válido.' }, 400)

    const search = new URLSearchParams({ email_address: emailAddress, page: '1' })
    const current = await buttondown({ request, env }, `/subscribers?${search}`) as { results?: Array<{ email_address?: unknown; type?: unknown }> }
    if (!Array.isArray(current?.results)) throw new Error('INVALID_SUBSCRIBER_RESPONSE')
    const existing = current.results?.find((subscriber) => typeof subscriber.email_address === 'string' && subscriber.email_address.toLowerCase() === emailAddress)
    if (existing) return json({ error: 'Esse e-mail já está na base. Nenhum cadastro existente foi alterado.', existingType: typeof existing.type === 'string' ? existing.type : undefined }, 409)

    const created = await buttondown({ request, env }, '/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: emailAddress }),
    }) as { id?: unknown; email_address?: unknown; type?: unknown; creation_date?: unknown }
    if (typeof created.id !== 'string' || typeof created.email_address !== 'string' || created.email_address.toLowerCase() !== emailAddress || typeof created.type !== 'string') {
      return json({ error: 'A Buttondown respondeu sem confirmar o cadastro. Atualize a lista antes de repetir.' }, 502)
    }
    return json({ id: created.id, email_address: created.email_address, type: created.type, creation_date: typeof created.creation_date === 'string' ? created.creation_date : null }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
