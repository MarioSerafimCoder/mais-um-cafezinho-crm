import { isSafeEmailBody, byteLength } from '../../shared/safety'

export function ensureUnsubscribeLink(html: string) {
  if (/<a\b[^>]*href\s*=\s*["']\{\{\s*unsubscribe_url\s*\}\}["']/i.test(html)) return html
  const footer = '<p style="font-size:12px;color:#68645e">Você recebeu esta mensagem porque assinou o Mais um Cafezinho. <a href="{{ unsubscribe_url }}">Descadastrar-se</a>.</p>'
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${footer}</body>`)
  return `${html}${footer}`
}

export function validateDraftPayload(subject: string, html: string) {
  const cleanSubject = subject.trim()
  if (!cleanSubject) throw new Error('Dê um assunto para o rascunho.')
  if (cleanSubject.length > 200) throw new Error('O assunto pode ter até 200 caracteres.')
  if (byteLength(html) > 199_500) throw new Error('O HTML excede o limite de 200 KB.')
  if (!isSafeEmailBody(html)) {
    throw new Error('O conteúdo contém marcação ativa que não pode ser salva.')
  }
  return { subject: cleanSubject, body: `<!-- buttondown-editor-mode: plaintext -->${compatibleEmailBody(html)}`, status: 'draft' as const }
}

// Raw HTML inside Markdown mode avoids the lossy Fancy document conversion.
// Newsletter scaffolding remains controlled by Buttondown on the Free plan.
export function compatibleEmailBody(html: string) {
  if (!isSafeEmailBody(html)) throw new Error('HTML não permitido.')
  const fragment = ensureUnsubscribeLink(extractEmailBody(html)).replace(/<!--(?:\$|\/\$|html|head|body)-->/g, '').trim()
  // Markdown treats indented/blank lines as code. Keep a single physical HTML
  // line; character references preserve visible newlines, including in <pre>.
  let preDepth = 0
  return fragment.replace(/<!--[\s\S]*?-->|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g, token => {
    if (token.startsWith('<')) {
      if (/^<pre\b/i.test(token)) preDepth++
      if (/^<\/pre\b/i.test(token)) preDepth--
      return token.replace(/\r?\n\s*/g, ' ')
    }
    return preDepth ? token.replace(/\r/g, '&#13;').replace(/\n/g, '&#10;') : token.replace(/[\t\r\n ]+/g, ' ')
  })
}

export function extractEmailBody(html: string) {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)
  return match?.[1]?.trim() || html
}
