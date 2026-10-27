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
    expect(result.body).toContain('buttondown-editor-mode: fancy')
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
