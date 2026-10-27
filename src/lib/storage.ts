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
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeDraft(draft: DraftRecord) {
  const drafts = readDrafts()
  const next = [draft, ...drafts.filter((item) => item.id !== draft.id)]
  localStorage.setItem(draftsKey, JSON.stringify(next))
  return draft
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
