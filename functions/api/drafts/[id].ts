import { errorResponse, json, parseJson, validId } from '../../_utils'
import type { AppEnv } from '../../_utils'
import { database, getDocument, putDocument } from '../../_documents'
import { isEditorDocument, isSafeEmailBody } from '../../../shared/safety'
import { isGrapesDocument } from '../../../shared/grapes-document'

type Context = { request: Request; env: AppEnv; params: { id: string } }
export const onRequestGet = async ({ env, params, request }: Context) => {
  try {
    if (!validId(params.id)) return json({ error: 'Identificador inválido.' }, 400)
    if (new URL(request.url).searchParams.get('original') === '1') {
      const row = await database(env).prepare('SELECT payload, version, updated_at FROM editorial_originals WHERE id = ?').bind(params.id).first<{ payload: string; version: number; updated_at: string }>()
      if (!row) return json({ error: 'Original não encontrado.' }, 404)
      return json({ ...JSON.parse(row.payload), cloudRevision: row.version, lastCloudSavedAt: row.updated_at })
    }
    try { return json(await getDocument(env, 'draft', params.id)) }
    catch (error) {
      if (!(error instanceof Response && error.status === 404)) throw error
      const linked = await database(env).prepare("SELECT id FROM editorial_documents WHERE kind = 'draft' AND json_extract(payload, '$.buttondownId') = ? ORDER BY version DESC LIMIT 1").bind(params.id).first<{ id: string }>()
      if (!linked) throw error
      return json(await getDocument(env, 'draft', linked.id))
    }
  } catch (error) { return errorResponse(error) }
}

export const onRequestPut = async ({ request, env, params }: Context) => {
  try {
    if (!validId(params.id)) return json({ error: 'Identificador inválido.' }, 400)
    const body = await parseJson(request, 450_000) as Record<string, unknown>
    if (!body || body.id !== params.id || body.status !== 'draft' || typeof body.subject !== 'string' || body.subject.length > 200 || typeof body.content !== 'string' || !isSafeEmailBody(body.content) || !(body.schemaVersion === 3 ? isGrapesDocument(body.document) : (body.schemaVersion === undefined || body.schemaVersion === 2) && isEditorDocument(body.document))
      || (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 200))
      || (body.buttondownTemplate !== undefined && body.buttondownTemplate !== 'classic' && body.buttondownTemplate !== 'modern')
      || (body.editionDate !== undefined && (typeof body.editionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.editionDate)))) return json({ error: 'Documento editorial inválido.' }, 400)
    const version = body.cloudRevision ?? 0
    if (!Number.isInteger(version) || Number(version) < 0) return json({ error: 'Versão inválida.' }, 400)
    if (body.migration !== undefined) {
      const migration = body.migration as Record<string, unknown> | null
      if (!migration || migration.version !== 1 || ![1, 2].includes(Number(migration.sourceSchema)) || !Number.isSafeInteger(migration.sourceRevision) || Number(migration.sourceRevision) < 0) return json({ error: 'Metadados de migração inválidos.' }, 400)
    }
    // Store editorial documents only. No subscribers or credentials belong in D1.
    if (body.syncedCampaignHash !== undefined && (typeof body.syncedCampaignHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.syncedCampaignHash))) return json({ error: 'Hash de campanha inválido.' }, 400)
    if (body.syncedBodyHash !== undefined && (typeof body.syncedBodyHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.syncedBodyHash))) return json({ error: 'Hash de sincronização inválido.' }, 400)
    const allowed = ['id', 'subject', 'description', 'buttondownTemplate', 'editionDate', 'content', 'document', 'schemaVersion', 'templateId', 'buttondownId', 'status', 'updatedAt', 'revision', 'lastSyncedAt', 'syncedRevision', 'syncedBodyHash', 'syncedCampaignHash', 'createKey', 'pendingCreate', 'migration']
    const payload = Object.fromEntries(allowed.filter((key) => key in body).map((key) => [key, body[key]]))
    payload.cloudSavedRevision = Number.isSafeInteger(body.revision) ? body.revision : 0
    if (body.schemaVersion === 3) {
      // Copy from D1 itself, never from a client-supplied "original". If backup
      // fails, no migrated write is attempted. CAS still protects concurrent edits.
      await database(env).prepare("INSERT OR IGNORE INTO editorial_originals (id, payload, version, updated_at) SELECT id, payload, version, updated_at FROM editorial_documents WHERE kind = 'draft' AND id = ? AND version = ? AND COALESCE(json_extract(payload, '$.schemaVersion'), 1) < 3").bind(params.id, Number(version)).run()
    }
    return json(await putDocument(env, 'draft', params.id, payload, Number(version)))
  } catch (error) { return errorResponse(error) }
}
