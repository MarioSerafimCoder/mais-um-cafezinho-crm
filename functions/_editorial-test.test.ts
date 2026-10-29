/// <reference types="node" />
// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { onRequestPost } from './api/editorial-test'
import type { AppEnv } from './_utils'
import { createHash } from 'node:crypto'
const draft = { id: 'local-test', document: { type: 'doc' }, subject: 'HOMOLOGAÇÃO NÃO ENVIAR', buttondownId: 'em_test', revision: 2, syncedRevision: 2, cloudSavedRevision: 2, syncedBodyHash: createHash('sha256').update('<p>Teste</p>').digest('hex') }
function setup(overrides = {}) {
  let claimed = false
  const row = { draft_id: draft.id, cloud_revision: 4, recipient: 'owner@example.com', campaign_id: 'em_test', body: '<p>Teste</p>', subject: draft.subject, created_at: new Date().toISOString() }
  const db = { prepare: (sql: string) => ({ bind: () => ({ first: async () => sql.includes('editorial_documents') ? { payload: JSON.stringify(draft), version: 4 } : row, run: async () => { if (sql.includes("state = 'attempted'")) { const changes = claimed ? 0 : 1; claimed = true; return { meta: { changes } } }; return { meta: { changes: 1 } } } }) }) }
  const env = { DB: db, BUTTONDOWN_API_KEY: 'mock-only', EDITORIAL_TEST_ENABLED: 'true', EDITORIAL_TEST_RECIPIENTS: 'owner@example.com', ...overrides } as unknown as AppEnv
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'draft', body: row.body, subject: row.subject, template: 'classic' })))
  return (body: object) => onRequestPost({ env, request: new Request('https://example.com/api/editorial-test', { method: 'POST', body: JSON.stringify({ draftId: draft.id, cloudRevision: 4, ...body }) }) })
}
afterEach(() => vi.unstubAllGlobals())
it('respeita desativação explícita sem chamadas externas', async () => { const run = setup({ EDITORIAL_TEST_ENABLED: 'false' }); expect((await run({})).status).toBe(403); expect(fetch).not.toHaveBeenCalled() })
it('allowlist e chave configuradas dispensam flag por teste', async () => { const run = setup({ EDITORIAL_TEST_ENABLED: undefined }); expect((await run({ recipientIndex: 0 })).status).toBe(200) })
it('recusa destinatário arbitrário e revisão antiga', async () => { const run = setup(); expect((await run({ recipients: ['x@example.com'] })).status).toBe(400); expect((await run({ cloudRevision: 3 })).status).toBe(409); expect(fetch).not.toHaveBeenCalled() })
it('bloqueia endereço digitado fora da allowlist', async () => { const run = setup(); expect((await run({ recipient: 'outside@example.com' })).status).toBe(403); expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/send-draft'))).toHaveLength(0) })
it('prepara destino exato sem enviar', async () => { const run = setup(); const response = await run({ recipientIndex: 0 }); expect(await response.json()).toMatchObject({ recipient: 'owner@example.com', cloudRevision: 4 }); expect(fetch).toHaveBeenCalledTimes(1); expect(vi.mocked(fetch).mock.calls[0][0]).not.toContain('send-draft') })
it('exige confirmação e impede repetição; usa somente send-draft', async () => {
  const run = setup()
  expect((await run({ attemptId: 'test' })).status).toBe(400)
  expect((await run({ attemptId: 'test', confirm: true })).status).toBe(200)
  expect((await run({ attemptId: 'test', confirm: true })).status).toBe(409)
  const sends = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/send-draft'))
  expect(sends).toHaveLength(1)
  expect(JSON.parse(sends[0][1]!.body as string)).toEqual({ recipients: ['owner@example.com'] })
})
it('recusa campanha já enviada', async () => { const run = setup(); vi.mocked(fetch).mockResolvedValue(Response.json({ status: 'sent' })); expect((await run({ recipientIndex: 0 })).status).toBe(409) })
it('resultado incerto não permite novo envio da mesma tentativa', async () => {
  const run = setup()
  vi.mocked(fetch).mockImplementation(async (url) => { if (String(url).endsWith('/send-draft')) throw new TypeError('timeout'); return Response.json({ status: 'draft', body: '<p>Teste</p>', subject: draft.subject, template: 'classic' }) })
  expect((await run({ attemptId: 'test', confirm: true })).status).toBe(502)
  expect((await run({ attemptId: 'test', confirm: true })).status).toBe(409)
})
it('requisições concorrentes reclamam a tentativa uma única vez', async () => {
  const run = setup()
  const responses = await Promise.all([run({ attemptId: 'same', confirm: true }), run({ attemptId: 'same', confirm: true })])
  expect(responses.map(r => r.status).sort()).toEqual([200, 409])
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/send-draft'))).toHaveLength(1)
})
it('bloqueia allowlist vazia ou índice inexistente sem enviar', async () => {
  const run = setup({ EDITORIAL_TEST_RECIPIENTS: '' })
  expect((await run({ recipientIndex: 0 })).status).toBe(403)
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/send-draft'))).toHaveLength(0)
})
it('aceita endereços digitados quando o proprietário habilita testes sem allowlist', async () => {
  const run = setup({ EDITORIAL_TEST_RECIPIENTS: '', EDITORIAL_TEST_ENABLED: 'true' })
  expect((await run({ recipient: 'leitor@example.com' })).status).toBe(200)
})
