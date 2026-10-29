import { describe, expect, it } from 'vitest'
import { isGrapesDocument } from '../../shared/safety'
import { htmlToDocument, mj, documentContent } from './editor-migration'
import { compileEmail } from './mjml-export'
import { editorialBlocks } from './grapes-editor'
import { preserveOriginal, readOriginal } from './storage'
import type { DraftRecord } from '../types'

describe('segurança do documento nativo e do fragmento', () => {
  it.each([
    { type: 'script', tagName: 'script', content: 'alert(1)' },
    { type: 'default', tagName: 'form' },
    { type: 'mj-text', tagName: 'mj-text', script: 'alert(1)' },
    { type: 'mj-image', tagName: 'mj-image', attributes: { src: 'javascript:alert(1)' } },
    { type: 'mj-text', tagName: 'mj-text', content: '<img src="https://example.com/a" onerror="alert(1)">' },
    { type: 'mj-text', tagName: 'mj-text', content: '<div data-gjs-script="alert(1)">x</div>' },
    { type: 'mj-text', tagName: 'mj-text', style: { color: 'red; background:url(https://evil.example)' } },
  ])('recusa execução e componentes ativos: %j', component => {
    const document = htmlToDocument('<p>Seguro</p>')
    document.components[0].components!.push(component)
    expect(isGrapesDocument(document)).toBe(false)
    expect(() => compileEmail(document)).toThrow()
  })
  it('converte CSS de colunas em larguras inline e mantém fragmento centralizado', () => {
    const document = htmlToDocument('<p>Texto</p>')
    document.components[0].components![0].components!.push(structuredClone(editorialBlocks.find(b => b.id === 'columns')!.content))
    const body = compileEmail(document)
    expect(body).toContain('width: 50%')
    expect(body).not.toMatch(/<head|<style|<script/)
    expect(body).toContain('align="center"')
    expect(body).toContain('Primeira coluna')
  })
  it('bloqueia coluna pixel incompatível com o fragmento sem CSS de cabeçalho', () => {
    const document = htmlToDocument('<p>Texto</p>')
    document.components[0].components![0].components = [mj('mj-section', {}, [mj('mj-column', { width: '300px' }, [mj('mj-text', {}, [], 'Texto')])])]
    expect(() => compileEmail(document)).toThrow('percentuais')
  })
  it('preserva estilos, listas numeradas e formatação inline', () => {
    const document = htmlToDocument('<h2 style="text-align:right;color:#123456">Título</h2><p><strong>Forte</strong> <em>Ênfase</em></p><ol start="3"><li>Terceiro</li></ol>')
    const html = compileEmail(document)
    expect(html).toContain('text-align:right;color:#123456')
    expect(html).toContain('<strong>Forte</strong>')
    expect(html).toContain('<em>Ênfase</em>')
    expect(html).toContain('start="3"')
    expect(documentContent(document)).toContain('Título')
  })
  it('backup original é imutável e falha de gravação não é ignorada', () => {
    localStorage.clear()
    const old = { id: 'original-test', subject: 'Antes', content: '<p>Antes</p>' } as DraftRecord
    preserveOriginal(old)
    preserveOriginal({ ...old, subject: 'Depois' })
    expect(readOriginal(old.id)?.subject).toBe('Antes')
  })
})
