import { buttondown, errorResponse, json, pageResult } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }
type ListResult = { results?: Array<Record<string, unknown>>; count?: number }

function currentMonthInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}-01`
}

function count(result: ListResult) {
  return Number.isFinite(result.count) ? Number(result.count) : null
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
    const recent = Array.isArray(queries[5].results) ? queries[5].results.slice(0, 5) : []
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
