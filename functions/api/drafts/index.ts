import { errorResponse, json } from '../../_utils'
import type { AppEnv } from '../../_utils'
import { database } from '../../_documents'

export const onRequestGet = async ({ request, env }: { request: Request; env: AppEnv }) => {
  try {
    const cursor = new URL(request.url).searchParams.get('cursor')
    let boundary: [string, string] | undefined
    if (cursor) {
      try {
        const parsed = JSON.parse(cursor)
        if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some(v => typeof v !== 'string') || !Number.isFinite(Date.parse(parsed[0])) || parsed[1].length > 200) throw new Error()
        boundary = parsed as [string, string]
      } catch { return json({ error: 'Cursor inválido.' }, 400) }
    }
    const sql = "SELECT id, json_extract(payload, '$.subject') AS subject, json_extract(payload, '$.buttondownId') AS buttondownId, json_extract(payload, '$.revision') AS revision, json_extract(payload, '$.syncedRevision') AS syncedRevision, json_extract(payload, '$.cloudSavedRevision') AS cloudSavedRevision, updated_at AS updatedAt, version AS cloudRevision FROM editorial_documents WHERE kind = 'draft'"
    const query = database(env).prepare(sql + (boundary ? ' AND (updated_at < ? OR (updated_at = ? AND id > ?))' : '') + ' ORDER BY updated_at DESC, id ASC LIMIT 101')
    const data = await (boundary ? query.bind(boundary[0], boundary[0], boundary[1]) : query).all<{ id: string; updatedAt: string }>()
    const results = data.results.slice(0, 100)
    const last = results.at(-1)
    return json({ results, next: data.results.length > 100 && last ? JSON.stringify([last.updatedAt, last.id]) : null })
  } catch (error) { return errorResponse(error) }
}
