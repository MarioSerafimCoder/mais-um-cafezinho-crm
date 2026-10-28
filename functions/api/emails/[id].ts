import { buttondown, errorResponse, json, parseJson, isSafeEmailBody, draftPayload } from '../../_utils'
import type { AppEnv } from '../../_utils'

type Context = { request: Request; env: AppEnv; params: { id: string } }

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value)
}

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

export const onRequestGet = async ({ request, env, params }: Context) => {
  if (!validId(params.id)) return json({ error: 'Identificador inválido.' }, 400)
  try {
    const result = await buttondown({ request, env }, `/emails/${encodeURIComponent(params.id)}`)
    return json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPatch = async ({ request, env, params }: Context) => {
  if (!validId(params.id)) return json({ error: 'Identificador inválido.' }, 400)
  try {
    const data = draftPayload(await parseJson(request))
    if (!validDraft(data)) return json({ error: 'Apenas alterações em rascunhos são permitidas.' }, 400)
    const existing = await buttondown({ request, env }, `/emails/${encodeURIComponent(params.id)}`) as { status?: string; body?: string; subject?: string; description?: string; template?: string }
    if (existing.status !== 'draft') return json({ error: 'Este email não é um rascunho e não pode ser alterado por este painel.' }, 409)
    // Reconcile an acknowledged-by-provider but lost-to-client update before retrying.
    if (existing.body === data.body && existing.subject === data.subject && (existing.description || '') === (data.description || '') && (!data.template || existing.template === data.template)) return json(existing)
    const expected = request.headers.get('X-Expected-Body-Hash')
    if (expected) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(existing.body || ''))
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (actual !== expected) return json({ error: 'O conteúdo mudou na plataforma. As duas versões foram preservadas; confira o rascunho remoto antes de continuar.' }, 409)
    }
    const result = await buttondown({ request, env }, `/emails/${encodeURIComponent(params.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
