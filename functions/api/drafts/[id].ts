import { errorResponse, json, parseJson, validId } from '../../_utils'
import type { AppEnv } from '../../_utils'
import { getDocument, putDocument } from '../../_documents'
import { isEditorDocument, isSafeEmailBody } from '../../../shared/safety'

type Context = { request: Request; env: AppEnv; params: { id: string } }
export const onRequestGet = async ({ env, params }: Context) => {
  try {
    if (!validId(params.id)) return json({ error: 'Identificador inválido.' }, 400)
    return json(await getDocument(env, 'draft', params.id))
  } catch (error) { return errorResponse(error) }
}

export const onRequestPut = async ({ request, env, params }: Context) => {
  try {
    if (!validId(params.id)) return json({ error: 'Identificador inválido.' }, 400)
    const body = await parseJson(request, 450_000) as Record<string, unknown>
    if (!body || body.id !== params.id || body.status !== 'draft' || typeof body.subject !== 'string' || body.subject.length > 200 || typeof body.content !== 'string' || !isSafeEmailBody(body.content) || !isEditorDocument(body.document)) return json({ error: 'Documento editorial inválido.' }, 400)
    const version = body.cloudRevision ?? 0
    if (!Number.isInteger(version) || Number(version) < 0) return json({ error: 'Versão inválida.' }, 400)
    // Store editorial documents only. No subscribers or credentials belong in D1.
    const allowed = ['id', 'subject', 'content', 'document', 'schemaVersion', 'templateId', 'buttondownId', 'status', 'updatedAt', 'revision', 'lastSyncedAt', 'syncedRevision', 'createKey', 'pendingCreate']
    const payload = Object.fromEntries(allowed.filter((key) => key in body).map((key) => [key, body[key]]))
    return json(await putDocument(env, 'draft', params.id, payload, Number(version)))
  } catch (error) { return errorResponse(error) }
}
