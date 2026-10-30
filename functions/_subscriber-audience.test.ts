// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { activeSubscriberTypes } from '../shared/audience'
import { countActiveSubscribers, validateSelectedSubscribers, subscriberPage } from './_subscriber-audience'
const context = { env: { BUTTONDOWN_API_KEY: 'mock' }, request: new Request('https://example.com') }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('valida 500 IDs paginados com no máximo duas consultas simultâneas', async () => {
  let running = 0; let maximum = 0
  const network = vi.fn(async (url: string) => {
    running++; maximum = Math.max(maximum, running)
    await new Promise(resolve => setTimeout(resolve, 0))
    const params = new URL(url).searchParams
    const ids = params.getAll('ids'); const page = Number(params.get('page'))
    running--
    return Response.json({ count: ids.length, results: ids.slice((page - 1) * 25, page * 25).map(id => ({ id, email_address: `${id}@example.com`, type: 'gifted' })), next: page === 1 ? 'page2' : null })
  })
  vi.stubGlobal('fetch', network)
  const ids = Array.from({ length: 500 }, (_, i) => `sub_${i}`)
  expect((await validateSelectedSubscribers(context, ids)).map(s => s.id)).toEqual(ids)
  expect(network).toHaveBeenCalledTimes(20)
  expect(maximum).toBeLessThanOrEqual(2)
  expect(network.mock.calls.every(([url]) => new URL(url).pathname === '/v1/subscribers')).toBe(true)
})
it('recusa ID ausente sem recorrer a consulta individual', async () => {
  const network = vi.fn(async () => Response.json({ count: 0, results: [], next: null }))
  vi.stubGlobal('fetch', network)
  await expect(validateSelectedSubscribers(context, ['sub_missing'])).rejects.toMatchObject({ status: 409 })
  expect(network).toHaveBeenCalledOnce()
})
it('respeita Retry-After em leitura e limita retentativas', async () => {
  vi.useFakeTimers()
  const network = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '1' } })).mockResolvedValue(Response.json({ results: [], count: 0 }))
  vi.stubGlobal('fetch', network)
  const pending = subscriberPage(context, new URLSearchParams({ page: '1' }))
  await vi.advanceTimersByTimeAsync(999)
  expect(network).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1); await pending
  expect(network).toHaveBeenCalledTimes(2)
  network.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }))
  await expect(subscriberPage(context, new URLSearchParams())).rejects.toMatchObject({ status: 429 })
  expect(network).toHaveBeenCalledTimes(3)
})
it('conta usando todos os tipos da política de publicação em uma consulta', async () => {
  const network = vi.fn(async () => Response.json({ count: 42, results: [] }))
  vi.stubGlobal('fetch', network)
  expect(await countActiveSubscribers(context)).toBe(42)
  expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams.getAll('type')).toEqual(activeSubscriberTypes)
})
