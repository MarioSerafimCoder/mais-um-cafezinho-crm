import type { AppEnv } from './_utils'
import { json } from './_utils'

export type StoredDocument = { payload: string; version: number; updated_at: string }
export function database(env: AppEnv) {
  if (!env.DB) throw json({ error: 'Recuperação entre dispositivos não configurada. O rascunho continua salvo neste navegador.' }, 503)
  return env.DB
}

export async function getDocument(env: AppEnv, kind: 'draft' | 'settings', id: string) {
  const db = database(env)
  // Delivery immediately follows a write. Start on D1's primary so this
  // validation cannot see a lagging replica after an automatic sync.
  const session = typeof db.withSession === 'function' ? db.withSession('first-primary') : db
  const row = await session.prepare('SELECT payload, version, updated_at FROM editorial_documents WHERE kind = ? AND id = ?').bind(kind, id).first<StoredDocument>()
  if (!row) throw json({ error: 'Documento não encontrado na nuvem.' }, 404)
  return { ...JSON.parse(row.payload), cloudRevision: row.version, lastCloudSavedAt: row.updated_at }
}

export async function putDocument(env: AppEnv, kind: 'draft' | 'settings', id: string, payload: Record<string, unknown>, expectedVersion: number) {
  const db = database(env)
  const now = new Date().toISOString()
  const text = JSON.stringify(payload)
  const result = expectedVersion === 0
    ? await db.prepare('INSERT OR IGNORE INTO editorial_documents (kind, id, payload, version, updated_at) VALUES (?, ?, ?, 1, ?)').bind(kind, id, text, now).run()
    : await db.prepare('UPDATE editorial_documents SET payload = ?, version = version + 1, updated_at = ? WHERE kind = ? AND id = ? AND version = ?').bind(text, now, kind, id, expectedVersion).run()
  if (!result.meta.changes) throw json({ error: 'Outra versão foi salva na nuvem. Sua cópia local foi preservada. Reabra a versão remota antes de substituir qualquer conteúdo.' }, 409)
  // Return the confirmed version, never a later writer's document.
  return { ...payload, cloudRevision: expectedVersion + 1, lastCloudSavedAt: now }
}
