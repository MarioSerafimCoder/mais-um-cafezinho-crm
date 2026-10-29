import { database, getDocument } from '../_documents'
import { buttondown, errorResponse, json, matchesButtondownTemplate, parseJson, validId, type AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }
type Audience = { mode: 'all_active' } | { mode: 'selected'; subscriberIds: string[] }
type RemoteCampaign = { id: string; status: string; subject: string; body: string; description?: string; template?: string | null; email_type?: string; filters?: unknown }
type RemoteSubscriber = { id: string; email_address: string; type: string; metadata?: Record<string, unknown> }
type SelectedRecipient = { id: string; email_address: string }
type Attempt = {
  id: string; draft_id: string; cloud_revision: number; campaign_id: string; audience_mode: 'all_active' | 'selected';
  subscriber_ids: string | null; audience_count: number; campaign_hash: string; subject: string; created_at: string; state: string
}

const activeTypes = ['regular', 'premium'] as const
const selectedLimit = 500
const preparationLifetimeMs = 10 * 60 * 1000

function disabled() { return json({ enabled: false, reason: 'Envios de campanha desativados pelo proprietário.' }) }
function hash(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''))
}
function campaignFingerprint(campaign: RemoteCampaign) {
  return hash(JSON.stringify([campaign.subject, campaign.body, campaign.description || '', campaign.template || null, campaign.email_type || null, campaign.filters || null]))
}
function hasFilters(value: unknown) {
  if (value === undefined || value === null) return false
  if (typeof value !== 'object' || Array.isArray(value)) return true
  const filters = value as Record<string, unknown>
  if (!Array.isArray(filters.filters) || !Array.isArray(filters.groups)) return true
  return filters.filters.length > 0 || filters.groups.length > 0
}
function activeCount(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_SUBSCRIBER_RESPONSE')
  const count = (value as { count?: unknown }).count
  if (!Number.isSafeInteger(count) || Number(count) < 0) throw new Error('INVALID_SUBSCRIBER_COUNT')
  return Number(count)
}
async function countActive(context: Context) {
  const counts = await Promise.all(activeTypes.map(async (type) => {
    const query = new URLSearchParams({ type, page: '1' })
    const result = await buttondown(context, `/subscribers?${query}`)
    return activeCount(result)
  }))
  return counts.reduce((total, count) => total + count, 0)
}
async function getSubscriber(context: Context, id: string) {
  return await buttondown(context, `/subscribers/${encodeURIComponent(id)}`) as RemoteSubscriber
}
async function validateSelected(context: Context, ids: string[]) {
  const subscribers: RemoteSubscriber[] = []
  for (let index = 0; index < ids.length; index += 8) {
    const batch = await Promise.all(ids.slice(index, index + 8).map((id) => getSubscriber(context, id)))
    if (batch.some((subscriber, offset) => subscriber.id !== ids[index + offset] || !activeTypes.includes(subscriber.type as typeof activeTypes[number]) || typeof subscriber.email_address !== 'string')) {
      throw json({ error: 'Um contato selecionado não está mais ativo. Atualize a lista antes de preparar o envio.' }, 409)
    }
    subscribers.push(...batch)
  }
  return subscribers
}
async function currentDraft(context: Context, draftId: string, cloudRevision: number) {
  const draft = await getDocument(context.env, 'draft', draftId)
  if (!draft.document || !draft.buttondownId || !validId(draft.buttondownId)
    || draft.cloudRevision !== cloudRevision
    || !Number.isSafeInteger(draft.revision)
    || draft.revision !== draft.syncedRevision
    || draft.revision !== draft.cloudSavedRevision) {
    throw json({ error: 'Salve no D1 e sincronize a revisão atual antes do envio.' }, 409)
  }
  const campaign = await buttondown(context, `/emails/${encodeURIComponent(draft.buttondownId)}`) as RemoteCampaign
  if (campaign.status !== 'draft') throw json({ error: 'Esta campanha já não está em rascunho na Buttondown. Só campanhas em draft podem ser preparadas.' }, 409)
  if (typeof campaign.body !== 'string') throw json({ error: 'A Buttondown não retornou o conteúdo da campanha. Atualize a integração e tente novamente.' }, 502)
  if (campaign.subject !== draft.subject || (campaign.description || '') !== (draft.description || '')) throw json({ error: 'Assunto ou texto de prévia divergente. Salve e sincronize a revisão atual novamente.' }, 409)
  if (!matchesButtondownTemplate(campaign.template, draft.buttondownTemplate)) throw json({ error: 'O template da campanha na Buttondown diverge da revisão do CRM. Salve e sincronize novamente.' }, 409)
  if (draft.syncedBodyHash !== await hash(campaign.body)) throw json({ error: 'O conteúdo na Buttondown diverge da revisão salva no CRM. Salve e sincronize novamente.' }, 409)
  return { draft, campaign }
}
function parseAudience(value: unknown): Audience | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const audience = value as Record<string, unknown>
  if (audience.mode === 'all_active' && Object.keys(audience).length === 1) return { mode: 'all_active' }
  if (audience.mode !== 'selected' || Object.keys(audience).some((key) => !['mode', 'subscriberIds'].includes(key)) || !Array.isArray(audience.subscriberIds)) return null
  const ids = audience.subscriberIds
  if (!ids.length || ids.length > selectedLimit || ids.some((id) => typeof id !== 'string' || !/^sub_[a-zA-Z0-9_-]{1,76}$/.test(id))) return null
  const unique = [...new Set(ids as string[])].sort()
  if (unique.length !== ids.length) return null
  return { mode: 'selected', subscriberIds: unique }
}

export async function onRequestGet({ request, env }: Context) {
  if (env.CAMPAIGN_SENDING_ENABLED !== 'true') return disabled()
  try { return json({ enabled: true, activeCount: await countActive({ request, env }), selectedLimit }) }
  catch (error) { return errorResponse(error) }
}

export async function onRequestPost(context: Context) {
  const { request, env } = context
  if (env.CAMPAIGN_SENDING_ENABLED !== 'true') return json({ error: 'Envios de campanha desativados pelo proprietário.' }, 403)
  try {
    const raw = await parseJson(request, 32_000)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'Solicitação inválida.' }, 400)
    const input = raw as Record<string, unknown>
    if (Object.keys(input).some((key) => !['action', 'draftId', 'cloudRevision', 'audience', 'attemptId', 'confirm'].includes(key))) return json({ error: 'Campos não permitidos.' }, 400)
    if (typeof input.draftId !== 'string' || !validId(input.draftId) || !Number.isSafeInteger(input.cloudRevision) || Number(input.cloudRevision) < 1) return json({ error: 'Documento ou revisão inválidos.' }, 400)
    const db = database(env)

    if (input.action === 'prepare') {
      const audience = parseAudience(input.audience)
      if (!audience) return json({ error: 'Escolha todos os assinantes ativos ou selecione contatos ativos.' }, 400)
      const { draft, campaign } = await currentDraft(context, input.draftId, Number(input.cloudRevision))
      let subscriberIds: string | null = null
      let selectedRecipients: SelectedRecipient[] | undefined
      let recipientCount = 0
      if (audience.mode === 'all_active') {
        if (hasFilters(campaign.filters) || ![undefined, 'public', 'private'].includes(campaign.email_type)) return json({ error: 'A campanha tem filtros de audiência. Remova-os na Buttondown antes de escolher todos os assinantes ativos.' }, 409)
        recipientCount = await countActive(context)
        if (recipientCount < 1) return json({ error: 'Não há assinantes ativos para este envio.' }, 409)
      } else {
        const subscribers = await validateSelected(context, audience.subscriberIds)
        selectedRecipients = subscribers.map((subscriber) => ({ id: subscriber.id, email_address: subscriber.email_address }))
        subscriberIds = JSON.stringify(selectedRecipients)
        recipientCount = subscribers.length
      }

      const now = new Date().toISOString()
      const expiresBefore = new Date(Date.now() - preparationLifetimeMs).toISOString()
      await db.prepare("UPDATE campaign_send_attempts SET state = 'expired' WHERE campaign_id = ? AND state = 'prepared' AND created_at < ?").bind(draft.buttondownId, expiresBefore).run()
      const existing = await db.prepare("SELECT * FROM campaign_send_attempts WHERE campaign_id = ? AND state IN ('prepared', 'attempted', 'accepted')").bind(draft.buttondownId).first<Attempt>()
      const campaignHash = await campaignFingerprint(campaign)
      if (existing && existing.state !== 'prepared') return json({ error: existing.state === 'attempted' ? 'O resultado do envio anterior ainda não foi confirmado. Consulte o histórico antes de reenviar.' : 'Esta campanha já foi enviada.', state: existing.state }, 409)
      if (existing && existing.draft_id === draft.id && existing.cloud_revision === draft.cloudRevision && existing.campaign_hash === campaignHash && existing.audience_mode === audience.mode && existing.subscriber_ids === subscriberIds && existing.audience_count === recipientCount) {
        return json({ attemptId: existing.id, audienceMode: audience.mode, recipientCount, cloudRevision: draft.cloudRevision, subject: campaign.subject, selectedRecipients, expiresAt: new Date(Date.parse(existing.created_at) + preparationLifetimeMs).toISOString() })
      }
      if (existing) await db.prepare("UPDATE campaign_send_attempts SET state = 'cancelled' WHERE id = ? AND state = 'prepared'").bind(existing.id).run()
      const attemptId = crypto.randomUUID()
      const inserted = await db.prepare('INSERT OR IGNORE INTO campaign_send_attempts (id, draft_id, cloud_revision, campaign_id, audience_mode, subscriber_ids, audience_count, campaign_hash, subject, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(attemptId, draft.id, draft.cloudRevision, draft.buttondownId, audience.mode, subscriberIds, recipientCount, campaignHash, campaign.subject, now).run()
      if (!inserted.meta.changes) return json({ error: 'Esta campanha acabou de ser preparada em outra sessão. Consulte o estado antes de repetir.' }, 409)
      return json({ attemptId, audienceMode: audience.mode, recipientCount, cloudRevision: draft.cloudRevision, subject: campaign.subject, selectedRecipients, expiresAt: new Date(Date.now() + preparationLifetimeMs).toISOString() })
    }

    if (input.action === 'cancel') {
      if (typeof input.attemptId !== 'string' || !validId(input.attemptId)) return json({ error: 'Preparação inválida.' }, 400)
      const cancelled = await db.prepare("UPDATE campaign_send_attempts SET state = 'cancelled' WHERE id = ? AND draft_id = ? AND cloud_revision = ? AND state = 'prepared'").bind(input.attemptId, input.draftId, input.cloudRevision).run()
      if (!cancelled.meta.changes) return json({ error: 'A preparação já expirou ou foi utilizada.' }, 409)
      return json({ cancelled: true })
    }

    if (input.action === 'confirm') {
      if (input.confirm !== true || typeof input.attemptId !== 'string' || !validId(input.attemptId)) return json({ error: 'Confirmação explícita obrigatória.' }, 400)
      const attempt = await db.prepare('SELECT * FROM campaign_send_attempts WHERE id = ?').bind(input.attemptId).first<Attempt>()
      if (!attempt || attempt.draft_id !== input.draftId || attempt.cloud_revision !== input.cloudRevision || attempt.state !== 'prepared') return json({ error: 'Preparação não está mais disponível; envio bloqueado.' }, 409)
      if (Date.now() - Date.parse(attempt.created_at) > preparationLifetimeMs) {
        await db.prepare("UPDATE campaign_send_attempts SET state = 'expired' WHERE id = ? AND state = 'prepared'").bind(attempt.id).run()
        return json({ error: 'A prévia expirou. Prepare novamente para conferir a audiência atual.' }, 409)
      }
      const preflight = await (async () => {
        try {
          const { draft, campaign } = await currentDraft(context, attempt.draft_id, attempt.cloud_revision)
          if (campaign.id !== attempt.campaign_id || campaign.subject !== attempt.subject || await campaignFingerprint(campaign) !== attempt.campaign_hash) throw json({ error: 'O rascunho mudou após a prévia. Prepare o envio novamente.' }, 409)
          if (attempt.audience_mode === 'all_active' && (hasFilters(campaign.filters) || ![undefined, 'public', 'private'].includes(campaign.email_type))) throw json({ error: 'A audiência da campanha mudou. Revise os filtros na Buttondown.' }, 409)
          const selectedRecipients = attempt.audience_mode === 'selected' ? JSON.parse(attempt.subscriber_ids || '[]') as SelectedRecipient[] : []
          const subscribers = selectedRecipients.length ? await validateSelected(context, selectedRecipients.map((recipient) => recipient.id)) : []
          if (attempt.audience_mode === 'selected' && (subscribers.length !== attempt.audience_count || subscribers.some((subscriber, index) => subscriber.email_address !== selectedRecipients[index]?.email_address))) throw json({ error: 'A seleção ou o endereço de um contato mudou. Prepare o envio novamente.' }, 409)
          if (attempt.audience_mode === 'all_active' && await countActive(context) !== attempt.audience_count) throw json({ error: 'A quantidade de assinantes ativos mudou desde a prévia. Prepare o envio novamente para conferir a contagem atual.' }, 409)
          return { draft, subscribers }
        } catch (error) {
          if (error instanceof Response && error.status >= 400 && error.status < 500) await db.prepare("UPDATE campaign_send_attempts SET state = 'expired' WHERE id = ? AND state = 'prepared'").bind(attempt.id).run()
          throw error
        }
      })()
      const { draft, subscribers } = preflight

      const claimed = await db.prepare("UPDATE campaign_send_attempts SET state = 'attempted' WHERE id = ? AND state = 'prepared' AND EXISTS (SELECT 1 FROM editorial_documents WHERE kind = 'draft' AND id = ? AND version = ?)")
        .bind(attempt.id, draft.id, draft.cloudRevision).run()
      if (!claimed.meta.changes) return json({ error: 'Preparação já utilizada ou revisão alterada.' }, 409)
      try {
        if (attempt.audience_mode === 'all_active') {
          await buttondown(context, `/emails/${encodeURIComponent(attempt.campaign_id)}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        } else {
          await buttondown(context, `/emails/${encodeURIComponent(attempt.campaign_id)}/send-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribers: subscribers.map((subscriber) => subscriber.id) }) })
        }
        await db.prepare("UPDATE campaign_send_attempts SET state = 'accepted' WHERE id = ? AND state = 'attempted'").bind(attempt.id).run()
        return json({ accepted: true, audienceMode: attempt.audience_mode, recipientCount: attempt.audience_count })
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0
        if (status >= 400 && status < 500 && status !== 409) await db.prepare("UPDATE campaign_send_attempts SET state = 'rejected' WHERE id = ? AND state = 'attempted'").bind(attempt.id).run()
        return errorResponse(error)
      }
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (error) { return errorResponse(error) }
}
