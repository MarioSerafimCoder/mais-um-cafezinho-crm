import type { ApiPage, Campaign, DashboardSummary, IntegrationStatus, Subscriber } from '../types'

class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(init?.headers || {}) } })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(payload?.error || `Falha na solicitação (${response.status}).`, response.status)
  if (!payload || typeof payload !== 'object') throw new ApiError('A resposta da API está vazia ou inválida.', response.status)
  return payload as T
}

export const api = {
  status: async () => {
    try { return await request<IntegrationStatus>('/api/status') }
    catch (error) {
      if (error instanceof TypeError || (error instanceof ApiError && (error.status === 404 || error.status === 200))) {
        return { configured: false, demo: true }
      }
      throw error
    }
  },
  dashboard: () => request<DashboardSummary>('/api/dashboard'),
  subscribers: (page: number, search: string) => {
    const params = new URLSearchParams({ page: String(page) })
    if (search.trim()) params.set('email_address', search.trim())
    return request<ApiPage<Subscriber>>(`/api/subscribers?${params}`)
  },
  campaigns: (page = 1) => request<ApiPage<Campaign>>(`/api/emails?page=${page}`),
  campaign: (id: string) => request<Campaign>(`/api/emails/${encodeURIComponent(id)}`),
  saveDraft: (payload: { id?: string; subject: string; body: string }) => request<Campaign>(payload.id ? `/api/emails/${encodeURIComponent(payload.id)}` : '/api/emails', {
    method: payload.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: payload.subject, body: payload.body, status: 'draft' }),
  }),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('image', file, file.name)
    return request<{ url: string }>('/api/images', { method: 'POST', body: form })
  },
}
