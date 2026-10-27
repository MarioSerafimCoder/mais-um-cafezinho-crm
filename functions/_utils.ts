export type AppEnv = {
  BUTTONDOWN_API_KEY?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  LOCAL_ACCESS_BYPASS?: string
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

export async function parseJson(request: Request, limit = 220_000) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > limit) throw new Response('Corpo da solicitação muito grande.', { status: 413 })
  const text = await request.text()
  if (text.length > limit) throw new Response('Corpo da solicitação muito grande.', { status: 413 })
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Response('JSON inválido.', { status: 400 })
  }
}

export async function buttondown(context: RequestContext, path: string, init: RequestInit = {}) {
  const key = context.env.BUTTONDOWN_API_KEY?.trim()
  if (!key) throw new Error('BUTTONDOWN_NOT_CONFIGURED')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Token ${key}`)
  headers.set('X-API-Version', apiVersion)
  headers.set('Accept', 'application/json')
  const response = await fetch(`${apiBase}${path}`, { ...init, headers })
  if (!response.ok) {
    const error = new Error(`BUTTONDOWN_${response.status}`)
    Object.assign(error, { status: response.status })
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
  const messages: Record<number, string> = {
    401: 'A chave da Buttondown não foi aceita. Confira a configuração.',
    403: 'A chave da Buttondown não tem permissão para esta operação.',
    404: 'O item não foi encontrado na Buttondown.',
    409: 'A Buttondown encontrou um conflito ao salvar este rascunho.',
    422: 'A Buttondown não aceitou os dados deste rascunho. Confira o conteúdo.',
    429: 'A Buttondown está limitando as solicitações. Aguarde um pouco e tente novamente.',
  }
  if (status) return json({ error: messages[status] || 'A Buttondown não concluiu a solicitação.' }, status >= 500 ? 502 : status)
  return json({ error: 'Não foi possível concluir a solicitação agora.' }, 500)
}

export function safePage(value: string | null) {
  const page = Number(value || 1)
  return Number.isInteger(page) && page > 0 && page <= 100_000 ? page : null
}

export function isSafeEmailBody(body: string) {
  return body.length <= 200_000
    && !/<\s*(script|iframe|object|embed)\b/i.test(body)
    && !/\s(?:href|src)\s*=\s*["']?\s*javascript:/i.test(body)
}

export function contextWithParams(context: RequestContext) {
  return context
}
