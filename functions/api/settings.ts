import { errorResponse, json, parseJson } from '../_utils'
import type { AppEnv } from '../_utils'
import { getDocument, putDocument } from '../_documents'
import { safeUrl } from '../../shared/safety'

type Context = { request: Request; env: AppEnv }
export const onRequestGet = async ({ env }: Context) => {
  try { return json(await getDocument(env, 'settings', 'editorial')) } catch (error) { return errorResponse(error) }
}
export const onRequestPut = async ({ request, env }: Context) => {
  try {
    const data = await parseJson(request, 10_000) as Record<string, unknown>
    const fields = ['newsletterName', 'senderName', 'senderEmail', 'blogUrl', 'portfolioUrl', 'instagramUrl', 'linkedinUrl', 'theme']
    if (!data || fields.some((key) => typeof data[key] !== 'string' || String(data[key]).length > 2000) || !['light', 'dark'].includes(String(data.theme))) return json({ error: 'Configurações inválidas.' }, 400)
    if (fields.filter((key) => key.endsWith('Url')).some((key) => data[key] && !safeUrl(String(data[key])))) return json({ error: 'Há um link inválido nas configurações.' }, 400)
    const version = data.cloudRevision ?? 0
    if (!Number.isInteger(version) || Number(version) < 0) return json({ error: 'Versão inválida.' }, 400)
    return json(await putDocument(env, 'settings', 'editorial', Object.fromEntries(fields.map((key) => [key, data[key]])), Number(version)))
  } catch (error) { return errorResponse(error) }
}
