import { buttondown, errorResponse, json, pageResult } from '../_utils'
import type { AppEnv } from '../_utils'

export const onRequestGet = async ({ request, env }: { request: Request; env: AppEnv }) => {
  const configured = Boolean(env.BUTTONDOWN_API_KEY?.trim())
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  const demo = !configured && local && env.ENVIRONMENT === 'development' && env.DEMO_MODE === 'true'
  if (!configured) return json({ configured, connected: false, demo, cloud: Boolean(env.DB), reason: demo ? 'Demonstração local' : 'Chave Buttondown não configurada.' })
  try {
    pageResult(await buttondown({ request, env }, '/subscribers?page=1'))
    return json({ configured: true, connected: true, demo: false, cloud: Boolean(env.DB) })
  } catch (error) {
    const failure = errorResponse(error)
    const details = await failure.json() as { error: string }
    return json({ configured: true, connected: false, demo: false, cloud: Boolean(env.DB), reason: details.error })
  }
}
