// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { onRequestPost } from './api/subscribers'

afterEach(() => vi.unstubAllGlobals())

function post(body: unknown) {
  const env = { BUTTONDOWN_API_KEY: 'test-only-key' }
  return onRequestPost({
    env,
    request: new Request('https://crm.marioserafim.com.br/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

it('valida o endereço antes de consultar ou gravar na Buttondown', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const response = await post({ email_address: 'endereço inválido' })
  expect(response.status).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})

it('não reativa automaticamente um endereço descadastrado', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [{ email_address: 'mario@example.com', type: 'unsubscribed' }], count: 1 })))
  const response = await post({ email_address: 'MARIO@example.com' })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ existingType: 'unsubscribed' })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('ativa um cadastro novo sem confirmação por e-mail', async () => {
  const network = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ id: 'sub_new', email_address: 'mario@example.com', type: 'regular', creation_date: '2026-10-28T12:00:00Z' }, { status: 201 })
    return Response.json({ results: [], count: 0 })
  })
  vi.stubGlobal('fetch', network)

  const response = await post({ email_address: ' Mario@Example.com ' })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ id: 'sub_new', email_address: 'mario@example.com', type: 'regular' })
  expect(network).toHaveBeenCalledTimes(2)
  const [url, init] = network.mock.calls[1]
  expect(url).toBe('https://api.buttondown.com/v1/subscribers')
  expect(JSON.parse(String(init?.body))).toEqual({ email_address: 'mario@example.com', type: 'regular' })
  expect(new Headers(init?.headers).has('X-Buttondown-Collision-Behavior')).toBe(false)
})

it('ativa sem nova confirmação o cadastro pendente já existente', async () => {
  const network = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'PATCH') return Response.json({ id: 'sub_pending', email_address: 'mario@example.com', type: 'regular', creation_date: '2026-10-28T12:00:00Z' })
    return Response.json({ results: [{ id: 'sub_pending', email_address: 'mario@example.com', type: 'unactivated' }], count: 1 })
  })
  vi.stubGlobal('fetch', network)

  const response = await post({ email_address: 'mario@example.com' })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: 'sub_pending', type: 'regular', activatedExisting: true })
  expect(network).toHaveBeenCalledTimes(2)
  const [url, init] = network.mock.calls[1]
  expect(url).toBe('https://api.buttondown.com/v1/subscribers/sub_pending')
  expect(init?.method).toBe('PATCH')
  expect(JSON.parse(String(init?.body))).toEqual({ type: 'regular' })
})
