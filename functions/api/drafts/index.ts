import { errorResponse, json, safePage } from '../../_utils'
import type { AppEnv } from '../../_utils'
import { database } from '../../_documents'

export const onRequestGet = async ({ request, env }: { request: Request; env: AppEnv }) => {
  try {
    const page = safePage(new URL(request.url).searchParams.get('page'))
    if (!page) return json({ error: 'Página inválida.' }, 400)
    const data = await database(env).prepare("SELECT id, json_extract(payload, '$.subject') AS subject, json_extract(payload, '$.buttondownId') AS buttondownId, updated_at AS updatedAt, version AS cloudRevision FROM editorial_documents WHERE kind = 'draft' ORDER BY id LIMIT 101 OFFSET ?").bind((page - 1) * 100).all()
    return json({ results: data.results.slice(0, 100), next: data.results.length > 100 ? page + 1 : null })
  } catch (error) { return errorResponse(error) }
}
