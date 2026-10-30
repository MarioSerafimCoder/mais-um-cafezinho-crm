// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('mantém envio habilitado exclusivamente na configuração de produção autorizada', () => {
  const text = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const production = text.split('[env.production.vars]')[1]?.split('\n[')[0]
  const defaults = text.split('[vars]')[1]?.split('\n[')[0]
  expect(production).toMatch(/^CAMPAIGN_SENDING_ENABLED\s*=\s*"true"$/m)
  expect(defaults).not.toMatch(/CAMPAIGN_SENDING_ENABLED\s*=\s*"true"/)
  expect(readFileSync(new URL('../wrangler.local.toml', import.meta.url), 'utf8')).not.toMatch(/CAMPAIGN_SENDING_ENABLED\s*=\s*"true"/)
})
