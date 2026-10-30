import { expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { sendTestBatch, type TestResults } from './test-delivery'
import type { DraftRecord } from '../types'
it('registra resultados individuais e repete somente não envios confirmados', async () => {
  const results: TestResults = {}
  const update = (email: string, result: TestResults[string]) => { results[email] = result }
  const send = vi.fn(async (input: Record<string, unknown>) => {
    if (!input.confirm) return { attemptId: String(input.recipient) }
    if (input.recipient === 'b@example.com') throw new ApiError('Recusado', 502, 'rejected')
    if (input.recipient === 'c@example.com') throw new ApiError('Conexão perdida', 0)
    return { accepted: true }
  })
  const prepare = vi.fn(async () => ({ id: 'test', buttondownId: 'em_test', cloudRevision: 1 }) as DraftRecord)
  const emails = ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']
  await sendTestBatch(emails, {}, prepare, update, send)
  expect(Object.values(results).map(result => result.state)).toEqual(['accepted', 'rejected', 'uncertain', 'accepted'])
  send.mockClear().mockImplementation(async input => input.confirm ? { accepted: true } : { attemptId: 'new' })
  await sendTestBatch(emails, { ...results }, prepare, update, send)
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls.every(([input]) => input.recipient === 'b@example.com')).toBe(true)
})
it('falha na preparação geral não envia e permite retomar os destinos', async () => {
  const send = vi.fn(); const results: TestResults = {}
  await sendTestBatch(['a@example.com', 'b@example.com'], {}, async () => { throw new Error('offline') }, (email, result) => { results[email] = result }, send)
  expect(Object.values(results).every(result => result.state === 'not_sent')).toBe(true)
  expect(send).not.toHaveBeenCalled()
})
