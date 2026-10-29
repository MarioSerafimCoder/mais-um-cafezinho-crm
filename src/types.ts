export type NewsletterTemplateId = 'blog' | 'curadoria' | 'especial' | 'carta' | 'bastidores' | 'convite'

export type DraftRecord = {
  id: string
  subject: string
  description?: string
  buttondownTemplate?: 'classic' | 'modern'
  editionDate?: string
  content: string
  templateId: NewsletterTemplateId | null
  buttondownId?: string
  status: 'draft'
  updatedAt: string
  schemaVersion?: 2 | 3
  migration?: { version: 1; sourceSchema: number; sourceRevision: number }
  document?: import('../shared/safety').DocumentNode | (import('../shared/grapes-document').GrapesDocument & { content?: never })
  revision?: number
  cloudRevision?: number
  lastCloudSavedAt?: string
  lastSyncedAt?: string
  syncedRevision?: number
  syncedBodyHash?: string
  createKey?: string
  cloudSavedRevision?: number
  pendingCreate?: { key: string; subject: string; body: string; description?: string; template?: 'classic' | 'modern'; revision: number }
}

export type Subscriber = {
  id: string
  email_address: string
  type: string
  source?: string | null
  creation_date?: string | null
  metadata?: Record<string, unknown>
}

export type CampaignDeliveryStatus = {
  enabled: boolean
  reason?: string
  activeCount?: number
  selectedLimit?: number
}

export type PreparedCampaignDelivery = {
  attemptId: string
  audienceMode: 'all_active' | 'selected'
  recipientCount: number
  cloudRevision: number
  subject: string
  expiresAt: string
  selectedRecipients?: Array<{ id: string; email_address: string }>
}

export type CampaignAnalytics = {
  recipients?: number | null
  deliveries?: number | null
  opens?: number | null
  clicks?: number | null
  temporary_failures?: number | null
  permanent_failures?: number | null
  unsubscriptions?: number | null
  complaints?: number | null
  open_rate?: number | null
  click_rate?: number | null
  temporary_failure_rate?: number | null
  complaint_rate?: number | null
}

export type Campaign = {
  id: string
  subject: string
  description?: string
  template?: string | null
  status: string
  creation_date?: string | null
  publish_date?: string | null
  modification_date?: string | null
  body?: string
  absolute_url?: string | null
  buttondownId?: string
  demo?: boolean
  origin?: 'local' | 'cloud'
  analytics?: CampaignAnalytics | null
}

export type ApiPage<T> = {
  results: T[]
  count: number | null
  pageSize?: number
  next: string | null
  previous: string | null
}

export type IntegrationStatus = {
  configured: boolean
  connected?: boolean
  demo: boolean
  reason?: string
  cloud?: boolean
}

export type DashboardSummary = {
  subscribers: number | null
  newSubscribers: number | null
  sentCampaigns: number | null
  drafts: number | null
  scheduled: number | null
  recent: Campaign[]
  upcoming: Campaign[]
  demo: boolean
}

export type NewsletterSettings = {
  newsletterName: string
  senderName: string
  senderEmail: string
  blogUrl: string
  portfolioUrl: string
  instagramUrl: string
  linkedinUrl: string
  theme: 'light' | 'dark'
  cloudRevision?: number
}
