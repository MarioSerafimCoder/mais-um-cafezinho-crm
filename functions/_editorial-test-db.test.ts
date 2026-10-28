/// <reference types="node" />
// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { onRequestGet, onRequestPost } from './api/editorial-test'
import { onRequestGet as campaignGet, onRequestPost as campaignPost } from './api/campaign-delivery'
import type { AppEnv } from './_utils'

const databases: DatabaseSync[] = []
afterEach(() => { vi.unstubAllGlobals(); databases.splice(0).forEach(db => db.close()) })
function setup({ draftTemplate = 'classic', remoteTemplate = 'classic' }: { draftTemplate?: 'classic' | 'modern'; remoteTemplate?: string | null } = {}) {
  const db = new DatabaseSync(':memory:'); databases.push(db)
  for (const name of ['0001_editorial_documents', '0002_editorial_tests', '0003_campaign_send_attempts', '0004_editorial_test_results']) db.exec(readFileSync(`migrations/${name}.sql`, 'utf8'))
  const body = '<p>Teste</p>'
  const draft = { id: 'test-draft', subject: 'Uma newsletter nova', document: { type: 'doc' }, buttondownId: 'em_test', buttondownTemplate: draftTemplate, revision: 2, syncedRevision: 2, cloudSavedRevision: 2, syncedBodyHash: createHash('sha256').update(body).digest('hex') }
  db.prepare('INSERT INTO editorial_documents (kind, id, payload, version, updated_at) VALUES (?, ?, ?, ?, ?)').run('draft', draft.id, JSON.stringify(draft), 4, new Date().toISOString())
  const adapter = {
    prepare: (sql: string) => ({
      bind: (...args: SQLInputValue[]) => ({
        first: async () => db.prepare(sql).get(...args) || null,
        all: async () => ({ results: db.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
      }),
    }),
  }
  const env = { DB: adapter, BUTTONDOWN_API_KEY: 'mock', EDITORIAL_TEST_RECIPIENTS: 'owner@example.com' } as unknown as AppEnv
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'em_test', status: 'draft', body, subject: draft.subject, template: remoteTemplate })))
  const post = (input: object) => onRequestPost({ env, request: new Request('https://example.com/api/editorial-test', { method: 'POST', body: JSON.stringify({ draftId: draft.id, cloudRevision: 4, ...input }) }) })
  const prepare = async () => (await (await post({ recipientIndex: 0 })).json()) as { attemptId: string }
  const history = async () => (await (await onRequestGet({ env, request: new Request(`https://example.com/api/editorial-test?draftId=${draft.id}`) })).json()).attempts as Array<{ id: string; state: string; provider_status: number }>
  return { db, env, post, prepare, history }
}
it('preserva histórico e permite novo teste explícito da mesma revisão após aceitação', async () => {
  const { post, prepare, history } = setup()
  const first = await prepare()
  expect((await post({ attemptId: first.attemptId, confirm: true })).status).toBe(200)
  expect((await post({ attemptId: first.attemptId, confirm: true })).status).toBe(409)
  const second = await prepare()
  expect(second.attemptId).toBeTruthy(); expect(second.attemptId).not.toBe(first.attemptId)
  expect((await history()).map(row => row.state).sort()).toEqual(['accepted', 'prepared'])
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/send-draft'))).toHaveLength(1)
})
it.each([403, 422, 429])('registra recusa HTTP %s e permite nova preparação', async status => {
  const { post, prepare, history } = setup(); const first = await prepare()
  vi.mocked(fetch).mockImplementation(async url => String(url).endsWith('/send-draft') ? new Response('{}', { status }) : Response.json({ status: 'draft', body: '<p>Teste</p>', subject: 'Uma newsletter nova', template: 'classic' }))
  expect((await post({ attemptId: first.attemptId, confirm: true })).status).toBe(502)
  expect(await history()).toEqual([expect.objectContaining({ state: 'rejected', provider_status: status })])
  expect((await prepare()).attemptId).toBeTruthy()
})
it.each([409, 500, 504])('preserva resultado incerto HTTP %s e bloqueia nova tentativa', async status => {
  const { post, prepare, history } = setup(); const first = await prepare()
  vi.mocked(fetch).mockImplementation(async url => String(url).endsWith('/send-draft') ? new Response('{}', { status }) : Response.json({ status: 'draft', body: '<p>Teste</p>', subject: 'Uma newsletter nova', template: 'classic' }))
  await post({ attemptId: first.attemptId, confirm: true })
  expect((await post({ recipientIndex: 0 })).status).toBe(409)
  expect(await history()).toEqual([expect.objectContaining({ state: 'attempted', provider_status: status })])
})
it('preparações concorrentes geram apenas um registro; cancelamento não remove histórico', async () => {
  const { post, prepare, history } = setup()
  const responses = await Promise.all([post({ recipientIndex: 0 }), post({ recipientIndex: 0 })])
  expect(responses.map(r => r.status).sort()).toEqual([200, 409])
  const [row] = await history()
  expect((await post({ attemptId: row.id, cancel: true })).status).toBe(200)
  expect((await prepare()).attemptId).toBeTruthy()
  expect((await history()).map(row => row.state).sort()).toEqual(['cancelled', 'prepared'])
})
it('conteúdo remoto alterado impede envio mesmo com revisão local igual', async () => {
  const { post, prepare } = setup(); const first = await prepare()
  vi.mocked(fetch).mockResolvedValue(Response.json({ status: 'draft', body: '<p>Alterado</p>', subject: 'Uma newsletter nova', template: 'classic' }))
  expect((await post({ attemptId: first.attemptId, confirm: true })).status).toBe(409)
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/send-draft'))).toHaveLength(0)
})
it('bloqueia campanhas quando a flag do servidor não está ativa', async () => {
  const { env } = setup()
  const response = await campaignPost({ env, request: new Request('https://example.com/api/campaign-delivery', { method: 'POST', body: JSON.stringify({ action: 'confirm', confirm: true }) }) })
  expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled()
})
it('habilita o painel de campanhas apenas com a flag explícita', async () => {
  const { env } = setup()
  env.CAMPAIGN_SENDING_ENABLED = 'true'
  vi.mocked(fetch).mockImplementation(async () => Response.json({ count: 6, results: [] }))
  const response = await campaignGet({ env, request: new Request('https://example.com/api/campaign-delivery') })
  expect(await response.json()).toEqual({ enabled: true, activeCount: 12, selectedLimit: 500 })
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('prepara a campanha quando Buttondown retorna template nulo para usar o padrão da newsletter', async () => {
  const { env } = setup({ draftTemplate: 'classic', remoteTemplate: null })
  env.CAMPAIGN_SENDING_ENABLED = 'true'
  vi.mocked(fetch).mockImplementation(async url => String(url).includes('/subscribers?')
    ? Response.json({ count: 1, results: [] })
    : Response.json({ id: 'em_test', status: 'draft', body: '<p>Teste</p>', subject: 'Uma newsletter nova', template: null, filters: { filters: [], groups: [] }, email_type: 'public' }))
  const response = await campaignPost({ env, request: new Request('https://example.com/api/campaign-delivery', { method: 'POST', body: JSON.stringify({ action: 'prepare', draftId: 'test-draft', cloudRevision: 4, audience: { mode: 'all_active' } }) }) })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ audienceMode: 'all_active', recipientCount: 2 })
  expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).endsWith('/publish') && !String(url).endsWith('/send-draft'))).toBe(true)
})
