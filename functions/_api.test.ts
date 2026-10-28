// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet as status } from './api/status'
import { onRequestGet as dashboard } from './api/dashboard'
import { onRequestPost as create } from './api/emails/index'
import { onRequestPatch as patch } from './api/emails/[id]'
import { onRequestPost as upload } from './api/images'
import { onRequestGet as subscribers } from './api/subscribers'
import { matchesButtondownTemplate } from './_utils'

const env = { BUTTONDOWN_API_KEY: 'test-only-key' }
const request = new Request('https://crm.marioserafim.com.br/api/status')
afterEach(() => vi.unstubAllGlobals())
const mock = (data: unknown, code = 200) => vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(data, { status: code })))

describe('Buttondown com mocks, sem chamadas externas', () => {
  it('não trata template nulo (padrão da newsletter) como divergência', () => {
    expect(matchesButtondownTemplate(null, 'modern')).toBe(true)
    expect(matchesButtondownTemplate(null, 'classic')).toBe(true)
    expect(matchesButtondownTemplate('classic', 'classic')).toBe(true)
    expect(matchesButtondownTemplate('classic', 'modern')).toBe(false)
  })

  it('recusa uploads acima do limite sem encaminhar bytes à Buttondown', async () => {
    mock({})
    const req = new Request('https://crm.marioserafim.com.br/api/images', { method: 'POST', headers: { 'content-length': '8500001' } })
    expect((await upload({ request: req, env })).status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('usa redirect manual compatível com Workers e recusa redirecionamento sem reenviar credenciais', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      expect(init.redirect).toBe('manual')
      return new Response(null, { status: 302, headers: { Location: 'https://example.com/' } })
    }))
    expect(await (await status({ request, env })).json()).toMatchObject({ connected: false })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('distingue chave configurada, conexão e demonstração', async () => {
    mock({ detail: 'secret response never forwarded' }, 401)
    expect(await (await status({ request, env })).json()).toMatchObject({ configured: true, connected: false, demo: false })
    expect(await (await status({ request, env: {} })).json()).toMatchObject({ configured: false, connected: false, demo: false })
    mock({ results: [], count: 0 })
    expect(await (await status({ request, env })).json()).toMatchObject({ connected: true })
  })

  it('usa totais do servidor, não o tamanho da página', async () => {
    mock({ results: [{ id: 'one' }], count: 123, next: 'next' })
    const result = await (await dashboard({ request, env })).json() as { subscribers: number; sentCampaigns: number }
    expect(result.subscribers).toBe(123)
    expect(result.sentCampaigns).toBe(123)
  })

  it('não transforma resposta inválida em lista vazia', async () => {
    mock({ unexpected: true })
    expect((await subscribers({ request, env })).status).toBe(500)
  })

  it('encaminha página e busca e mantém o total correto', async () => {
    mock({ results: [], count: 70, next: null })
    const result = await subscribers({ request: new Request('https://crm.marioserafim.com.br/api/subscribers?page=3&email_address=ana'), env })
    expect(await result.json()).toMatchObject({ count: 70, results: [] })
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('page=3')
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('email_address=ana')
  })

  it('impede envio e descarta campos extras mesmo em payload forjado', async () => {
    const req = (statusValue: string) => new Request('https://crm.marioserafim.com.br/api/emails', { method: 'POST', headers: { 'X-Idempotency-Key': 'create-test-123456789' }, body: JSON.stringify({ subject: 'Oi', body: '<p>Texto</p>', status: statusValue, publish_date: '2026-10-28', email_type: 'private' }) })
    mock({ id: 'em_test', status: 'draft' }, 201)
    expect((await create({ request: req('sent'), env })).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
    expect((await create({ request: req('draft'), env })).status).toBe(201)
    const init = vi.mocked(fetch).mock.calls[0][1]!
    expect(JSON.parse(init.body as string)).toEqual({ subject: 'Oi', body: '<p>Texto</p>', status: 'draft' })
    expect(new Headers(init.headers).get('X-Idempotency-Key')).toBe('create-test-123456789')
  })

  it('não altera campanhas que já saíram do estado de rascunho', async () => {
    mock({ status: 'sent' })
    const req = new Request('https://crm.marioserafim.com.br/api/emails/em_test', { method: 'PATCH', body: JSON.stringify({ subject: 'Oi', body: '<p>Texto</p>', status: 'draft' }) })
    expect((await patch({ request: req, env, params: { id: 'em_test' } })).status).toBe(409)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejeita arquivo disfarçado de imagem antes do upload', async () => {
    mock({})
    const form = new FormData()
    form.set('image', new File(['<svg onload=alert(1)>'], 'fake.png', { type: 'image/png' }))
    const req = new Request('https://crm.marioserafim.com.br/api/images', { method: 'POST', body: form })
    expect((await upload({ request: req, env })).status).toBe(415)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('faz upload multipart validado e trata falhas de permissão', async () => {
    const req = () => {
      const form = new FormData()
      form.set('image', new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], 'photo.png', { type: 'image/png' }))
      return new Request('https://crm.marioserafim.com.br/api/images', { method: 'POST', body: form })
    }
    mock({ image: 'https://images.example.com/photo.png' }, 201)
    expect(await (await upload({ request: req(), env })).json()).toMatchObject({ url: 'https://images.example.com/photo.png' })
    mock({}, 403)
    expect((await upload({ request: req(), env })).status).toBe(403)
  })
})
