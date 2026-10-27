import { beforeEach, expect, it } from 'vitest'
import { importRecoveryCopies } from './recovery'
import { readDrafts, writeDraft } from './storage'

beforeEach(() => localStorage.clear())
const old = { id: 'old', subject: 'Edição anterior', content: '<p>Legado</p>', templateId: 'blog' as const, status: 'draft' as const, updatedAt: '2026-10-27', buttondownId: 'em_existing' }

it('recupera HTML legado como cópia sem substituir a edição original', () => {
  writeDraft(old)
  expect(importRecoveryCopies(JSON.stringify(old))).toBe(1)
  expect(readDrafts()).toHaveLength(2)
  expect(readDrafts().find((draft) => draft.id === 'old')).toEqual(old)
  expect(readDrafts().find((draft) => draft.id !== 'old')?.buttondownId).toBeUndefined()
})

it('não importa parcialmente um backup com documento inválido', () => {
  expect(() => importRecoveryCopies(JSON.stringify([old, { ...old, content: '<img onerror="bad()">' }]))).toThrow()
  expect(readDrafts()).toHaveLength(0)
})
