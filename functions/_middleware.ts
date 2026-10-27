import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AppEnv } from './_utils'

type Context = {
  request: Request
  env: AppEnv
  next: () => Promise<Response>
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function accessJwks(teamDomain: string) {
  const existing = jwksCache.get(teamDomain)
  if (existing) return existing
  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
  jwksCache.set(teamDomain, jwks)
  return jwks
}

function withSecurityHeaders(response: Response, isApi: boolean) {
  const secured = new Response(response.body, response)
  secured.headers.set('Cache-Control', isApi ? 'private, no-store' : 'private, no-cache')
  secured.headers.set('X-Content-Type-Options', 'nosniff')
  secured.headers.set('Referrer-Policy', 'no-referrer')
  secured.headers.set('X-Frame-Options', 'DENY')
  secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  secured.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
  return secured
}

export const onRequest = async ({ request, env, next }: Context) => {
  const url = new URL(request.url)
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  const localBypass = isLocal && env.LOCAL_ACCESS_BYPASS === 'true'
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const audience = env.CF_ACCESS_AUD?.trim()

  if (!localBypass) {
    if (!teamDomain || !audience) {
      return withSecurityHeaders(Response.json({ error: 'Cloudflare Access não está configurado.' }, { status: 503 }), url.pathname.startsWith('/api/'))
    }
    const assertion = request.headers.get('Cf-Access-Jwt-Assertion')
    if (!assertion) {
      return withSecurityHeaders(Response.json({ error: 'Acesso restrito.' }, { status: 401 }), url.pathname.startsWith('/api/'))
    }
    try {
      await jwtVerify(assertion, accessJwks(teamDomain), { issuer: `https://${teamDomain}`, audience })
    } catch {
      return withSecurityHeaders(Response.json({ error: 'Acesso restrito.' }, { status: 401 }), url.pathname.startsWith('/api/'))
    }
  }

  return withSecurityHeaders(await next(), url.pathname.startsWith('/api/'))
}
