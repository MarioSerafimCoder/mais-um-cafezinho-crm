import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DraftSession } from './draft-session'
import { readDrafts } from './storage'
import type { DraftRecord } from '../types'

const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto original' }] }] }
const initial: DraftRecord = { id: 'local-test-123456', subject: 'Original', content: '<p>Legado</p>', document, schemaVersion: 2, templateId: null, status: 'draft', updatedAt: '2026-10-27T00:00:00Z' }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('integridade de rascunhos', () => {
  it('serializa sincronizações simultâneas sem criar duas campanhas', async () => {
    const session = new DraftSession(initial)
    const send = vi.fn().mockResolvedValue({ id: 'em_one' })
    await Promise.all([session.sync(async () => '<p>Oi</p>', send), session.sync(async () => '<p>Oi</p>', send)])
    expect(send).toHaveBeenCalledOnce()
    expect(readDrafts()).toHaveLength(1)
  })
  it('salva JSON sem depender da exportação HTML e não duplica o id', () => {
    const session = new DraftSession(initial)
    session.edit({ subject: 'Novo' }); session.save(); session.save()
    expect(readDrafts()).toHaveLength(1)
    expect(readDrafts()[0].document).toEqual(document)
  })

  it('resposta lenta não sobrescreve edição feita durante sincronização', async () => {
    const session = new DraftSession(initial)
    let finish!: (value: { id: string }) => void
    const sending = session.sync(async () => '<p>Original</p>', () => new Promise((resolve) => { finish = resolve }))
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    session.edit({ subject: 'Continuação', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nova frase' }] }] } })
    finish({ id: 'em_123' }); await sending
    expect(readDrafts()[0].subject).toBe('Continuação')
    expect(readDrafts()[0].document?.content?.[0].content?.[0].text).toBe('Nova frase')
    expect(session.value.syncedRevision).toBeLessThan(session.value.revision!)
  })

  it('reutiliza payload e chave após falha incerta de criação', async () => {
    const session = new DraftSession(initial)
    const send = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({ id: 'em_123' })
    await expect(session.sync(async () => '<p>Primeiro</p>', send)).rejects.toThrow('offline')
    session.edit({ subject: 'Depois da falha' })
    await session.sync(async () => '<p>Outro corpo</p>', send)
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0])
    expect(session.value.subject).toBe('Depois da falha')
    expect(session.value.buttondownId).toBe('em_123')
  })

  it('não informa sucesso se o armazenamento estiver cheio', () => {
    const session = new DraftSession(initial)
    session.edit({ subject: 'Não perder' })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError') })
    expect(() => session.save()).toThrow()
    expect(session.state).toBe('erro')
    expect(session.dirty).toBe(true)
  })

  it('detecta conflito entre abas sem sobrescrever a outra cópia', () => {
    const first = new DraftSession(initial); first.save()
    const second = new DraftSession(first.value)
    first.edit({ subject: 'Aba um' }); first.save()
    second.edit({ subject: 'Aba dois' })
    expect(() => second.save()).toThrow('outra aba')
    expect(readDrafts()[0].subject).toBe('Aba um')
  })

  it('não sobrepõe o documento atual ao receber confirmação da nuvem', async () => {
    const session = new DraftSession(initial)
    let finish!: (value: DraftRecord) => void
    const saving = session.saveCloud(() => new Promise((resolve) => { finish = resolve }))
    session.edit({ subject: 'Editado durante gravação' })
    finish({ ...initial, cloudRevision: 1, lastCloudSavedAt: 'agora' }); await saving
    expect(session.value.subject).toBe('Editado durante gravação')
    expect(session.value.cloudRevision).toBe(1)
  })
})
