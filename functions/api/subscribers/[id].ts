import { buttondown, errorResponse, json, parseJson, validId } from '../../_utils'
import type { AppEnv } from '../../_utils'

export const onRequestDelete = async ({ request, env, params }: { request: Request; env: AppEnv; params: { id: string } }) => {
  if (!validId(params.id)) return json({ error: 'Contato inválido.' }, 400)
  try {
    const input = await parseJson(request, 2_000)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Confirmação de exclusão obrigatória.' }, 400)
    const values = input as Record<string, unknown>
    if (Object.keys(values).some(key => key !== 'confirmationEmail') || typeof values.confirmationEmail !== 'string') return json({ error: 'Confirmação de exclusão obrigatória.' }, 400)
    const confirmationEmail = values.confirmationEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(confirmationEmail)) return json({ error: 'Informe o e-mail exato do contato para confirmar a exclusão.' }, 400)
    const subscriber = await buttondown({ request, env }, `/subscribers/${encodeURIComponent(params.id)}`) as { email_address?: unknown }
    if (typeof subscriber.email_address !== 'string' || subscriber.email_address.trim().toLowerCase() !== confirmationEmail) return json({ error: 'O e-mail de confirmação não corresponde ao contato.' }, 409)
    await buttondown({ request, env }, `/subscribers/${encodeURIComponent(params.id)}`, { method: 'DELETE' })
    return json({ deleted: true })
  } catch (error) { return errorResponse(error) }
}
