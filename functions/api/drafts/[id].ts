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
    if (!body || body.id !== params.id || body.status !== 'draft' || typeof body.subject !== 'string' || body.subject.length > 200 || typeof body.content !== 'string' || !isSafeEmailBody(body.content) || !isEditorDocument(body.document)
      || (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 200))
      || (body.buttondownTemplate !== undefined && body.buttondownTemplate !== 'classic' && body.buttondownTemplate !== 'modern')
      || (body.editionDate !== undefined && (typeof body.editionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.editionDate)))) return json({ error: 'Documento editorial inválido.' }, 400)
    const version = body.cloudRevision ?? 0
    if (!Number.isInteger(version) || Number(version) < 0) return json({ error: 'Versão inválida.' }, 400)
    // Store editorial documents only. No subscribers or credentials belong in D1.
    if (body.syncedBodyHash !== undefined && (typeof body.syncedBodyHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.syncedBodyHash))) return json({ error: 'Hash de sincronização inválido.' }, 400)
    const allowed = ['id', 'subject', 'description', 'buttondownTemplate', 'editionDate', 'content', 'document', 'schemaVersion', 'templateId', 'buttondownId', 'status', 'updatedAt', 'revision', 'lastSyncedAt', 'syncedRevision', 'syncedBodyHash', 'createKey', 'pendingCreate']
    const payload = Object.fromEntries(allowed.filter((key) => key in body).map((key) => [key, body[key]]))
    payload.cloudSavedRevision = Number.isSafeInteger(body.revision) ? body.revision : 0
    return json(await putDocument(env, 'draft', params.id, payload, Number(version)))
  } catch (error) { return errorResponse(error) }
}
