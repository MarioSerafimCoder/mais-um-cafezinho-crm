import mjml from 'mjml-browser'
import { isGrapesDocument, type GrapesDocument } from '../../shared/grapes-document'
import { isSafeEmailBody, byteLength } from '../../shared/safety'
import { componentMarkup } from './editor-migration'
import { compatibleEmailBody } from './email'

export function exportMjml(doc: GrapesDocument) {
  if (!isGrapesDocument(doc)) throw new Error('O documento contém um componente ou propriedade não permitidos.')
  return doc.components.map(componentMarkup).join('')
}

function bodyWidth(source: string) {
  const match = source.match(/<mj-body\b[^>]*\bwidth=["'](\d+)px["']/i)
  return match ? Math.max(320, Number(match[1])) : 600
}

function percentageFromClass(value: string) {
  const match = /(?:^|\s)mj-column-per-([\d-]+)/.exec(value)
  if (!match) return null
  const percentage = Number(match[1].replace('-', '.'))
  return Number.isFinite(percentage) && percentage > 0 && percentage <= 100 ? percentage : null
}

function applyResponsiveColumns(dom: Document, source: string) {
  const desktopWidth = bodyWidth(source)
  for (const element of dom.body.querySelectorAll<HTMLElement>('[class]')) {
    const pixelColumn = /(?:^|\s)mj-column-px-(\d+)/.exec(element.className)
    const percentage = percentageFromClass(element.className)
    if (!pixelColumn && percentage === null) continue
    // The Buttondown payload keeps only the body fragment, so MJML's head
    // media queries are not reliable. A hybrid inline-block layout preserves
    // columns on wide screens and naturally wraps them when the viewport is
    // narrower than a column's desktop width.
    if (percentage !== null) {
      const maxWidth = Math.max(1, Math.round(desktopWidth * percentage / 100))
      element.style.width = '100%'
      element.style.maxWidth = `${maxWidth}px`
      element.style.display = 'inline-block'
      element.style.verticalAlign = 'top'
      element.style.boxSizing = 'border-box'
    } else {
      // A fixed-width legacy column cannot be made fluid without the removed
      // head CSS. Stack it safely rather than allowing horizontal overflow.
      element.style.width = '100%'
      element.style.maxWidth = '100%'
      element.style.display = 'block'
      element.style.boxSizing = 'border-box'
    }
  }
}

export function compileEmail(doc: GrapesDocument) {
  const source = exportMjml(doc)
  const result = mjml(source, { validationLevel: 'strict', fonts: {}, keepComments: false })
  if (result.errors.length) throw new Error(`Não foi possível exportar: ${result.errors.map(e => e.message).join('; ')}`)
  const dom = new DOMParser().parseFromString(result.html, 'text/html')
  applyResponsiveColumns(dom, source)
  // Standard MJML reset rules are applied directly; no font fetches or head CSS.
  for (const table of dom.body.querySelectorAll<HTMLElement>('table')) { table.style.borderCollapse = 'collapse'; table.setAttribute('role', 'presentation') }
  for (const img of dom.body.querySelectorAll<HTMLElement>('img')) { img.style.maxWidth = '100%'; img.style.border = '0'; img.style.display = 'block' }
  const body = `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tbody><tr><td align="center">${dom.body.innerHTML}</td></tr></tbody></table>`
  if (byteLength(body) > 199_500 || !isSafeEmailBody(body)) throw new Error('O HTML exportado é inseguro ou ultrapassa 200 KB.')
  return compatibleEmailBody(body)
}
