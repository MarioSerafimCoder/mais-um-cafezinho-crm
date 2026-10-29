import { buttondown, errorResponse, json, validId } from '../../_utils'
import type { AppEnv } from '../../_utils'

export const onRequestDelete = async ({ request, env, params }: { request: Request; env: AppEnv; params: { id: string } }) => {
  if (!validId(params.id)) return json({ error: 'Contato inválido.' }, 400)
  try {
    await buttondown({ request, env }, `/subscribers/${encodeURIComponent(params.id)}`, { method: 'DELETE' })
    return json({ deleted: true })
  } catch (error) { return errorResponse(error) }
}
