import { escapeHtml } from '../../shared/urls'
import { isSafeEmailBody } from '../../shared/safety'

export type EmailLayoutOptions = {
  newsletterName: string
  editionLabel: string
  editionDate: string
  buttondownTemplate?: 'classic' | 'modern'
}

function formatEditionDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return ''
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function addDefaultStyle(element: HTMLElement, values: Record<string, string>) {
  for (const [property, value] of Object.entries(values)) if (!element.style.getPropertyValue(property)) element.style.setProperty(property, value)
}

function styleEditorialContent(content: string) {
  if (typeof DOMParser === 'undefined') throw new Error('A prévia de e-mail exige um navegador compatível.')
  const document = new DOMParser().parseFromString(content, 'text/html')
  for (const element of [...document.body.querySelectorAll<HTMLElement>('*')]) {
    const tag = element.tagName.toLowerCase()
    if (tag === 'p') addDefaultStyle(element, { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': '16px', 'line-height': '1.7', color: '#252525', margin: '0 0 18px' })
    if (tag === 'h1') addDefaultStyle(element, { 'font-family': 'Georgia, "Times New Roman", serif', 'font-size': '40px', 'font-weight': '400', 'line-height': '1.08', 'letter-spacing': '-1.1px', color: '#171717', margin: '0 0 20px' })
    if (tag === 'h2') addDefaultStyle(element, { 'font-family': 'Georgia, "Times New Roman", serif', 'font-size': '25px', 'font-weight': '400', 'line-height': '1.2', color: '#171717', margin: '30px 0 12px' })
    if (tag === 'h3') addDefaultStyle(element, { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': '16px', 'line-height': '1.4', color: '#171717', margin: '24px 0 8px' })
    if (tag === 'a') addDefaultStyle(element, { color: '#b52930', 'text-decoration': 'underline' })
    if (tag === 'blockquote') addDefaultStyle(element, { 'background-color': '#f6f2ef', 'border-left': '3px solid #b52930', margin: '26px 0', padding: '14px 18px' })
    if (tag === 'img') addDefaultStyle(element, { display: 'block', width: 'auto', 'max-width': '100%', height: 'auto', border: '0', margin: '22px 0' })
    if (tag === 'ul' || tag === 'ol') addDefaultStyle(element, { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': '16px', 'line-height': '1.65', color: '#252525', margin: '0 0 20px', 'padding-left': '22px' })
    if (tag === 'hr') addDefaultStyle(element, { border: '0', 'border-top': '1px solid #dedbd7', margin: '28px 0' })
    if (tag === 'table') addDefaultStyle(element, { 'max-width': '100%', 'border-collapse': 'collapse' })
  }
  return document.body.innerHTML
}

/** Adds the CRM's email-safe, table-based frame around the JSON-backed editor HTML. */
export function buildEditorialEmail(content: string, options: EmailLayoutOptions) {
  if (!isSafeEmailBody(content)) throw new Error('O conteúdo contém marcação não permitida ou excede o limite.')
  const body = styleEditorialContent(content)
  const newsletterName = escapeHtml(options.newsletterName)
  const edition = [options.editionLabel, formatEditionDate(options.editionDate)].filter(Boolean).map(escapeHtml).join(' &nbsp;·&nbsp; ')
  const masthead = options.buttondownTemplate === 'modern' ? '' : `<tr><td bgcolor="#171717" style="background-color:#171717;padding:28px 30px 24px"><p style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.1;color:#ffffff;margin:0 0 15px">${newsletterName}</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase;color:#e8dcd7;margin:0">${edition || 'UMA PUBLICAÇÃO EDITORIAL'}</p><div style="height:3px;width:34px;background-color:#c7353d;margin-top:18px;font-size:1px;line-height:1px">&nbsp;</div></td></tr>`
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f0ed" style="width:100%;border-collapse:collapse;background-color:#f2f0ed;margin:0;padding:0"><tbody><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;margin:0 auto"><tbody>${masthead}<tr><td style="padding:34px 30px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#252525">${body}</td></tr></tbody></table></td></tr></tbody></table>`
  if (!isSafeEmailBody(html)) throw new Error('Não foi possível compor um HTML de e-mail seguro.')
  return html
}

export function emailPreviewDocument(content: string, options: EmailLayoutOptions) {
  const body = buildEditorialEmail(content, options)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(options.newsletterName)}</title></head><body style="margin:0;padding:0;background:#f2f0ed">${body}</body></html>`
}
