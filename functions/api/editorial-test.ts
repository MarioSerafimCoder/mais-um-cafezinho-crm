import { database, getDocument } from '../_documents'
import { buttondown, errorResponse, json, matchesButtondownTemplate, parseJson, validId, type AppEnv } from '../_utils'

function recipients(env: AppEnv) {
  return (env.EDITORIAL_TEST_RECIPIENTS || '').split(',').map(s => s.trim()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}
function enabled(env: AppEnv) { return env.EDITORIAL_TEST_ENABLED !== 'false' && Boolean(env.BUTTONDOWN_API_KEY?.trim()) && recipients(env).length > 0 }
export async function onRequestGet({ request, env }: { request: Request; env: AppEnv }) {
  try {
    const draftId = new URL(request.url).searchParams.get('draftId')
    if (draftId && !validId(draftId)) return json({ error: 'Documento inválido.' }, 400)
    const attempts = draftId ? (await database(env).prepare('SELECT id, recipient, cloud_revision, state, created_at, provider_status, completed_at FROM editorial_tests WHERE draft_id = ? ORDER BY created_at DESC LIMIT 20').bind(draftId).all()).results : []
    return json({ enabled: enabled(env), recipients: recipients(env), attempts })
  } catch (error) { return errorResponse(error) }
}
async function bodyHash(body: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, '0')).join('')
}

// No subscriber IDs, campaign status mutations or publication endpoints are accepted.
export async function onRequestPost({ request, env }: { request: Request; env: AppEnv }) {
  try {
    if (!enabled(env)) return json({ error: 'Teste desativado ou sem destinatários autorizados no servidor.' }, 403)
    const raw = await parseJson(request, 4096)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'Solicitação inválida.' }, 400)
    const input = raw as Record<string, unknown>
    if (Object.keys(input).some(k => !['draftId', 'cloudRevision', 'recipientIndex', 'attemptId', 'confirm', 'cancel'].includes(k))) return json({ error: 'Campos não permitidos.' }, 400)
    if (typeof input.draftId !== 'string' || !validId(input.draftId) || !Number.isSafeInteger(input.cloudRevision) || Number(input.cloudRevision) < 1) return json({ error: 'Documento inválido.' }, 400)
    if (input.cancel === true && typeof input.attemptId === 'string' && validId(input.attemptId)) {
      const result = await database(env).prepare("UPDATE editorial_tests SET state = 'cancelled' WHERE id = ? AND draft_id = ? AND state = 'prepared'").bind(input.attemptId, input.draftId).run()
      return result.meta.changes ? json({ cancelled: true }) : json({ error: 'Somente preparações ainda não enviadas podem ser canceladas.' }, 409)
    }
    const draft = await getDocument(env, 'draft', input.draftId)
    if (!draft.document || !draft.buttondownId || !validId(draft.buttondownId) || draft.cloudRevision !== input.cloudRevision || !Number.isSafeInteger(draft.revision) || draft.revision < 0 || draft.revision !== draft.syncedRevision || draft.revision !== draft.cloudSavedRevision) return json({ error: 'Salve no D1 e sincronize a revisão atual antes do teste.' }, 409)
    const db = database(env)
    const campaign = await buttondown({ request, env }, `/emails/${draft.buttondownId}`) as { status: string; body: string; subject: string; description?: string; template?: string | null }
    if (campaign.status !== 'draft') return json({ error: 'Esta campanha já não está em rascunho na Buttondown. Sincronize um rascunho antes de preparar o teste.' }, 409)
    if (typeof campaign.body !== 'string') return json({ error: 'A Buttondown não retornou o conteúdo da campanha.' }, 502)
    if (campaign.subject !== draft.subject || (campaign.description || '') !== (draft.description || '')) return json({ error: 'Assunto ou texto de prévia divergente. Salve e sincronize novamente.' }, 409)
    if (!matchesButtondownTemplate(campaign.template, draft.buttondownTemplate)) return json({ error: 'O template da campanha na Buttondown diverge da revisão do CRM. Salve e sincronize novamente.' }, 409)
    if (draft.syncedBodyHash !== await bodyHash(campaign.body)) return json({ error: 'O conteúdo na Buttondown diverge da revisão salva no CRM. Salve e sincronize novamente.' }, 409)
    if (!input.attemptId) {
      if (!Number.isInteger(input.recipientIndex)) return json({ error: 'Selecione um destino autorizado.' }, 400)
      const recipient = recipients(env)[Number(input.recipientIndex)]
      if (!recipient) return json({ error: 'Destino não autorizado.' }, 403)
      await db.prepare("UPDATE editorial_tests SET state = 'expired' WHERE campaign_id = ? AND recipient = ? AND state = 'prepared' AND created_at < ?").bind(draft.buttondownId, recipient, new Date(Date.now() - 600000).toISOString()).run()
      const id = crypto.randomUUID()
      const result = await db.prepare("INSERT INTO editorial_tests (id, draft_id, cloud_revision, recipient, campaign_id, body, subject, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM editorial_tests WHERE campaign_id = ? AND recipient = ? AND state IN ('prepared', 'attempted'))").bind(id, draft.id, draft.cloudRevision, recipient, draft.buttondownId, campaign.body, campaign.subject, new Date().toISOString(), draft.buttondownId, recipient).run()
      if (!result.meta.changes) return json({ error: 'Há uma preparação ativa ou resultado incerto para esta campanha e destino. Consulte o histórico; nenhuma repetição foi realizada.' }, 409)
      return json({ attemptId: id, recipient, cloudRevision: draft.cloudRevision })
    }
    if (input.confirm !== true || typeof input.attemptId !== 'string' || !validId(input.attemptId)) return json({ error: 'Confirmação explícita obrigatória.' }, 400)
    const attempt = await db.prepare('SELECT * FROM editorial_tests WHERE id = ?').bind(input.attemptId).first<{ draft_id: string; cloud_revision: number; recipient: string; campaign_id: string; body: string; subject: string; created_at: string }>()
    if (!attempt || attempt.draft_id !== draft.id || attempt.cloud_revision !== draft.cloudRevision || attempt.campaign_id !== draft.buttondownId || attempt.body !== campaign.body || attempt.subject !== campaign.subject || !recipients(env).includes(attempt.recipient) || Date.now() - Date.parse(attempt.created_at) > 600000) return json({ error: 'Preparação expirada ou conteúdo alterado.' }, 409)
    const claim = await db.prepare("UPDATE editorial_tests SET state = 'attempted' WHERE id = ? AND state = 'prepared' AND EXISTS (SELECT 1 FROM editorial_documents WHERE kind = 'draft' AND id = ? AND version = ?)").bind(input.attemptId, draft.id, draft.cloudRevision).run()
    if (!claim.meta.changes) return json({ error: 'Tentativa já utilizada ou revisão alterada.' }, 409)
    // Claim survives timeouts: an uncertain outcome is never retried automatically.
    try {
      await buttondown({ request, env }, `/emails/${draft.buttondownId}/send-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients: [attempt.recipient] }) })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0
      const rejected = [400, 401, 403, 404, 422, 429].includes(status)
      await db.prepare('UPDATE editorial_tests SET state = ?, provider_status = ?, completed_at = ? WHERE id = ?').bind(rejected ? 'rejected' : 'attempted', status || null, new Date().toISOString(), input.attemptId).run()
      const message = status === 403 ? 'A chave Buttondown precisa de sending_access: write. O provedor recusou este teste; após corrigir a permissão, prepare uma nova tentativa.' : rejected ? `Teste recusado pela Buttondown (HTTP ${status}). Corrija a causa e prepare uma nova tentativa.` : 'Resultado incerto. Não repita este envio; consulte o histórico e a Buttondown.'
      return json({ error: message, attemptId: input.attemptId, state: rejected ? 'rejected' : 'attempted', providerStatus: status || null }, 502)
    }
    // Persistence errors after acceptance must not be mistaken for provider rejections.
    await db.prepare("UPDATE editorial_tests SET state = 'accepted', completed_at = ? WHERE id = ?").bind(new Date().toISOString(), input.attemptId).run()
    return json({ accepted: true, attemptId: input.attemptId, state: 'accepted' })
  } catch (error) { return errorResponse(error) }
}
