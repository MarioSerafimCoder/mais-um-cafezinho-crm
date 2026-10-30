import { describe, expect, it } from 'vitest'
import { templates } from '../data/templates'
import { extractEmailBody, preserveEmailHtml, validateDraftPayload } from './email'
import { buildEditorialEmail } from './email-layout'
import { draftPayload, isSafeEmailBody, safePage } from '../../functions/_utils'

describe('newsletter templates', () => {
  it('provides six distinct, link-safe editorial starting points and uses the centered Modern provider scaffold', () => {
    expect(templates.map((template) => template.id)).toEqual(['blog', 'curadoria', 'especial', 'carta', 'bastidores', 'convite'])
    for (const template of templates) {
      expect(template.preheader).toBeTruthy()
      expect(template.buttondownTemplate).toBe('modern')
      expect(template.content).not.toContain('example.com')
      expect(template.content).not.toContain('{{ unsubscribe_url }}')
      expect(isSafeEmailBody(template.content)).toBe(true)
    }
  })
})

describe('draft HTML', () => {
  it('preserves editor HTML and leaves the unsubscribe footer to Buttondown', () => {
    const html = '<html><body><p><a href="{{ unsubscribe_url }}">Sair</a></p></body></html>'
    expect(preserveEmailHtml(html)).toBe(html)
  })

  it('does not duplicate the Buttondown unsubscribe footer in the body', () => {
    const html = '<html><body><p>Oi</p></body></html>'
    expect(preserveEmailHtml(html)).toBe(html)
  })

  it('marks Buttondown content as rich HTML and always creates a draft', () => {
    const result = validateDraftPayload('  Uma edição  ', '<html><body><p>Oi</p></body></html>')
    expect(result.subject).toBe('Uma edição')
    expect(result.body).toContain('buttondown-editor-mode: plaintext')
    expect(result.body).not.toContain('<html>')
    expect(result.body).not.toContain('{{ unsubscribe_url }}')
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

  it('wraps structured editor HTML in a responsive table frame with inline, safe styles', () => {
    const html = buildEditorialEmail('<h1>Uma edição</h1><p>Texto <a href="https://marioserafim.com.br">com link</a>.</p>', { newsletterName: 'Mais um Cafezinho', editionLabel: 'ARTIGO', editionDate: '2026-10-28' })
    expect(html).toContain('role="presentation"')
    expect(html).toContain('max-width:640px')
    expect(html).toMatch(/font-family:\s*Georgia/)
    expect(html).toContain('28 de outubro de 2026')
    expect(isSafeEmailBody(html)).toBe(true)
    expect(html).not.toMatch(/<style|<script|display:\s*(?:flex|grid)/i)
  })

  it('keeps editor-inserted images fluid and their alt text in the email body', () => {
    const html = buildEditorialEmail('<p>Uma imagem de apoio.</p><img src="https://example.com/foto.jpg" alt="Caderno de referências" />', { newsletterName: 'Mais um Cafezinho', editionLabel: 'ENSAIO', editionDate: '2026-10-28' })
    expect(html).toContain('max-width: 100%')
    expect(html).toContain('alt="Caderno de referências"')
    expect(isSafeEmailBody(html)).toBe(true)
  })

  it('allows only draft metadata and the Classic/Modern per-email templates', () => {
    expect(draftPayload({ subject: 'Teste', body: '<p>Olá</p>', status: 'draft', description: 'Uma prévia curta', template: 'classic' })).toEqual({ subject: 'Teste', body: '<p>Olá</p>', status: 'draft', description: 'Uma prévia curta', template: 'classic' })
    expect(draftPayload({ subject: 'Teste', body: '<p>Olá</p>', status: 'sent', template: 'modern' })).toBeNull()
    expect(draftPayload({ subject: 'Teste', body: '<p>Olá</p>', status: 'draft', template: 'naked' })).toBeNull()
    expect(draftPayload({ subject: 'Teste', body: '<p>Olá</p>', status: 'draft', description: '<img src=x>' })).toBeNull()
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
