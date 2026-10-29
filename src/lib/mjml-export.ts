import mjml from 'mjml-browser'
import { isGrapesDocument, type GrapesDocument } from '../../shared/grapes-document'
import { isSafeEmailBody, byteLength } from '../../shared/safety'
import { componentMarkup } from './editor-migration'
import { compatibleEmailBody } from './email'

export function exportMjml(doc: GrapesDocument) {
  if (!isGrapesDocument(doc)) throw new Error('O documento contém um componente ou propriedade não permitidos.')
  return doc.components.map(componentMarkup).join('')
}

export function compileEmail(doc: GrapesDocument) {
  const source = exportMjml(doc)
  const result = mjml(source, { validationLevel: 'strict', fonts: {}, keepComments: false })
  if (result.errors.length) throw new Error(`Não foi possível exportar: ${result.errors.map(e => e.message).join('; ')}`)
  const dom = new DOMParser().parseFromString(result.html, 'text/html')
  // Buttondown accepts only a body fragment. MJML's desktop column widths normally
  // live in head media queries: inline proportional widths, so removing head never
  // turns a two-column layout into two full-width rows. Mobile keeps fluid columns.
  for (const element of dom.body.querySelectorAll<HTMLElement>('[class]')) {
    const column = /mj-column-per-([\d-]+)/.exec(element.className)
    if (column) { const width = `${column[1].replace('-', '.')}%`; element.style.width = width; element.style.maxWidth = width }
    const pixelColumn = /mj-column-px-(\d+)/.exec(element.className)
    if (pixelColumn) throw new Error('Use larguras percentuais nas colunas para manter a compatibilidade com a newsletter.')
  }
  // Standard MJML reset rules are applied directly; no font fetches or head CSS.
  for (const table of dom.body.querySelectorAll<HTMLElement>('table')) { table.style.borderCollapse = 'collapse'; table.setAttribute('role', 'presentation') }
  for (const img of dom.body.querySelectorAll<HTMLElement>('img')) { img.style.maxWidth = '100%'; img.style.border = '0'; img.style.display = 'block' }
  const body = `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tbody><tr><td align="center">${dom.body.innerHTML}</td></tr></tbody></table>`
  if (byteLength(body) > 199_500 || !isSafeEmailBody(body)) throw new Error('O HTML exportado é inseguro ou ultrapassa 200 KB.')
  return compatibleEmailBody(body)
}
