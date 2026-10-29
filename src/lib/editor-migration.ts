import { fromHtml } from 'hast-util-from-html'
import type { RootContent } from 'hast'
import { escapeHtml, isEditorDocument, isSafeEmailBody, type DocumentNode } from '../../shared/safety'
import { isGrapesDocument, type GrapesComponent, type GrapesDocument } from '../../shared/grapes-document'
import type { DraftRecord } from '../types'
import { extractEmailBody } from './email'

export class MigrationError extends Error {}
const fail = (reason: string): never => { throw new MigrationError(`${reason} O original foi preservado para recuperação.`) }
export const legacyNodeMap: Record<string, string> = { doc: '', container: 'div', body: 'div', section: 'div', div: 'div', paragraph: 'p', heading: 'h1', text: '', hardBreak: 'br', bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', codeBlock: 'pre', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', image: 'img', button: 'a', horizontalRule: 'hr', divider: 'hr', table: 'table', tableRow: 'tr', tableCell: 'td', tableHeader: 'th', twoColumns: 'table', threeColumns: 'table', fourColumns: 'table', columnsColumn: 'td' }
const marks: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', link: 'a', sub: 'sub', subscript: 'sub', sup: 'sup', superscript: 'sup', textStyle: 'span', highlight: 'mark' }
const attrNames = new Set(['style', 'alignment', 'textAlign', 'align', 'class', 'id', 'level', 'href', 'src', 'alt', 'width', 'height', 'target', 'rel', 'title', 'start', 'type', 'order', 'color', 'fontSize', 'fontFamily', 'fontWeight', 'backgroundColor', 'border', 'cellpadding', 'cellspacing', 'valign', 'bgcolor', 'colspan', 'rowspan', 'scope', 'lang', 'dir', 'data-id', 'ses:no-track'])
const cssName = (key: string) => key.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`)
function attributes(attrs: Record<string, unknown> = {}) {
  const result: Record<string, string> = {}; let style = typeof attrs.style === 'string' ? attrs.style : ''
  if (attrs.style && typeof attrs.style !== 'string') fail('Estilo legado não reconhecido.')
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === '') continue
    if (!attrNames.has(key)) fail(`Atributo legado não suportado: ${key}.`)
    if (['level', 'style'].includes(key)) continue
    if (['alignment', 'textAlign'].includes(key)) style += `;text-align:${value}`
    else if (['color', 'fontSize', 'fontFamily', 'fontWeight', 'backgroundColor'].includes(key)) style += `;${cssName(key)}:${value}`
    else result[key === 'order' ? 'start' : key] = String(value)
  }
  if (style) result.style = style
  return result
}
const attrHtml = (attrs: Record<string, string | number | boolean>) => Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`).join('')
export function legacyToHtml(document: DocumentNode): string {
  if (!isEditorDocument(document)) return fail('Documento legado inválido.')
  const render = (node: DocumentNode): string => {
    if (node.type === 'globalContent') {
      const data = node.attrs?.data as Record<string, unknown> | undefined
      if (data && Object.values(data).some(value => value != null && value !== '' && JSON.stringify(value) !== '{}' && JSON.stringify(value) !== '[]')) return fail('Tema global personalizado requer recuperação assistida.')
      return ''
    }
    if (!(node.type! in legacyNodeMap)) return fail(`Bloco legado não suportado: ${node.type}.`)
    let html = node.type === 'text' ? escapeHtml(node.text || '') : (node.content || []).map(render).join('')
    for (const mark of node.marks || []) {
      const tag = marks[mark.type]; if (!tag) return fail(`Formatação não suportada: ${mark.type}.`)
      html = `<${tag}${attrHtml(attributes(mark.attrs))}>${html}</${tag}>`
    }
    if (node.type === 'doc' || node.type === 'text') return html
    let tag = legacyNodeMap[node.type!]
    const attrs = attributes(node.attrs)
    if (node.type === 'heading') tag = `h${Math.max(1, Math.min(6, Number(node.attrs?.level) || 1))}`
    if (node.type === 'button') { attrs['data-editor-button'] = 'true'; attrs.style = `display:inline-block;background-color:#b52930;color:#ffffff;padding:13px 19px;${attrs.style || ''}`; }
    if (['twoColumns', 'threeColumns', 'fourColumns'].includes(node.type!)) { attrs['data-editor-columns'] = 'true'; html = `<tbody><tr>${html}</tr></tbody>` }
    let result = `<${tag}${attrHtml(attrs)}>${['img', 'br', 'hr'].includes(tag) ? '' : html + `</${tag}>`}`
    if (node.type === 'image' && attrs.href) { delete attrs.href; result = `<a href="${escapeHtml(String(node.attrs!.href))}"><img${attrHtml(attrs)}></a>` }
    return result
  }
  const html = render(document)
  if (!isSafeEmailBody(html)) return fail('Conteúdo legado não seguro.')
  return html
}

export const mj = (tag: string, attrs: Record<string, string | number | boolean> = {}, components: GrapesComponent[] = [], content?: string): GrapesComponent => ({ type: tag === 'mjml' ? 'mj-mjml' : tag, tagName: tag, attributes: attrs, ...(components.length ? { components } : {}), ...(content !== undefined ? { content } : {}) })
function nativeHtml(node: RootContent): GrapesComponent {
  if (node.type === 'text') return { type: 'textnode', content: escapeHtml(node.value) }
  if (node.type !== 'element') return { type: 'textnode', content: '' }
  const attrs: Record<string, string> = {}
  for (const [key, value] of Object.entries(node.properties)) attrs[({ className: 'class', colSpan: 'colspan', rowSpan: 'rowspan', cellPadding: 'cellpadding', cellSpacing: 'cellspacing', dataEditorButton: 'data-editor-button', dataEditorColumns: 'data-editor-columns' } as Record<string, string>)[key] || key] = Array.isArray(value) ? value.join(' ') : String(value)
  const defaults: Record<string, string> = { h1: 'font-family:Georgia,serif;font-size:38px;font-weight:400;line-height:1.15;margin:0 0 16px', h2: 'font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:1.2;margin:12px 0', p: 'margin:0', blockquote: 'margin:0;border-left:3px solid #b52930;padding:14px 18px;background-color:#f6f2ef', a: 'color:#b52930' }
  if (defaults[node.tagName]) attrs.style = `${defaults[node.tagName]};${attrs.style || ''}`
  return { type: node.tagName === 'a'  ? 'link' : node.tagName === 'img' ? 'image' : ['p','span','h1','h2','h3','h4','h5','h6','blockquote','li'].includes(node.tagName) ? 'text' : 'default', tagName: node.tagName, attributes: attrs, components: node.children.map(nativeHtml) }
}
const meaningful = (nodes: RootContent[]) => nodes.filter(n => n.type !== 'comment' && (n.type !== 'text' || n.value.trim()))
function block(node: RootContent): GrapesComponent[] {
  if (node.type === 'comment') return []
  if (node.type === 'text') return node.value.trim() ? [mj('mj-text', textDefaults, [nativeHtml(node)])] : []
  if (node.type !== 'element') return []
  if (['style', 'link'].includes(node.tagName)) return fail('Folhas CSS externas ou no cabeçalho não podem ser convertidas sem perda.')
  if (node.tagName === 'img') {
    const p = node.properties; const attrs: Record<string, string> = { src: String(p.src), alt: String(p.alt || ''), padding: '12px 0', align: String(p.align || 'center') }
    for (const key of ['width', 'height', 'title']) if (p[key] && p[key] !== 'auto') attrs[key] = /^\d+$/.test(String(p[key])) ? `${p[key]}px` : String(p[key])
    // Preserve arbitrary inline image styling in an editable HTML image if MJML has no equivalent.
    if (p.style) return [mj('mj-text', { padding: '0' }, [nativeHtml(node)])]
    return [mj('mj-image', attrs)]
  }
  if (node.tagName === 'a' && node.children.length === 1 && node.children[0].type === 'element' && node.children[0].tagName === 'img') {
    const result = block(node.children[0])[0]; if (result.type === 'mj-image') { result.attributes!.href = String(node.properties.href); return [result] }
  }
  if (node.tagName === 'hr' && !node.properties.style) return [mj('mj-divider', { 'border-color': '#dedbd7', 'border-width': '1px', padding: '20px 0' })]
  if (node.tagName === 'div' && !Object.values(node.properties).some(Boolean)) return meaningful(node.children).flatMap(block)
  // Each editorial block is independently editable. Lists, tables and styled
  // containers keep their complete HTML subtree, instead of being flattened.
  return [mj('mj-text', textDefaults, [nativeHtml(node)])]
}
export const textDefaults = { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': '16px', 'line-height': '1.7', color: '#252525', padding: '0 0 18px', align: 'left' }
export function htmlToDocument(html: string): GrapesDocument {
  if (!isSafeEmailBody(html)) return fail('HTML legado inseguro ou acima do limite.')
  if (/<style\b|<link\b/i.test(html)) return fail('HTML com folha de estilos requer conversão assistida; nenhum estilo foi descartado.')
  const body = extractEmailBody(html)
  const components = meaningful(fromHtml(body, { fragment: true }).children).flatMap(block)
  const doc: GrapesDocument = { type: 'grapesjs', version: 3, format: 'mjml', styles: [], components: [mj('mjml', {}, [mj('mj-body', { width: '640px', 'background-color': '#f2f0ed' }, [mj('mj-section', { 'background-color': '#ffffff', padding: '30px' }, [mj('mj-column', { padding: '0' }, components)])])])] }
  if (!isGrapesDocument(doc)) return fail('A conversão encontrou um componente incompatível.')
  assertPreserved(body, documentContent(doc))
  return doc
}
export function componentMarkup(c: GrapesComponent): string {
  if (c.type === 'textnode') return c.content || ''
  const tag = c.tagName || (c.type === 'mj-mjml' ? 'mjml' : c.type) || 'div'
  const attrs = { ...c.attributes }; if (c.src) attrs.src = String(c.src)
  if (c.style && Object.keys(c.style).length) {
    if (tag.startsWith('mj-')) Object.assign(attrs, c.style)
    else attrs.style = `${attrs.style || ''};${Object.entries(c.style).map(([k,v]) => `${k}:${v}`).join(';')}`
  }
  if (tag === 'mjml' || tag.startsWith('mj-')) { delete attrs.style; delete attrs.id }
  return `<${tag}${attrHtml(attrs)}>${c.content || ''}${(c.components || []).map(componentMarkup).join('')}${['br', 'hr', 'img'].includes(tag) ? '' : `</${tag}>`}`
}
export function documentContent(doc: GrapesDocument): string {
  const walk = (c: GrapesComponent): string => {
    if (c.type === 'mj-divider') return '<hr>'
    if (c.type === 'mj-image') return `<a${c.attributes?.href ? ` href="${escapeHtml(String(c.attributes.href))}"` : ''}><img src="${escapeHtml(String(c.attributes?.src || ''))}" alt="${escapeHtml(String(c.attributes?.alt || ''))}"></a>`
    if (c.type === 'mj-button') return `<a href="${escapeHtml(String(c.attributes?.href || '#'))}">${c.content || ''}${(c.components || []).map(walk).join('')}</a>`
    if (c.type?.startsWith('mj-')) return `${c.content || ''}${(c.components || []).map(walk).join('')}`
    return componentMarkup(c)
  }
  return doc.components.map(walk).join('')
}
export function contentInventory(html: string) {
  const tree = fromHtml(html, { fragment: true }); const tokens: string[] = []
  const visit = (node: RootContent) => {
    if (node.type === 'text') { const text = node.value.replace(/\s+/g, ' ').trim(); if (text) tokens.push(`text:${text}`); return }
    if (node.type !== 'element') return
    if (node.tagName === 'a' && node.properties.href) tokens.push(`link:${node.properties.href}`)
    if (node.tagName === 'img') tokens.push(`image:${node.properties.src}|${node.properties.alt || ''}`)
    const tag = ({ b: 'strong', i: 'em', strike: 's' } as Record<string,string>)[node.tagName] || node.tagName
    const structural = /^h[1-6]$/.test(tag) || ['ul', 'ol', 'li', 'blockquote', 'table', 'tr', 'td', 'th', 'br', 'hr', 'strong', 'em', 'u', 's', 'sub', 'sup', 'code', 'pre', 'mark'].includes(tag)
    if (structural) tokens.push(`open:${tag}`)
    node.children.forEach(visit)
    if (structural) tokens.push(`close:${tag}`)
  }
  tree.children.forEach(visit); return tokens
}
export function assertPreserved(before: string, after: string) {
  if (JSON.stringify(contentInventory(before)) !== JSON.stringify(contentInventory(after))) fail('A validação identificou diferença no texto, links, imagens ou ordem dos blocos.')
}
export function migrateDraft(original: DraftRecord): DraftRecord {
  if (original.schemaVersion === 3) { if (!isGrapesDocument(original.document)) return fail('Documento GrapesJS inválido.'); return structuredClone(original) }
  if (original.schemaVersion !== undefined && original.schemaVersion !== 2) return fail('Versão de documento desconhecida.')
  const html = original.document ? legacyToHtml(original.document) : original.content
  const document = htmlToDocument(html)
  return { ...structuredClone(original), schemaVersion: 3, document, migration: { version: 1, sourceSchema: original.schemaVersion || 1, sourceRevision: original.revision || 0 } }
}
