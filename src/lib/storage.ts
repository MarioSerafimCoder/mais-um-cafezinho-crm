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
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item.id !== 'string' || typeof item.content !== 'string')) throw new Error()
    return parsed
  } catch {
    throw new Error('Não foi possível ler os rascunhos deste navegador. Os dados originais foram preservados; exporte um backup antes de recuperar o armazenamento.')
  }
}

export function writeDraft(draft: DraftRecord) {
  const drafts = readDrafts()
  const existing = drafts.find((item) => item.id === draft.id || (draft.buttondownId && item.buttondownId === draft.buttondownId))
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

export function readSettings(): NewsletterSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(settingsKey) || '{}') }
  } catch {
    return defaultSettings
  }
}

export function writeSettings(settings: NewsletterSettings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings))
}
