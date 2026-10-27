import { buttondown, errorResponse, json, safePage, pageResult } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }

export const onRequestGet = async ({ request, env }: Context) => {
  const incoming = new URL(request.url)
  const page = safePage(incoming.searchParams.get('page'))
  const emailAddress = (incoming.searchParams.get('email_address') || '').trim()
  if (!page) return json({ error: 'Página inválida.' }, 400)
  if (emailAddress.length > 120) return json({ error: 'A busca pode ter até 120 caracteres.' }, 400)
  const params = new URLSearchParams({ page: String(page), ordering: '-creation_date' })
  if (emailAddress) params.set('email_address', emailAddress)
  try {
    const upstream = await buttondown({ request, env }, `/subscribers?${params}`) as { results?: unknown[]; count?: number; next?: string | null; previous?: string | null }
    return json(pageResult(upstream))
  } catch (error) {
    return errorResponse(error)
  }
}
