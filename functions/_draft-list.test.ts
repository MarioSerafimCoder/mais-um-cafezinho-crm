// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { onRequestGet } from './api/drafts/index'
import type { AppEnv } from './_utils'

it('pagina por atualização e ID estável, sem OFFSET', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: String(i).padStart(3, '0'), updatedAt: '2026-10-28T10:00:00Z' }))
  const all = vi.fn().mockResolvedValue({ results: rows })
  const bind = vi.fn().mockReturnValue({ all })
  const prepare = vi.fn().mockReturnValue({ all, bind })
  const env = { DB: { prepare } } as unknown as AppEnv
  const first = await (await onRequestGet({ request: new Request('https://crm.test/api/drafts'), env })).json() as { results: unknown[]; next: string }
  expect(first.results).toHaveLength(100)
  expect(JSON.parse(first.next)).toEqual(['2026-10-28T10:00:00Z', '099'])
  await onRequestGet({ request: new Request('https://crm.test/api/drafts?cursor=' + encodeURIComponent(first.next)), env })
  expect(prepare).toHaveBeenLastCalledWith(expect.stringContaining('ORDER BY updated_at DESC, id ASC LIMIT 101'))
  expect(prepare.mock.calls.at(-1)?.[0]).not.toContain('OFFSET')
  expect(bind).toHaveBeenCalledWith('2026-10-28T10:00:00Z', '2026-10-28T10:00:00Z', '099')
})
it('rejeita cursor inválido antes de consultar o banco', async () => {
  const response = await onRequestGet({ request: new Request('https://crm.test/api/drafts?cursor=invalid'), env: {} })
  expect(response.status).toBe(400)
})
