import { byteLength, isSafeEmailBody, safeUrl } from './safety'

export type GrapesComponent = {
  type?: string; tagName?: string; content?: string; components?: GrapesComponent[];
  attributes?: Record<string, string | number | boolean>; style?: Record<string, string | number>;
  [key: string]: unknown
}
export type GrapesDocument = {
  type: 'grapesjs'; version: 3; format: 'mjml'; components: GrapesComponent[];
  // Inline component styles are canonical. No external stylesheets or executable project metadata.
  styles: []
}
export const mjmlTags = new Set(['mjml', 'mj-body', 'mj-section', 'mj-wrapper', 'mj-column', 'mj-group', 'mj-text', 'mj-image', 'mj-button', 'mj-divider', 'mj-spacer'])
const htmlTags = new Set(['div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'code', 'pre', 'br', 'hr', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'mark', 'caption', 'colgroup', 'col'])
const types = new Set(['', 'default', 'text', 'textnode', 'link', 'image', 'table', 'row', 'cell', 'comment', ...[...mjmlTags].map(tag => tag === 'mjml' ? 'mj-mjml' : tag)])
const forbidden = /^(on|script)|srcdoc|srcset|__proto__|constructor|prototype|formaction|data-gjs|background-url|background-image/i
export const safeCss = (value: string) => !/expression\s*\(|url\s*\(|@import|javascript:|vbscript:|behavior\s*:|-moz-binding|[\\<>]/i.test(value)

export function isGrapesDocument(value: unknown): value is GrapesDocument {
  if (!value || typeof value !== 'object') return false
  const doc = value as GrapesDocument
  if (doc.type !== 'grapesjs' || doc.version !== 3 || doc.format !== 'mjml' || !Array.isArray(doc.components) || !Array.isArray(doc.styles) || doc.styles.length || byteLength(JSON.stringify(doc)) > 300_000) return false
  let count = 0
  const walk = (c: GrapesComponent, depth = 0): boolean => {
    if (!c || typeof c !== 'object' || Array.isArray(c) || ++count > 10_000 || depth > 40) return false
    if (!types.has(c.type || '') || (c.tagName && !mjmlTags.has(c.tagName) && !htmlTags.has(c.tagName))) return false
    if (Object.keys(c).some(key => forbidden.test(key))) return false
    // Disallow arbitrary model behavior, trait definitions, and serialized JavaScript.
    const fields = ['type', 'tagName', 'content', 'components', 'attributes', 'style', 'classes', 'name', 'void', 'src']
    if (Object.keys(c).some(key => !fields.includes(key))) return false
    if (c.src !== undefined && (typeof c.src !== 'string' || !safeUrl(c.src, true))) return false
    if (c.classes !== undefined && (!Array.isArray(c.classes) || c.classes.some(x => typeof x !== 'string' || !/^[\w-]+$/.test(x)))) return false
    for (const [key, v] of Object.entries(c.attributes || {})) {
      if (forbidden.test(key) || !/^[\w:-]+$/.test(key) || !['string', 'number', 'boolean'].includes(typeof v)) return false
      if (['src', 'href'].includes(key) && !safeUrl(String(v), key === 'src')) return false
      if (key !== 'href' && key !== 'src' && !safeCss(String(v))) return false
      if (key === 'style' && !safeCss(String(v))) return false
    }
    if (Object.entries(c.style || {}).some(([key, v]) => forbidden.test(key) || !/^[\w-]+$/.test(key) || !['string', 'number'].includes(typeof v) || !safeCss(String(v)))) return false
    if (c.content !== undefined && (typeof c.content !== 'string' || /<\/?(?:mj-|mjml|style|link)|data-gjs-/i.test(c.content) || !isSafeEmailBody(c.content))) return false
    return c.components === undefined || (Array.isArray(c.components) && c.components.every(child => walk(child, depth + 1)))
  }
  return doc.components.length === 1 && doc.components[0].type === 'mj-mjml' && doc.components.every(c => walk(c))
}
