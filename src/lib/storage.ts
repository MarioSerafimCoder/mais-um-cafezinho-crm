import type { DraftRecord, NewsletterSettings } from '../types'

const draftsKey = 'mais-um-cafezinho:drafts:v1'
const settingsKey = 'mais-um-cafezinho:settings:v1'

export const defaultSettings: NewsletterSettings = {
  newsletterName: 'Mais um Cafezinho',
  senderName: 'Mário Serafim',
  senderEmail: '',
  blogUrl: 'https://marioserafim.com.br/blog',
  portfolioUrl: 'https://marioserafim.com.br',
  instagramUrl: '',
  linkedinUrl: '',
  theme: 'light',
}

export function readDrafts(): DraftRecord[] {
  try {
    const raw = localStorage.getItem(draftsKey)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item.id !== 'string' || typeof item.content !== 'string' || typeof item.subject !== 'string' || typeof item.updatedAt !== 'string' || item.status !== 'draft' || (item.buttondownId !== undefined && typeof item.buttondownId !== 'string') || (item.description !== undefined && (typeof item.description !== 'string' || item.description.length > 200)) || (item.buttondownTemplate !== undefined && !['classic', 'modern'].includes(item.buttondownTemplate)) || (item.editionDate !== undefined && (typeof item.editionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.editionDate))))) throw new Error()
    return parsed
  } catch {
    throw new Error('Não foi possível ler os rascunhos deste navegador. Os dados originais foram preservados; exporte um backup antes de recuperar o armazenamento.')
  }
}

export function writeDraft(draft: DraftRecord, expected?: DraftRecord | null) {
  const drafts = readDrafts()
  const existing = drafts.find((item) => item.id === draft.id || (draft.buttondownId && item.buttondownId === draft.buttondownId))
  if (expected !== undefined && JSON.stringify(existing || null) !== JSON.stringify(expected)) throw new Error('Este rascunho mudou em outra aba. Exporte sua cópia antes de reabrir; nada foi sobrescrito.')
  if (existing && (existing.revision || 0) > (draft.revision || 0)) throw new Error('Outra edição mais recente foi salva. Reabra o rascunho antes de continuar.')
  const raw = localStorage.getItem(draftsKey)
  if (raw && drafts.some((item) => !item.schemaVersion) && !localStorage.getItem(`${draftsKey}:legacy-backup`)) localStorage.setItem(`${draftsKey}:legacy-backup`, raw)
  const next = [draft, ...drafts.filter((item) => item.id !== draft.id && (!draft.buttondownId || item.buttondownId !== draft.buttondownId))]
  localStorage.setItem(draftsKey, JSON.stringify(next))
  return draft
}

export function downloadDraftBackup() {
  const raw = localStorage.getItem(draftsKey) || '[]'
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = 'cafezinho-rascunhos.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}


export function removeDraft(id: string) {
  localStorage.setItem(draftsKey, JSON.stringify(readDrafts().filter((draft) => draft.id !== id)))
}

export function preserveOriginal(draft: DraftRecord) {
  const key = `${draftsKey}:original:${draft.id}`
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft))
  if (!localStorage.getItem(key)) throw new Error('Não foi possível proteger a cópia original. A migração não foi salva.')
}
export function readOriginal(id: string): DraftRecord | null {
  const text = localStorage.getItem(`${draftsKey}:original:${id}`)
  return text ? JSON.parse(text) : null
}

export function readSettings(): NewsletterSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}') as Record<string, unknown>
    const clean = { ...defaultSettings }
    for (const key of Object.keys(defaultSettings) as Array<keyof NewsletterSettings>) if (typeof saved[key] === 'string') Object.assign(clean, { [key]: saved[key] })
    clean.theme = saved.theme === 'dark' ? 'dark' : 'light'
    if (Number.isInteger(saved.cloudRevision) && Number(saved.cloudRevision) >= 0) clean.cloudRevision = Number(saved.cloudRevision)
    return clean
  } catch {
    return defaultSettings
  }
}

export function writeSettings(settings: NewsletterSettings) {
  const raw = localStorage.getItem(settingsKey)
  if (raw) {
    try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error() }
    catch { throw new Error('As configurações locais estão corrompidas. Os dados originais foram preservados.') }
  }
  localStorage.setItem(settingsKey, JSON.stringify(settings))
}
