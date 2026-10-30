import { byteLength } from '../shared/safety'
import type { D1Database } from '@cloudflare/workers-types'
export { isSafeEmailBody } from '../shared/safety'

export type AppEnv = {
  BUTTONDOWN_API_KEY?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  LOCAL_ACCESS_BYPASS?: string
  DB?: D1Database
  DEMO_MODE?: string
  ENVIRONMENT?: string
  EDITORIAL_TEST_ENABLED?: string
  EDITORIAL_TEST_RECIPIENTS?: string
  CAMPAIGN_SENDING_ENABLED?: string
}

type RequestContext = {
  request: Request
  env: AppEnv
  params?: Record<string, string>
}

const apiBase = 'https://api.buttondown.com/v1'
const apiVersion = '2026-04-01'

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function readLimitedBody(request: Request, limit: number) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > limit) throw new Response('Corpo da solicitação muito grande.', { status: 413 })
  const reader = request.body?.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  if (reader) while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); throw new Response('Corpo da solicitação muito grande.', { status: 413 }) }
    parts.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return bytes
}

export async function parseJson(request: Request, limit = 220_000) {
  const text = new TextDecoder().decode(await readLimitedBody(request, limit))
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Response('JSON inválido.', { status: 400 })
  }
}

function retryAfterMs(value: string | null) {
  if (!value) return 1000
  const seconds = Number(value)
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(value) - Date.now()) || 1000
}

export async function buttondown(context: RequestContext, path: string, init: RequestInit = {}) {
  const key = context.env.BUTTONDOWN_API_KEY?.trim()
  if (!key) throw new Error('BUTTONDOWN_NOT_CONFIGURED')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Token ${key}`)
  headers.set('X-API-Version', apiVersion)
  headers.set('Accept', 'application/json')
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) throw new Error('INVALID_UPSTREAM_PATH')
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (response.status >= 300 && response.status < 400) throw new TypeError('Unexpected Buttondown redirect')
  if (!response.ok) {
    const error = new Error(`BUTTONDOWN_${response.status}`)
    Object.assign(error, { status: response.status, retryAfterMs: retryAfterMs(response.headers.get('Retry-After')) })
    throw error
  }
  if (response.status === 204) return null
  return response.json() as Promise<unknown>
}

export function errorResponse(error: unknown) {
  if (error instanceof Response) return error
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0
  if (error instanceof Error && error.message === 'BUTTONDOWN_NOT_CONFIGURED') {
    return json({ error: 'Integração com Buttondown não configurada.' }, 503)
  }
  if (error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)) return json({ error: 'A conexão com a Buttondown falhou. Seu rascunho local foi preservado.' }, 502)
  const messages: Record<number, string> = {
    401: 'A chave da Buttondown não foi aceita. Confira a configuração.',
    403: 'A chave da Buttondown não tem permissão para esta operação.',
    404: 'O item não foi encontrado na Buttondown.',
    409: 'A Buttondown encontrou um conflito ao salvar este rascunho.',
    422: 'A Buttondown não aceitou os dados deste rascunho. Confira o conteúdo.',
    429: 'A Buttondown está limitando as solicitações. Aguarde um pouco e tente novamente.',
    400: 'A Buttondown recusou o formato do rascunho. Revise o conteúdo antes de tentar novamente.',
  }
  if (status) return json({ error: messages[status] || 'A Buttondown não concluiu a solicitação.' }, status >= 500 ? 502 : status)
  return json({ error: 'Não foi possível concluir a solicitação agora.' }, 500)
}

export function pageResult(value: unknown) {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { results?: unknown }).results)) throw new Error('INVALID_UPSTREAM_RESPONSE')
  const page = value as { results: unknown[]; count?: number; next?: string | null; previous?: string | null }
  return { ...page, count: Number.isInteger(page.count) && Number(page.count) >= 0 ? page.count! : null, next: page.next || null, previous: page.previous || null }
}

export function validId(value: string) { return /^[a-zA-Z0-9_-]{1,80}$/.test(value) }

// A null template inherits the newsletter default; the email endpoint does not
// expose that default alongside the campaign, so only explicit overrides compare.
export function matchesButtondownTemplate(actual: string | null | undefined, expected: string | undefined) {
  const desired = expected || 'classic'
  return actual == null || actual === desired
}

export function draftPayload(value: unknown): { subject: string; body: string; status: 'draft'; description?: string; template?: 'classic' | 'modern' } | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (typeof data.subject !== 'string' || !data.subject.trim() || data.subject.length > 200 || typeof data.body !== 'string' || byteLength(data.body) > 200_000 || data.status !== 'draft') return null
  if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 200 || /<[^>]*>/.test(data.description))) return null
  if (data.template !== undefined && data.template !== 'classic' && data.template !== 'modern') return null
  return {
    subject: data.subject.trim(), body: data.body, status: 'draft',
    ...(typeof data.description === 'string' ? { description: data.description.trim() } : {}),
    ...(data.template === 'classic' || data.template === 'modern' ? { template: data.template } : {}),
  }
}

export function safePage(value: string | null) {
  const page = Number(value || 1)
  return Number.isInteger(page) && page > 0 && page <= 100_000 ? page : null
}

export function contextWithParams(context: RequestContext) {
  return context
}
