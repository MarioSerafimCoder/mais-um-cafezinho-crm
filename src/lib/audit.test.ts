import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from './api'
import { validateDraftPayload } from './email'
import { defaultSettings, writeDraft } from './storage'
import { getTemplate } from '../data/templates'
import { isSafeEmailBody } from '../../functions/_utils'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

it('não troca falha de rede por dados demonstrativos', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(api.status()).rejects.toThrow()
})

it.each(['<img src="https://example.com/a.png" onerror="alert(1)">', '<a href="java&#115;cript:alert(1)">link</a>', '<svg onload="alert(1)"></svg>'])('recusa HTML ativo: %s', (html) => {
  expect(isSafeEmailBody(html)).toBe(false)
  expect(() => validateDraftPayload('Teste', html)).toThrow()
})

it('não descarta armazenamento corrompido ao salvar outro rascunho', () => {
  localStorage.setItem('mais-um-cafezinho:drafts:v1', '{rascunho interrompido')
  expect(() => writeDraft({ id: 'local-new', subject: 'Teste', content: '<p>novo</p>', templateId: null, status: 'draft', updatedAt: new Date().toISOString() })).toThrow()
  expect(localStorage.getItem('mais-um-cafezinho:drafts:v1')).toBe('{rascunho interrompido')
})

it('não injeta HTML a partir do nome editorial configurado', () => {
  const template = getTemplate('blog', { ...defaultSettings, newsletterName: '<img src=x onerror=alert(1)>' })
  expect(template.content).not.toContain('<img src=x')
})
