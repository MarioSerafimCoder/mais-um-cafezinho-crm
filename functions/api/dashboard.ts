import { buttondown, errorResponse, json, pageResult } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }
type ListResult = { results?: Array<Record<string, unknown>>; count?: number }
const analyticsFields = ['recipients', 'deliveries', 'opens', 'clicks', 'temporary_failures', 'permanent_failures', 'unsubscriptions', 'complaints', 'open_rate', 'click_rate', 'temporary_failure_rate', 'complaint_rate'] as const

function currentMonthInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}-01`
}

function count(result: ListResult) {
  return Number.isFinite(result.count) ? Number(result.count) : null
}

function safeAnalytics(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const output: Record<string, number> = {}
  for (const field of analyticsFields) if (typeof input[field] === 'number' && Number.isFinite(input[field])) output[field] = input[field]
  return output
}

async function attachAnalytics(campaign: Record<string, unknown>, request: Request, env: AppEnv) {
  if (campaign.status !== 'sent' || typeof campaign.id !== 'string') return { ...campaign, analytics: null }
  const embedded = safeAnalytics(campaign.analytics ?? campaign)
  if (embedded && Object.keys(embedded).length > 0) return { ...campaign, analytics: embedded }
  try {
    const result = await buttondown({ request, env }, `/emails/${encodeURIComponent(campaign.id)}/analytics`)
    return { ...campaign, analytics: safeAnalytics(result) }
  } catch {
    // Tracking can be disabled or unavailable for an individual email. The
    // overview should still render the campaign and use em dashes for metrics.
    return { ...campaign, analytics: null }
  }
}

export const onRequestGet = async ({ request, env }: Context) => {
  try {
    const queries = await Promise.all([
      buttondown({ request, env }, '/subscribers?type=regular&page=1'),
      buttondown({ request, env }, `/subscribers?type=regular&date__start=${currentMonthInSaoPaulo()}&page=1`),
      buttondown({ request, env }, '/emails?status=sent&ordering=-creation_date&page=1'),
      buttondown({ request, env }, '/emails?status=draft&ordering=-creation_date&page=1'),
      buttondown({ request, env }, '/emails?status=scheduled&ordering=publish_date&page=1'),
      buttondown({ request, env }, '/emails?ordering=-creation_date&page=1'),
    ]).then((pages) => pages.map(pageResult)) as ListResult[]
    const recent = Array.isArray(queries[5].results)
      ? await Promise.all(queries[5].results.slice(0, 5).map((campaign) => attachAnalytics(campaign, request, env)))
      : []
    return json({
      subscribers: count(queries[0]),
      newSubscribers: count(queries[1]),
      sentCampaigns: count(queries[2]),
      drafts: count(queries[3]),
      scheduled: count(queries[4]),
      recent,
      upcoming: Array.isArray(queries[4].results) ? queries[4].results.slice(0, 3) : [],
      demo: false,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
