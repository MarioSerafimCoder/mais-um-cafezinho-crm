import { fromHtml } from 'hast-util-from-html'

export const byteLength = (text: string) => new TextEncoder().encode(text).length

export function safeUrl(value: string, image = false) {
  if (!image && /^\{\{\s*unsubscribe_url\s*\}\}$/.test(value)) return true
  const clean = Array.from(value).filter((char) => char.charCodeAt(0) > 32 && char.charCodeAt(0) !== 127).join('')
  try {
    const url = new URL(clean)
    return image ? url.protocol === 'https:' : ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)
  } catch { return !image && clean.startsWith('#') }
}

const dangerousCss = /expression\s*\(|url\s*\(|@import|javascript:|vbscript:|behavior\s*:|-moz-binding|\\/i
const forbiddenTags = new Set(['script', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'base', 'link', 'video', 'audio'])

export function isSafeEmailBody(body: string) {
  if (byteLength(body) > 200_000) return false
  try {
    const tree = fromHtml(body, { fragment: true })
    function visit(node: (typeof tree.children)[number] | typeof tree): boolean {
      if (node.type === 'element') {
        if (forbiddenTags.has(node.tagName)) return false
        for (const [key, value] of Object.entries(node.properties)) {
          const name = key.toLowerCase()
          if (name.startsWith('on') || ['srcdoc', 'srcset', 'formaction', 'action', 'xlinkhref'].includes(name)) return false
          if ((name === 'href' || name === 'src') && !safeUrl(String(value), name === 'src')) return false
          if (name === 'style' && dangerousCss.test(String(value))) return false
          if (name === 'httpequiv' && String(value).toLowerCase() === 'refresh') return false
        }
        if (node.tagName === 'style' && node.children.some((child) => child.type === 'text' && dangerousCss.test(child.value))) return false
      }
      return !('children' in node) || node.children.every(visit)
    }
    return visit(tree)
  } catch { return false }
}

export type DocumentNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: DocumentNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

export function isEditorDocument(value: unknown): value is DocumentNode {
  let nodes = 0
  function attrsSafe(attrs: unknown) {
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return false
    return Object.entries(attrs).every(([key, item]) => {
      if (/^on|srcdoc|srcset|__proto__|constructor/i.test(key)) return false
      if (item == null) return true
      if (key === 'href' || key === 'src') return typeof item === 'string' && safeUrl(item, key === 'src')
      if (key === 'style') return typeof item === 'string' && !dangerousCss.test(item)
      return ['string', 'number', 'boolean'].includes(typeof item) && String(item).length <= 10_000
    })
  }
  function visit(node: unknown, depth: number): boolean {
    if (++nodes > 10_000 || depth > 40 || !node || typeof node !== 'object' || Array.isArray(node)) return false
    const n = node as DocumentNode
    return typeof n.type === 'string' && /^[a-zA-Z][\w-]{0,60}$/.test(n.type)
      && (n.text === undefined || typeof n.text === 'string')
      && (n.attrs === undefined || attrsSafe(n.attrs))
      && (n.content === undefined || (Array.isArray(n.content) && n.content.every((child) => visit(child, depth + 1))))
      && (n.marks === undefined || (Array.isArray(n.marks) && n.marks.every((mark) => typeof mark.type === 'string' && (mark.attrs === undefined || attrsSafe(mark.attrs)))))
  }
  return visit(value, 0) && (value as DocumentNode).type === 'doc'
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
