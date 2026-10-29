import { buttondown, errorResponse, json, parseJson, validId } from '../_utils'
import type { AppEnv } from '../_utils'
import { database } from '../_documents'

export const onRequestPost = async ({ request, env }: { request: Request; env: AppEnv }) => {
  try {
    const input = await parseJson(request, 2000) as { draftId?: string; campaignId?: string }
    if (!input || (!input.draftId && !input.campaignId) || [input.draftId, input.campaignId].some(id => id !== undefined && (typeof id !== 'string' || !validId(id)))) return json({ error: 'Edição inválida.' }, 400)
    const db = database(env)
    const row = input.draftId ? await db.prepare("SELECT payload FROM editorial_documents WHERE kind = 'draft' AND id = ?").bind(input.draftId).first<{ payload: string }>() : null
    const campaignId = row ? JSON.parse(row.payload).buttondownId || input.campaignId : input.campaignId
    if (campaignId) {
      try { await buttondown({ request, env }, `/emails/${encodeURIComponent(campaignId)}`, { method: 'DELETE' }) }
      catch (error) { if (!(error && typeof error === 'object' && 'status' in error && error.status === 404)) throw error }
    }
    // Delete every linked editor copy only after the provider acknowledges deletion.
    await db.prepare("DELETE FROM editorial_documents WHERE kind = 'draft' AND (id = ? OR json_extract(payload, '$.buttondownId') = ?)").bind(input.draftId || '', campaignId || '').run()
    return json({ deleted: true, campaignId: campaignId || null })
  } catch (error) { return errorResponse(error) }
}
