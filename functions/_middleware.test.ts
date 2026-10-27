// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { onRequest } from './_middleware'
import type { AppEnv } from './_utils'

vi.mock('jose', async (original) => ({
  ...await original<typeof import('jose')>(),
  createRemoteJWKSet: vi.fn(),
}))

const domain = 'crm-test.cloudflareaccess.com'
const env = { CF_ACCESS_TEAM_DOMAIN: domain, CF_ACCESS_AUD: 'crm-audience' }
let keys: Awaited<ReturnType<typeof generateKeyPair>>

beforeAll(async () => {
  keys = await generateKeyPair('RS256')
  const jwk = await exportJWK(keys.publicKey)
  vi.mocked(createRemoteJWKSet).mockReturnValue(createLocalJWKSet({ keys: [{ ...jwk, kid: 'test' }] }) as ReturnType<typeof createRemoteJWKSet>)
})

async function token(audience = env.CF_ACCESS_AUD, issuer = `https://${domain}`, expiration = '5m') {
  return new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(issuer).setAudience(audience).setExpirationTime(expiration).sign(keys.privateKey)
}

function call(url: string, config: AppEnv = env, assertion?: string) {
  const next = vi.fn(async () => new Response('private CRM'))
  const request = new Request(url, { headers: assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {} })
  return { next, response: onRequest({ request, env: config, next }) }
}

describe('proteção do CRM em produção', () => {
  it('bloqueia painel, assets, rotas internas e APIs sem autenticação', async () => {
    for (const path of ['/', '/assets/app.js', '/campaigns', '/editor/new', '/api/subscribers']) {
      const { response, next } = call(`https://crm.marioserafim.com.br${path}`)
      expect((await response).status).toBe(401)
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('falha fechada quando Access não foi configurado', async () => {
    expect((await call('https://crm.marioserafim.com.br/', {}).response).status).toBe(503)
  })

  it('recusa aliases Pages e previews mesmo com JWT válido', async () => {
    for (const host of ['mais-um-cafezinho-crm.pages.dev', 'abc.mais-um-cafezinho-crm.pages.dev']) {
      const { response, next } = call(`https://${host}/api/subscribers`, env, await token())
      expect((await response).status).toBe(404)
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('redireciona HTTP para HTTPS preservando caminho e consulta', async () => {
    const response = await call('http://crm.marioserafim.com.br/campaigns?page=2').response
    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe('https://crm.marioserafim.com.br/campaigns?page=2')
  })

  it('aceita assinatura, emissor, audiência e validade corretos', async () => {
    const { response, next } = call('https://crm.marioserafim.com.br/api/subscribers', env, await token())
    const result = await response
    expect(result.status).toBe(200)
    expect(next).toHaveBeenCalledOnce()
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('recusa token malformado, audiência errada, emissor errado e expiração', async () => {
    for (const jwt of ['invalid', await token('other'), await token(env.CF_ACCESS_AUD, 'https://other.cloudflareaccess.com'), await token(env.CF_ACCESS_AUD, `https://${domain}`, '-1m')]) {
      const { response, next } = call('https://crm.marioserafim.com.br/', env, jwt)
      expect((await response).status).toBe(401)
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('não permite ativar bypass local em produção', async () => {
    const config = { ...env, LOCAL_ACCESS_BYPASS: 'true' }
    expect((await call('https://crm.marioserafim.com.br/', config).response).status).toBe(401)
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect((await call(`http://${host}:8788/`, config).response).status).toBe(200)
    }
  })
})
