// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { selectedAudienceFilters, selectedAudienceKey, prepareSelectedAudience } from './_campaign-audience'
import type { AppEnv } from './_utils'
const recipient = { id: 'sub_one', email_address: 'chosen@example.com', type: 'regular' }
const context = { request: new Request('https://example.com'), env: { BUTTONDOWN_API_KEY: 'test' } as AppEnv }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('recusa audiência vazia, inativa e duplicada antes de mutações', async () => {
  for (const recipients of [[], [{ ...recipient, type: 'unsubscribed' }], [recipient, { ...recipient, id: 'sub_two' }]]) await expect(selectedAudienceKey('em_one', recipients)).rejects.toThrow()
})
it('mantém marcador estável e isola campanha, endereço e seleção', async () => {
  const two = { ...recipient, id: 'sub_two', email_address: 'two@example.com' }
  const key = await selectedAudienceKey('em_one', [recipient, two])
  expect(await selectedAudienceKey('em_one', [two, recipient])).toBe(key)
  for (const [campaign, recipients] of [['em_two', [recipient, two]], ['em_one', [recipient]], ['em_one', [{ ...recipient, email_address: 'changed@example.com' }, two]]] as const) expect(await selectedAudienceKey(campaign, [...recipients])).not.toBe(key)
})
it('bloqueia publicação sem marcador observado no contato', async () => {
  const key = await selectedAudienceKey('em_one', [recipient])
  expect(() => selectedAudienceFilters(key, [recipient])).toThrow()
  expect(() => selectedAudienceFilters(key, [])).toThrow()
  expect(selectedAudienceFilters(key, [{ ...recipient, metadata: { [key]: 'included' } }]).filters[0].field).toMatch(/^subscriber\.metadata\./)
})
it('não confunde ação processada com metadado aplicado', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => String(url).endsWith('/bulk_actions') ? Response.json({ id: 'bulk_one', status: 'processed' }) : Response.json({ results: [recipient] })))
  await expect(prepareSelectedAudience(context, 'em_one', [recipient])).rejects.toMatchObject({ status: 409 })
})
it('bloqueia preparação pendente sem publicar ou ampliar a audiência', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'bulk_one', status: 'in_progress' })))
  const result = expect(prepareSelectedAudience(context, 'em_one', [recipient])).rejects.toMatchObject({ status: 409 })
  await result
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/publish'))).toBe(false)
})
it('divide 500 contatos em lotes explícitos de até 200 sem apagar outros metadados', async () => {
  const subscribers = Array.from({ length: 500 }, (_, index) => ({ ...recipient, id: `sub_${index}`, email_address: `${index}@example.com` }))
  const key = await selectedAudienceKey('em_one', subscribers)
  const batches: string[][] = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (String(url).endsWith('/bulk_actions')) {
      const payload = JSON.parse(String(init?.body)); expect(payload.metadata.action).toBe('add')
      batches.push(payload.metadata.ids); return Response.json({ id: 'bulk_one', status: 'processed' })
    }
    const ids = new URL(String(url)).searchParams.getAll('ids')
    return Response.json({ results: subscribers.filter(s => ids.includes(s.id)).map(s => ({ ...s, metadata: { [key]: 'included' } })) })
  }))
  await prepareSelectedAudience(context, 'em_one', subscribers)
  expect(batches.map(batch => batch.length)).toEqual([200, 200, 100])
  expect(batches.flat()).toEqual(subscribers.map(s => s.id))
})
