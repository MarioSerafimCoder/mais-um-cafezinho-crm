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

function protectEditorialStyles(dom: Document) {
  const inheritedColor = (element: HTMLElement) => {
    let parent: HTMLElement | null = element
    while (parent) { if (parent.style.color) return parent.style.color; parent = parent.parentElement }
    return '#252525'
  }
  // Provider templates set global link and blockquote colors with !important.
  // Resolve authored colors onto the actual text elements before that cascade.
  for (const element of dom.body.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,blockquote,a,span')) {
    const color = inheritedColor(element)
    element.style.setProperty('color', color, 'important')
    if (element.tagName === 'P' || element.tagName === 'LI') element.style.setProperty('line-height', '1.7', 'important')
    if (element.tagName === 'BLOCKQUOTE') {
      element.style.setProperty('background-color', element.style.backgroundColor || '#f3eee7', 'important')
      element.style.setProperty('border-left', '4px solid #a32630', 'important')
      element.style.setProperty('padding', '20px 22px', 'important')
    }
    if (element.tagName === 'A') {
      const background = element.style.backgroundColor
      element.style.setProperty('color', element.style.color || '#a32630', 'important')
      if (background) {
        element.style.setProperty('background-color', background, 'important')
        element.style.setProperty('color', '#ffffff', 'important')
        element.style.setProperty('text-decoration', 'none', 'important')
        element.style.fontWeight = '700'
        // A child span also protects CTA text in clients that restyle links.
        const label = dom.createElement('span')
        label.style.setProperty('color', '#ffffff', 'important')
        while (element.firstChild) label.append(element.firstChild)
        element.append(label)
      }
    }
  }
}

export function compileEmail(doc: GrapesDocument) {
  const source = exportMjml(doc)
  const desktopWidth = bodyWidth(source)
  const result = mjml(source, { validationLevel: 'strict', fonts: {}, keepComments: false })
  if (result.errors.length) throw new Error(`Não foi possível exportar: ${result.errors.map(e => e.message).join('; ')}`)
  const dom = new DOMParser().parseFromString(result.html, 'text/html')
  applyResponsiveColumns(dom, source)
  protectEditorialStyles(dom)
  // Standard MJML reset rules are applied directly; no font fetches or head CSS.
  for (const table of dom.body.querySelectorAll<HTMLElement>('table')) { table.style.borderCollapse = 'collapse'; table.setAttribute('role', 'presentation') }
  for (const img of dom.body.querySelectorAll<HTMLElement>('img')) { img.style.maxWidth = '100%'; img.style.border = '0'; img.style.display = 'block' }
  // Keep the newsletter frame centered in clients that ignore MJML's head CSS.
  // The inner cell remains left-aligned so authored paragraph/heading alignment
  // is preserved while the email itself stays centered in the message body.
  const body = `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" bgcolor="#e9e5df" style="width:100%;border-collapse:collapse;background-color:#e9e5df;margin:0 auto;text-align:center"><tbody><tr><td align="center" style="text-align:center;padding:24px 0"><table role="presentation" align="center" width="${desktopWidth}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${desktopWidth}px;border-collapse:collapse;margin:0 auto;text-align:left"><tbody><tr><td align="left" style="text-align:left;padding:0">${dom.body.innerHTML}</td></tr></tbody></table></td></tr></tbody></table>`
  if (byteLength(body) > 199_500 || !isSafeEmailBody(body)) throw new Error('O HTML exportado é inseguro ou ultrapassa 200 KB.')
  return compatibleEmailBody(body)
}
