import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DraftPersistence } from './draft-persistence'
import { DraftSession } from './draft-session'
import { ApiError } from './api'
import { readDrafts } from './storage'
import type { DraftRecord } from '../types'

const initial: DraftRecord = { id: 'local-queue', subject: 'Texto', content: '<p>Texto</p>', document: { type: 'doc', content: [{ type: 'paragraph' }] }, templateId: null, status: 'draft', updatedAt: '2026-10-28T12:00:00Z', revision: 0 }
const status = { configured: true, connected: true, cloud: true, demo: false }
let queues: DraftPersistence[] = []
beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { queues.forEach(q => q.dispose()); queues = []; vi.useRealTimers(); vi.restoreAllMocks() })
function setup(draft = initial) {
  const services = {
    status: vi.fn().mockResolvedValue(status),
    saveCloudDraft: vi.fn(async (d: DraftRecord): Promise<DraftRecord> => ({ ...d, cloudRevision: (d.cloudRevision || 0) + 1 })),
    cloudDraft: vi.fn().mockRejectedValue(new ApiError('ausente', 404)),
    saveDraft: vi.fn().mockResolvedValue({ id: 'em_queue', status: 'draft', subject: 'Texto' }),
  }
  const session = new DraftSession(draft)
  const queue = new DraftPersistence(session, async () => '<p>Texto</p>', services)
  queues.push(queue); queue.configure(status)
  return { queue, session, services }
}
it('coalesce digitação com debounce e não cria campanhas automaticamente', async () => {
  const { queue, session, services } = setup()
  for (const subject of ['a', 'ab', 'abc']) { session.edit({ subject }); queue.schedule(); await vi.advanceTimersByTimeAsync(400) }
  expect(services.saveCloudDraft).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(600)
  expect(readDrafts()[0].subject).toBe('abc')
  expect(services.saveCloudDraft).toHaveBeenCalledOnce()
  expect(services.saveDraft).not.toHaveBeenCalled()
  expect(queue.label).toBe('Todas as alterações salvas.')
})
it('cria uma vez por preparação e atualiza o vínculo automaticamente', async () => {
  const { queue, session, services } = setup()
  await queue.flush(true)
  expect(services.saveDraft.mock.calls[0][0]).not.toHaveProperty('id', 'em_queue')
  session.edit({ subject: 'Continuação' }); queue.schedule()
  await vi.advanceTimersByTimeAsync(600)
  await queue.flush()
  expect(services.saveDraft).toHaveBeenCalledTimes(2)
  expect(services.saveDraft.mock.calls[1][0]).toMatchObject({ id: 'em_queue', subject: 'Continuação' })
  expect(queue.label).toBe('Todas as alterações salvas.')
})
it('salva localmente offline, limita retentativas e retoma após reconectar', async () => {
  const { queue, session, services } = setup()
  services.saveCloudDraft.mockRejectedValue(new ApiError('offline', 0))
  session.edit({ subject: 'Offline' }); queue.schedule()
  await vi.advanceTimersByTimeAsync(15000)
  expect(readDrafts()[0].subject).toBe('Offline')
  expect(services.saveCloudDraft).toHaveBeenCalledTimes(4)
  expect(queue.label).toContain('sincronização pendente')
  services.saveCloudDraft.mockImplementation(async d => ({ ...d, cloudRevision: 1 }))
  await queue.reconnect(); await vi.advanceTimersByTimeAsync(600)
  expect(queue.label).toBe('Todas as alterações salvas.')
})
it('falha local impede chamadas remotas e não declara sucesso', async () => {
  const { queue, services } = setup()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio') })
  await vi.advanceTimersByTimeAsync(600)
  expect(queue.label).toContain('intervenção necessária')
  expect(services.saveCloudDraft).not.toHaveBeenCalled()
})
it('serializa alterações durante resposta lenta, preservando a versão atual', async () => {
  const { queue, session, services } = setup()
  let finish!: (d: DraftRecord) => void
  services.saveCloudDraft.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const running = queue.flush()
  session.edit({ subject: 'Durante' }); queue.schedule()
  await vi.advanceTimersByTimeAsync(600)
  expect(services.saveCloudDraft).toHaveBeenCalledOnce()
  finish({ ...initial, cloudRevision: 1 }); await running
  await vi.advanceTimersByTimeAsync(600)
  expect(services.saveCloudDraft).toHaveBeenCalledTimes(2)
  expect(services.saveCloudDraft).toHaveBeenLastCalledWith(expect.objectContaining({ subject: 'Durante', cloudRevision: 1 }))
})
it('conflito remoto preserva a cópia local e interrompe retentativas', async () => {
  const { queue, services } = setup()
  services.saveCloudDraft.mockRejectedValue(new ApiError('Outra versão', 409))
  await vi.advanceTimersByTimeAsync(10000)
  expect(services.saveCloudDraft).toHaveBeenCalledOnce()
  expect(readDrafts()[0].subject).toBe('Texto')
  expect(queue.error).toBe('Outra versão')
})
it('não repete criação incerta em segundo plano e reutiliza a chave na recuperação explícita', async () => {
  const { queue, services } = setup()
  services.saveDraft.mockRejectedValueOnce(new ApiError('timeout', 0))
  await expect(queue.flush(true)).rejects.toThrow('timeout')
  const payload = services.saveDraft.mock.calls[0][0]
  await vi.advanceTimersByTimeAsync(10000)
  expect(services.saveDraft).toHaveBeenCalledOnce()
  await queue.flush(true)
  expect(services.saveDraft.mock.calls[1][0]).toEqual(payload)
})
it('reconcilia confirmação D1 perdida antes de repetir uma escrita', async () => {
  const { queue, services } = setup()
  services.saveCloudDraft.mockRejectedValueOnce(new ApiError('timeout', 0))
  services.cloudDraft.mockResolvedValue({ ...initial, cloudRevision: 1, cloudSavedRevision: 0 })
  await queue.flush()
  expect(queue.session.value.cloudRevision).toBe(1)
  expect(services.saveCloudDraft).toHaveBeenCalledOnce()
})
it('outra aba não é sobrescrita nem propagada para os destinos remotos', async () => {
  const first = new DraftSession(initial); first.save()
  const { queue, session, services } = setup(first.value)
  first.edit({ subject: 'Aba A' }); first.save()
  session.edit({ subject: 'Aba B' }); queue.schedule()
  await vi.advanceTimersByTimeAsync(600)
  expect(readDrafts()[0].subject).toBe('Aba A')
  expect(session.value.subject).toBe('Aba B')
  expect(services.saveCloudDraft).not.toHaveBeenCalled()
})

it('atualização incerta de rascunho vinculado pode ser reconciliada sem recriação', async () => {
  const { queue, session, services } = setup({ ...initial, buttondownId: 'em_queue', syncedRevision: 0, syncedBodyHash: 'a'.repeat(64) })
  session.edit({ subject: 'Atualização' })
  services.saveDraft.mockRejectedValueOnce(new ApiError('offline', 0))
  await expect(queue.flush()).rejects.toThrow('offline')
  await queue.reconnect()
  await vi.advanceTimersByTimeAsync(600)
  await queue.flush()
  expect(services.saveDraft).toHaveBeenCalledTimes(2)
  expect(services.saveDraft.mock.calls.every(([payload]) => payload.id === 'em_queue' && payload.expectedBodyHash)).toBe(true)
})

it('metadados pendentes continuam identificáveis depois de reabrir o documento', async () => {
  const { queue, session, services } = setup()
  services.saveCloudDraft.mockImplementation(async d => {
    if (d.buttondownId) throw new ApiError('offline', 0)
    return { ...d, cloudRevision: (d.cloudRevision || 0) + 1 }
  })
  await expect(queue.flush(true)).rejects.toThrow('offline')
  expect(session.value.cloudSavedRevision).toBeUndefined()
  queue.dispose()
  const reopened = setup(readDrafts()[0])
  await reopened.queue.flush()
  expect(reopened.services.saveCloudDraft).toHaveBeenCalledWith(expect.objectContaining({ buttondownId: 'em_queue' }))
  expect(reopened.services.saveDraft).not.toHaveBeenCalled()
})
