export type NewsletterTemplateId = 'blog' | 'curadoria' | 'especial'

export type DraftRecord = {
  id: string
  subject: string
  content: string
  templateId: NewsletterTemplateId | null
  buttondownId?: string
  status: 'draft'
  updatedAt: string
}

export type Subscriber = {
  id: string
  email_address: string
  type: string
  source?: string | null
  creation_date?: string | null
  metadata?: Record<string, unknown>
}

export type Campaign = {
  id: string
  subject: string
  status: string
  creation_date?: string | null
  publish_date?: string | null
  body?: string
  absolute_url?: string | null
  buttondownId?: string
  demo?: boolean
}

export type ApiPage<T> = {
  results: T[]
  count: number
  next: string | null
  previous: string | null
}

export type IntegrationStatus = {
  configured: boolean
  connected?: boolean
  demo: boolean
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
}
