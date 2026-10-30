import { activeSubscriberQuery } from '../../shared/audience'
import { subscriberPage } from '../_subscriber-audience'
import { buttondown, errorResponse, json, pageResult } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }
type ListResult = { results?: Array<Record<string, unknown>>; count?: number }
type DashboardSummary = {
  subscribers: number | null
  newSubscribers: number | null
  sentCampaigns: number | null
  drafts: number | null
  scheduled: number | null
  recent: Array<Record<string, unknown>>
  upcoming: Array<Record<string, unknown>>
  demo: false
  partial?: boolean
  stale?: boolean
  cached?: boolean
  cacheAgeSeconds?: number
  unavailable?: string[]
  staleFields?: string[]
  integrationError?: string
}
type DashboardCacheEntry = { summary: DashboardSummary; cachedAt: number }
const cacheTtlMs = 60_000
const maxStaleMs = 5 * 60_000
let dashboardCache = new WeakMap<object, DashboardCacheEntry>()

export function clearDashboardCache() { dashboardCache = new WeakMap<object, DashboardCacheEntry>() }

function currentMonthInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}-01`
}

function count(result: ListResult) {
  return Number.isFinite(result.count) ? Number(result.count) : null
}

function statusOf(reason: unknown) {
  return typeof reason === 'object' && reason && 'status' in reason ? Number(reason.status) : 0
}

function isAuthFailure(reason: unknown) {
  return (reason instanceof Error && reason.message === 'BUTTONDOWN_NOT_CONFIGURED') || [401, 403].includes(statusOf(reason))
}

function responseSummary(summary: DashboardSummary, unavailable: string[], staleFields: string[], options: { stale?: boolean; cached?: boolean; cacheAgeSeconds?: number; integrationError?: string } = {}) {
  const partial = unavailable.length > 0 || staleFields.length > 0
  return {
    ...summary,
    ...(partial ? { partial: true } : {}),
    ...(options.stale ? { stale: true } : {}),
    ...(options.cached ? { cached: true } : {}),
    ...(options.cacheAgeSeconds !== undefined ? { cacheAgeSeconds: options.cacheAgeSeconds } : {}),
    ...(unavailable.length ? { unavailable } : {}),
    ...(staleFields.length ? { staleFields } : {}),
    ...(options.integrationError ? { integrationError: options.integrationError } : {}),
  }
}

export const onRequestGet = async ({ request, env }: Context) => {
  try {
    const cache = dashboardCache.get(env as object)
    const cacheAge = cache ? Math.max(0, Date.now() - cache.cachedAt) : Infinity
    if (cache && cacheAge <= cacheTtlMs) return json(responseSummary(cache.summary, [], [], { cached: true, cacheAgeSeconds: Math.floor(cacheAge / 1000) }))

    const paths = [
      `/subscribers?${activeSubscriberQuery({ page: '1' })}`,
      `/subscribers?${activeSubscriberQuery({ page: '1', date__start: currentMonthInSaoPaulo() })}`,
      '/emails?status=sent&ordering=-creation_date&page=1',
      '/emails?status=draft&ordering=-creation_date&page=1',
      '/emails?status=scheduled&ordering=publish_date&page=1',
      '/emails?ordering=-creation_date&page=1',
    ] as const
    const settled = await Promise.allSettled(paths.map(path => path.startsWith('/subscribers?') ? subscriberPage({ request, env }, new URLSearchParams(path.split('?')[1])) as Promise<ListResult> : buttondown({ request, env }, path).then(value => pageResult(value) as ListResult)))
    const failures = settled.filter(item => item.status === 'rejected')
    if (failures.length === settled.length) {
      const authenticationFailure = failures.find(item => isAuthFailure(item.reason))
      if (authenticationFailure) return errorResponse(authenticationFailure.reason)
    }
    const pages = settled.map(item => item.status === 'fulfilled' ? item.value : null)
    const unavailable: string[] = []
    const staleFields: string[] = []
    const canUseStale = Boolean(cache && cacheAge <= maxStaleMs)
    const readCount = (field: keyof Pick<DashboardSummary, 'subscribers' | 'newSubscribers' | 'sentCampaigns' | 'drafts' | 'scheduled'>, fresh: number | null) => {
      if (fresh !== null) return fresh
      if (canUseStale && cache?.summary[field] !== null && cache?.summary[field] !== undefined) { staleFields.push(field); return cache.summary[field] }
      unavailable.push(field); return null
    }
    const readArray = (field: 'recent' | 'upcoming', fresh: Array<Record<string, unknown>> | null) => {
      if (fresh) return fresh
      if (canUseStale && cache) { staleFields.push(field); return cache.summary[field] }
      unavailable.push(field); return []
    }
    const recent = pages[5] ? (pages[5].results || []).slice(0, 5) : readArray('recent', null)
    const upcoming = pages[4] ? (pages[4].results || []).slice(0, 3) : readArray('upcoming', null)
    const authenticationFailure = failures.find(item => isAuthFailure(item.reason))
    const summary: DashboardSummary = {
      subscribers: readCount('subscribers', pages[0] ? count(pages[0]) : null),
      newSubscribers: readCount('newSubscribers', pages[1] ? count(pages[1]) : null),
      sentCampaigns: readCount('sentCampaigns', pages[2] ? count(pages[2]) : null),
      drafts: readCount('drafts', pages[3] ? count(pages[3]) : null),
      scheduled: readCount('scheduled', pages[4] ? count(pages[4]) : null),
      recent,
      upcoming,
      demo: false,
    }
    if (failures.length === 0) dashboardCache.set(env as object, { summary, cachedAt: Date.now() })
    return json(responseSummary(summary, [...new Set(unavailable)], [...new Set(staleFields)], {
      stale: staleFields.length > 0,
      cacheAgeSeconds: canUseStale && cache ? Math.floor(cacheAge / 1000) : undefined,
      integrationError: authenticationFailure ? 'A autenticação da Buttondown falhou em parte das consultas. Os dados disponíveis continuam visíveis.' : undefined,
    }))
  } catch (error) {
    return errorResponse(error)
  }
}
