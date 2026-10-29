import { expect, it } from 'vitest'
import { normalizeCampaigns } from './campaigns'
import type { DraftRecord } from '../types'
const draft: DraftRecord = { id: 'a', buttondownId: 'em_1', subject: 'Mesmo assunto', content: '', status: 'draft', templateId: null, revision: 2, syncedRevision: 2, cloudSavedRevision: 2, updatedAt: '2026-10-28T10:00:00Z' }
it('une três origens por identidade e preserva o estado de publicação', () => {
  const result = normalizeCampaigns([draft], [{ ...draft, cloudRevision: 1 }], [{ id: 'em_1', subject: 'Antigo', status: 'sent' }])
  expect(result).toHaveLength(1)
  expect(result[0].editorialState).toBe('Enviada')
})
it('não une assuntos iguais e ordena datas com desempate estável', () => {
  const result = normalizeCampaigns([draft, { ...draft, id: 'b', buttondownId: undefined, updatedAt: '2026-10-28T11:00:00Z' }], [], [])
  expect(result).toHaveLength(2)
  expect(result[0].editorId).toBe('b')
})
it('seleciona o documento mais recente mesmo quando está na nuvem', () => {
  const result = normalizeCampaigns([draft], [{ ...draft, subject: 'Mais recente', updatedAt: '2026-10-28T12:00:00Z', cloudRevision: 3 }], [])
  expect(result[0].subject).toBe('Mais recente')
  expect(result[0].draft).toBeUndefined()
})
it('páginas repetidas não duplicam e falha remota não oculta locais', () => {
  expect(normalizeCampaigns([draft], [draft, draft], []).length).toBe(1)
  expect(normalizeCampaigns([draft], [], [])[0].editorId).toBe('a')
})
it('mantém a identidade quando D1 e a nuvem usam IDs diferentes para o mesmo vínculo', () => {
  const local = { ...draft, id: 'local-copy', updatedAt: '2026-10-28T10:00:00Z' }
  const cloud = { ...draft, id: 'd1-copy', updatedAt: '2026-10-28T12:00:00Z', cloudRevision: 5 }
  const result = normalizeCampaigns([local], [cloud], [{ id: 'em_1', subject: 'Publicado', status: 'sent' }])
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ id: 'bd:em_1', editorId: 'd1-copy', status: 'sent', editorialState: 'Enviada' })
})
it('não deixa uma cópia local antiga rebaixar uma campanha publicada', () => {
  const result = normalizeCampaigns([{ ...draft, subject: 'Rascunho antigo', updatedAt: '2026-10-27T10:00:00Z' }], [], [{ id: 'em_1', subject: 'Enviada', status: 'sent', modification_date: '2026-10-28T10:00:00Z' }])
  expect(result[0]).toMatchObject({ status: 'sent', editorialState: 'Enviada', subject: 'Rascunho antigo' })
})
it('ordena datas ausentes ou inválidas de forma determinística', () => {
  const result = normalizeCampaigns([
    { ...draft, id: 'z', buttondownId: undefined, updatedAt: 'data-inválida' },
    { ...draft, id: 'a', buttondownId: undefined, updatedAt: '' },
    { ...draft, id: 'b', buttondownId: undefined, updatedAt: '2026-10-28T09:00:00Z' },
  ], [], [])
  expect(result.map(item => item.id)).toEqual(['doc:b', 'doc:a', 'doc:z'])
})
it('distingue sincronização pendente de publicação e preserva a ação de edição', () => {
  const pending = { ...draft, id: 'pending', revision: 4, syncedRevision: 3, cloudSavedRevision: 3, updatedAt: '2026-10-28T13:00:00Z' }
  const result = normalizeCampaigns([pending], [], [{ id: 'em_1', subject: 'Campanha', status: 'draft' }])
  expect(result[0]).toMatchObject({ id: 'bd:em_1', editorId: 'pending', status: 'draft', editorialState: 'Sincronização pendente' })
})
