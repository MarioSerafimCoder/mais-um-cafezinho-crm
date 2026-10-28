import type { Campaign, DraftRecord } from '../types'

export type DraftSummary = Pick<DraftRecord, 'id' | 'subject' | 'buttondownId' | 'updatedAt' | 'cloudRevision' | 'revision' | 'syncedRevision' | 'cloudSavedRevision'>
export type EditorialCampaign = Campaign & { updatedAt: string; editorialState: string; draft?: DraftRecord; editorId?: string }
const time = (value?: string | null) => Date.parse(value || '') || 0

/** Identity comes exclusively from document IDs and explicit Buttondown links. */
export function normalizeCampaigns(local: DraftRecord[], cloud: DraftSummary[], remote: Campaign[]): EditorialCampaign[] {
  const groups = new Map<string, { locals: DraftRecord[]; clouds: DraftSummary[]; remote?: Campaign }>()
  const links = new Map([...cloud, ...local].filter(d => d.buttondownId).map(d => [d.id, d.buttondownId!]))
  const group = (key: string) => {
    if (!groups.has(key)) groups.set(key, { locals: [], clouds: [] })
    return groups.get(key)!
  }
  for (const d of local) group(links.has(d.id) ? `bd:${links.get(d.id)}` : `doc:${d.id}`).locals.push(d)
  for (const d of cloud) group(links.has(d.id) ? `bd:${links.get(d.id)}` : `doc:${d.id}`).clouds.push(d)
  for (const r of remote) group(`bd:${r.id}`).remote = r
  return [...groups.entries()].map(([key, g]) => {
    const ordered = [...g.locals, ...g.clouds].sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || (b.cloudRevision || 0) - (a.cloudRevision || 0) || a.id.localeCompare(b.id))
    const latest = ordered[0]
    const localDraft = g.locals.find(d => d === latest)
    const status = g.remote?.status || 'draft'
    const pending = latest && (Boolean(latest.buttondownId && latest.syncedRevision !== (latest.revision || 0)) || Boolean(localDraft && localDraft.cloudRevision && localDraft.cloudSavedRevision !== (localDraft.revision || 0)))
    const editorialState = status === 'sent' ? 'Enviada' : ['scheduled', 'about_to_send', 'in_flight'].includes(status) ? 'Agendada'
      : status !== 'draft' ? 'Estado não confirmado'
      : latest ? pending && (latest.buttondownId || latest.cloudRevision) ? 'Sincronização pendente' : latest.buttondownId && latest.syncedRevision === (latest.revision || 0) ? 'Rascunho preparado' : 'Em edição'
      : 'Rascunho na plataforma'
    return { ...g.remote, id: key, subject: latest?.subject || g.remote?.subject || 'Sem assunto', status,
      editorId: latest?.id || g.remote?.id, updatedAt: latest?.updatedAt || g.remote?.modification_date || g.remote?.publish_date || g.remote?.creation_date || '',
      editorialState, draft: localDraft, body: localDraft?.content || g.remote?.body }
  }).sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id))
}
