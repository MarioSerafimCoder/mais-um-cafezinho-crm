import type { ApiPage, Campaign, CampaignDeliveryStatus, DashboardSummary, DraftRecord, IntegrationStatus, NewsletterSettings, PreparedCampaignDelivery, Subscriber } from '../types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(path, { ...init, headers: { ...(init?.headers || {}) } }) }
  catch { throw new ApiError('Sem conexão com o servidor. Os rascunhos deste navegador continuam disponíveis.', 0) }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(payload?.error || `Falha na solicitação (${response.status}).`, response.status)
  if (!payload || typeof payload !== 'object') throw new ApiError('A resposta da API está vazia ou inválida.', response.status)
  return payload as T
}

export const api = {
  status: async () => {
    if (import.meta.env.DEV && import.meta.env.MODE === 'demo') return { configured: false, connected: false, demo: true, cloud: false }
    return request<IntegrationStatus>('/api/status')
  },
  dashboard: () => request<DashboardSummary>('/api/dashboard'),
  cloudDrafts: (page = 1) => request<{ results: Array<Pick<DraftRecord, 'id' | 'subject' | 'buttondownId' | 'updatedAt' | 'cloudRevision'>>; next: number | null }>(`/api/drafts?page=${page}`),
  cloudDraft: (id: string) => request<DraftRecord>(`/api/drafts/${encodeURIComponent(id)}`),
  saveCloudDraft: (draft: DraftRecord) => request<DraftRecord>(`/api/drafts/${encodeURIComponent(draft.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }),
  cloudSettings: () => request<NewsletterSettings & { cloudRevision: number }>('/api/settings'),
  saveCloudSettings: (settings: NewsletterSettings & { cloudRevision?: number }) => request<NewsletterSettings & { cloudRevision: number }>('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }),
  subscribers: (page: number, search: string, type?: 'regular' | 'premium') => {
    const params = new URLSearchParams({ page: String(page) })
    if (search.trim()) params.set('email_address', search.trim())
    if (type) params.set('type', type)
    return request<ApiPage<Subscriber>>(`/api/subscribers?${params}`)
  },
  addSubscriber: (emailAddress: string) => request<Pick<Subscriber, 'id' | 'email_address' | 'type' | 'creation_date'> & { activatedExisting?: boolean; alreadyActive?: boolean }>('/api/subscribers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email_address: emailAddress }),
  }),
  campaignDeliveryStatus: () => request<CampaignDeliveryStatus>('/api/campaign-delivery'),
  campaignDelivery: (payload: Record<string, unknown>) => request<Partial<PreparedCampaignDelivery> & { accepted?: boolean; cancelled?: boolean; error?: string }>('/api/campaign-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  campaigns: (page = 1) => request<ApiPage<Campaign>>(`/api/emails?page=${page}`),
  campaign: (id: string) => request<Campaign>(`/api/emails/${encodeURIComponent(id)}`),
  saveDraft: (payload: { id?: string; subject: string; body: string; description?: string; buttondownTemplate?: 'classic' | 'modern'; createKey?: string }) => request<Campaign>(payload.id ? `/api/emails/${encodeURIComponent(payload.id)}` : '/api/emails', {
    method: payload.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(!payload.id && payload.createKey ? { 'X-Idempotency-Key': payload.createKey } : {}) },
    body: JSON.stringify({ subject: payload.subject, body: payload.body, status: 'draft', ...(payload.description !== undefined ? { description: payload.description } : {}), ...(payload.buttondownTemplate ? { template: payload.buttondownTemplate } : {}) }),
  }),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('image', file, file.name)
    return request<{ url: string }>('/api/images', { method: 'POST', body: form })
  },
}

export function requireConnection(status: IntegrationStatus) {
  if (!status.demo && !status.connected) throw new Error(status.reason || 'A Buttondown está desconectada. Confira a integração nas configurações.')
  return status
}
