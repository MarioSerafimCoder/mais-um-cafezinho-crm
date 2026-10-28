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
