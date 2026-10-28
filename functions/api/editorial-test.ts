import { database, getDocument } from '../_documents'
import { buttondown, errorResponse, json, parseJson, validId, type AppEnv } from '../_utils'

function recipients(env: AppEnv) {
  return (env.EDITORIAL_TEST_RECIPIENTS || '').split(',').map(s => s.trim()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}
export const onRequestGet = ({ env }: { env: AppEnv }) => json({ enabled: env.EDITORIAL_TEST_ENABLED === 'true', recipients: recipients(env) })

// No subscriber IDs, campaign status mutations or publication endpoints are accepted.
export async function onRequestPost({ request, env }: { request: Request; env: AppEnv }) {
  try {
    if (env.EDITORIAL_TEST_ENABLED !== 'true') return json({ error: 'Homologação desativada pelo proprietário.' }, 403)
    const raw = await parseJson(request, 4096)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'Solicitação inválida.' }, 400)
    const input = raw as Record<string, unknown>
    if (Object.keys(input).some(k => !['draftId', 'cloudRevision', 'recipientIndex', 'attemptId', 'confirm'].includes(k))) return json({ error: 'Campos não permitidos.' }, 400)
    if (typeof input.draftId !== 'string' || !validId(input.draftId) || !Number.isSafeInteger(input.cloudRevision) || Number(input.cloudRevision) < 1) return json({ error: 'Documento inválido.' }, 400)
    const draft = await getDocument(env, 'draft', input.draftId)
    if (typeof draft.subject !== 'string' || !/^HOMOLOGA[CÇ][AÃ]O\b/i.test(draft.subject)) return json({ error: 'Identifique o assunto com HOMOLOGAÇÃO antes de preparar um teste.' }, 400)
    if (!draft.document || !draft.buttondownId || !validId(draft.buttondownId) || draft.cloudRevision !== input.cloudRevision || !Number.isSafeInteger(draft.revision) || draft.revision < 0 || draft.revision !== draft.syncedRevision) return json({ error: 'Salve no D1 e sincronize a revisão atual antes do teste.' }, 409)
    const db = database(env)
    const campaign = await buttondown({ request, env }, `/emails/${draft.buttondownId}`) as { status: string; body: string; subject: string }
    if (campaign.status !== 'draft' || typeof campaign.body !== 'string' || campaign.subject !== draft.subject) return json({ error: 'Campanha remota divergente ou fora de draft.' }, 409)
    if (!input.attemptId) {
      if (!Number.isInteger(input.recipientIndex)) return json({ error: 'Selecione um destino autorizado.' }, 400)
      const recipient = recipients(env)[Number(input.recipientIndex)]
      if (!recipient) return json({ error: 'Destino não autorizado.' }, 403)
      const id = crypto.randomUUID()
      const result = await db.prepare('INSERT OR IGNORE INTO editorial_tests (id, draft_id, cloud_revision, recipient, campaign_id, body, subject, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, draft.id, draft.cloudRevision, recipient, draft.buttondownId, campaign.body, campaign.subject, new Date().toISOString()).run()
      if (!result.meta.changes) return json({ error: 'Esta revisão já tem uma tentativa. Consulte o registro antes de repetir.' }, 409)
      return json({ attemptId: id, recipient, cloudRevision: draft.cloudRevision })
    }
    if (input.confirm !== true || typeof input.attemptId !== 'string') return json({ error: 'Confirmação explícita obrigatória.' }, 400)
    const attempt = await db.prepare('SELECT * FROM editorial_tests WHERE id = ?').bind(input.attemptId).first<{ draft_id: string; cloud_revision: number; recipient: string; campaign_id: string; body: string; subject: string; created_at: string }>()
    if (!attempt || attempt.draft_id !== draft.id || attempt.cloud_revision !== draft.cloudRevision || attempt.campaign_id !== draft.buttondownId || attempt.body !== campaign.body || attempt.subject !== campaign.subject || !recipients(env).includes(attempt.recipient) || Date.now() - Date.parse(attempt.created_at) > 600000) return json({ error: 'Preparação expirada ou conteúdo alterado.' }, 409)
    const claim = await db.prepare("UPDATE editorial_tests SET state = 'attempted' WHERE id = ? AND state = 'prepared' AND EXISTS (SELECT 1 FROM editorial_documents WHERE kind = 'draft' AND id = ? AND version = ?)").bind(input.attemptId, draft.id, draft.cloudRevision).run()
    if (!claim.meta.changes) return json({ error: 'Tentativa já utilizada ou revisão alterada.' }, 409)
    // Claim survives timeouts: an uncertain outcome is never retried automatically.
    try {
      await buttondown({ request, env }, `/emails/${draft.buttondownId}/send-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients: [attempt.recipient] }) })
      await db.prepare("UPDATE editorial_tests SET state = 'accepted' WHERE id = ?").bind(input.attemptId).run()
      return json({ accepted: true })
    } catch { return json({ error: 'Resultado incerto ou recusado. Tentativa bloqueada para repetição; confira a Buttondown.' }, 502) }
  } catch (error) { return errorResponse(error) }
}
