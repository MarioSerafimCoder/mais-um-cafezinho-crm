import { describe, expect, it } from 'vitest'
import { templates } from '../data/templates'
import { extractEmailBody, ensureUnsubscribeLink, validateDraftPayload } from './email'
import { isSafeEmailBody, safePage } from '../../functions/_utils'

describe('newsletter templates', () => {
  it('provides the three editorial starting points with Buttondown unsubscribe tags', () => {
    expect(templates.map((template) => template.id)).toEqual(['blog', 'curadoria', 'especial'])
    for (const template of templates) expect(template.content).toContain('{{ unsubscribe_url }}')
  })
})

describe('draft HTML', () => {
  it('keeps an existing unsubscribe link without duplicating it', () => {
    const html = '<html><body><p><a href="{{ unsubscribe_url }}">Sair</a></p></body></html>'
    expect(ensureUnsubscribeLink(html)).toBe(html)
  })

  it('adds the unsubscribe link inside the email body when missing', () => {
    const html = ensureUnsubscribeLink('<html><body><p>Oi</p></body></html>')
    expect(html.indexOf('{{ unsubscribe_url }}')).toBeLessThan(html.indexOf('</body>'))
  })

  it('marks Buttondown content as rich HTML and always creates a draft', () => {
    const result = validateDraftPayload('  Uma edição  ', '<html><body><p>Oi</p></body></html>')
    expect(result.subject).toBe('Uma edição')
    expect(result.body).toContain('buttondown-editor-mode: plaintext')
    expect(result.body).not.toContain('<html>')
    expect(result.body).toContain('{{ unsubscribe_url }}')
    expect(result.status).toBe('draft')
  })

  it('rejects empty subjects and active HTML', () => {
    expect(() => validateDraftPayload('  ', '<p>Oi</p>')).toThrow('Dê um assunto')
    expect(() => validateDraftPayload('Teste', '<script>alert(1)</script>')).toThrow('marcação ativa')
    expect(isSafeEmailBody('<a href="javascript:alert(1)">link</a>')).toBe(false)
  })

  it('extracts the body portion of React Email output', () => {
    expect(extractEmailBody('<html><head></head><body><p>Texto</p></body></html>')).toBe('<p>Texto</p>')
  })
  it('preserva estrutura inline, imagem/alt e destinos ao gerar o fragmento compatível', () => {
    const fragment = '<table role="presentation" style="width:100%;max-width:600px"><tbody><tr><td><h1 style="color:#c00">Título</h1><img src="https://example.com/a.png" alt="Descrição" style="max-width:100%" /><a href="https://example.com/?a=1&amp;b=2">Ler</a><a href="{{ unsubscribe_url }}">Sair</a></td></tr></tbody></table>'
    const { body } = validateDraftPayload('Teste', `<html><head><style>body{margin:0}</style></head><body>${fragment}</body></html>`)
    expect(body).toBe(`<!-- buttondown-editor-mode: plaintext -->${fragment}`)
    expect(body.match(/unsubscribe_url/g)).toHaveLength(1)
  })
  it('não junta palavras nem modifica espaços em conteúdo pré-formatado', () => {
    const html = '<p><a href="https://example.com">Uma</a> <strong>conversa</strong></p><pre> a\n\n b </pre><a href="{{ unsubscribe_url }}">Sair</a>'
    const body = validateDraftPayload('Teste', html).body
    expect(body).not.toContain('\n')
    expect(body).toContain('</a> <strong>')
    expect(body).toContain('<pre> a&#10;&#10; b </pre>')
    const original = new DOMParser().parseFromString(html, 'text/html')
    const exported = new DOMParser().parseFromString(body, 'text/html')
    expect(exported.body.textContent).toBe(original.body.textContent)
  })
  it('retira marcadores internos React e recuos de formatação que virariam código Markdown', () => {
    const body = validateDraftPayload('Teste', '<body><!--$--><!--html--><!--head--><!--body-->\n    <table\n width="100%">\n <tr><td>Olá\n mundo</td></tr>\n</table><!--/$--></body>').body
    expect(body).not.toContain('<!--head-->')
    expect(body).not.toContain('\n')
    expect(body).toContain('<td>Olá mundo</td>')
  })
})

describe('Buttondown pagination validation', () => {
  it('accepts positive integer pages and rejects invalid values', () => {
    expect(safePage('3')).toBe(3)
    expect(safePage(null)).toBe(1)
    expect(safePage('0')).toBeNull()
    expect(safePage('1.5')).toBeNull()
    expect(safePage('abc')).toBeNull()
  })
})
