import { describe, expect, it } from 'vitest'
import legacy from './fixtures/legacy-basic.json'
import { migrateDraft, legacyToHtml, documentContent, assertPreserved } from './editor-migration'
import { compileEmail } from './mjml-export'
import { isGrapesDocument } from '../../shared/grapes-document'
import type { DocumentNode } from '../../shared/safety'
import type { DraftRecord } from '../types'
import { getTemplate, templates } from '../data/templates'

const text = (value: string): DocumentNode => ({ type: 'text', text: value })
const paragraph = (...content: DocumentNode[]): DocumentNode => ({ type: 'paragraph', content })
const draft = (content: DocumentNode[]): DraftRecord => ({ id: 'legacy-1', subject: 'Assunto preservado', content: '<p>HTML anterior</p>', document: { type: 'doc', content }, schemaVersion: 2, status: 'draft', revision: 8, syncedRevision: 8, cloudRevision: 4, cloudSavedRevision: 8, buttondownId: 'remote-1', syncedBodyHash: 'a'.repeat(64), templateId: 'blog', updatedAt: '2026-01-01' })
describe('migração determinística sem perdas', () => {
  const fixtures = [
    [paragraph(text('Simples'))],
    [{ type: 'container', content: [{ type: 'heading', attrs: { level: 2 }, content: [text('Seção')] }, paragraph(text('Primeira')), { type: 'section', content: [paragraph(text('Segunda'))] }] }],
    [{ type: 'image', attrs: { src: 'https://example.com/image.png', alt: 'Legenda original', width: 320, href: 'https://example.com/foto' } }],
    [paragraph({ ...text('Link'), marks: [{ type: 'link', attrs: { href: 'https://example.com/a?b=1&c=2' } }] }), { type: 'button', attrs: { href: 'https://example.com/cta' }, content: [text('Abrir')] }],
    [paragraph({ ...text('Formatado'), marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }] })],
    [{ type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [paragraph(text('Item'))] }] }, { type: 'blockquote', content: [paragraph(text('Citação'))] }],
    [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(text('Célula'))] }] }] }],
  ] as DocumentNode[][]
  fixtures.forEach((content, index) => it(`preserva estrutura, texto e URLs: cenário ${index + 1}`, () => {
    const original = draft(content); const migrated = migrateDraft(original)
    expect(isGrapesDocument(migrated.document)).toBe(true)
    expect(migrated).toMatchObject({ id: original.id, revision: 8, syncedRevision: 8, cloudRevision: 4, cloudSavedRevision: 8, buttondownId: 'remote-1' })
    if (!isGrapesDocument(migrated.document)) throw Error('invalid')
    assertPreserved(legacyToHtml(original.document as DocumentNode), documentContent(migrated.document))
    expect(compileEmail(migrated.document)).toContain('<table')
    expect(migrateDraft(migrated)).toEqual(migrated)
    expect(original.schemaVersion).toBe(2)
  }))
  it('converte JSON real do editor anterior sem renderer legado', () => {
    const migrated = migrateDraft(legacy as DraftRecord)
    expect(isGrapesDocument(migrated.document)).toBe(true)
    if (isGrapesDocument(migrated.document)) expect(compileEmail(migrated.document)).toContain('Um bom projeto')
  })
  it('recusa nós e marcas desconhecidos em vez de descartar texto', () => {
    expect(() => migrateDraft(draft([{ type: 'unknownWidget', content: [text('NÃO PERDER')] }]))).toThrow('original foi preservado')
    expect(() => migrateDraft(draft([paragraph({ ...text('NÃO PERDER'), marks: [{ type: 'unknownMark' }] })]))).toThrow('Formatação')
  })
  it('recusa scripts e URLs perigosas', () => {
    expect(() => migrateDraft({ ...draft([]), document: undefined, content: '<img src="javascript:alert(1)">' })).toThrow()
    expect(() => migrateDraft(draft([{ type: 'image', attrs: { src: 'https://example.com/i', onerror: 'alert(1)' } }]))).toThrow()
  })
  it.each(templates.map(t => t.id))('converte template HTML %s e compila com MJML real', id => {
    const original = { ...draft([]), document: undefined, content: getTemplate(id).content }
    const migrated = migrateDraft(original)
    if (!isGrapesDocument(migrated.document)) throw Error('invalid')
    const html = compileEmail(migrated.document)
    expect(html).not.toMatch(/<head|<style|<script/)
    expect(html).toContain('Mário Serafim')
  })
})
