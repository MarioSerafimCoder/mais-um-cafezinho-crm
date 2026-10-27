import { buttondown, errorResponse, json, parseJson, safePage, isSafeEmailBody } from '../../_utils'
import type { AppEnv } from '../../_utils'

type Context = { request: Request; env: AppEnv }

function validDraft(value: unknown): value is { subject: string; body: string; status: 'draft' } {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return typeof draft.subject === 'string'
    && draft.subject.trim().length > 0
    && draft.subject.length <= 200
    && typeof draft.body === 'string'
    && isSafeEmailBody(draft.body)
    && draft.status === 'draft'
}

export const onRequestGet = async ({ request, env }: Context) => {
  const incoming = new URL(request.url)
  const page = safePage(incoming.searchParams.get('page'))
  if (!page) return json({ error: 'Página inválida.' }, 400)
  const params = new URLSearchParams({ page: String(page), ordering: '-creation_date' })
  const status = incoming.searchParams.get('status')
  if (status && ['draft', 'sent', 'scheduled'].includes(status)) params.set('status', status)
  try {
    const upstream = await buttondown({ request, env }, `/emails?${params}`) as { results?: unknown[]; count?: number; next?: string | null; previous?: string | null }
    return json({ results: Array.isArray(upstream.results) ? upstream.results : [], count: Number.isFinite(upstream.count) ? upstream.count : null, next: upstream.next || null, previous: upstream.previous || null })
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPost = async ({ request, env }: Context) => {
  try {
    const data = await parseJson(request)
    if (!validDraft(data)) return json({ error: 'Rascunho inválido. Confira assunto, conteúdo e status.' }, 400)
    const result = await buttondown({ request, env }, '/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return json(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
