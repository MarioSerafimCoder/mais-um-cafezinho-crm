import { buttondown, errorResponse, json, parseJson, safePage, isSafeEmailBody, draftPayload, pageResult } from '../../_utils'
import type { AppEnv } from '../../_utils'

type Context = { request: Request; env: AppEnv }

function validDraft(value: unknown): value is { subject: string; body: string; status: 'draft'; description?: string; template?: 'classic' | 'modern' } {
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
    return json(pageResult(upstream))
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPost = async ({ request, env }: Context) => {
  try {
    const data = draftPayload(await parseJson(request))
    if (!validDraft(data)) return json({ error: 'Rascunho inválido. Confira assunto, conteúdo e status.' }, 400)
    const key = request.headers.get('X-Idempotency-Key')
    if (!key || !/^[a-zA-Z0-9_-]{16,200}$/.test(key)) return json({ error: 'Identificador de criação ausente ou inválido. Salve o rascunho localmente e tente novamente.' }, 400)
    const result = await buttondown({ request, env }, '/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
      body: JSON.stringify(data),
    })
    return json(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
