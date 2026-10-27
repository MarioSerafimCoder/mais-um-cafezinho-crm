export function ensureUnsubscribeLink(html: string) {
  if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) return html
  const footer = '<p style="font-size:12px;color:#68645e">Você recebeu esta mensagem porque assinou o Mais um Cafezinho. <a href="{{ unsubscribe_url }}">Descadastrar-se</a>.</p>'
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${footer}</body>`)
  return `${html}${footer}`
}

export function validateDraftPayload(subject: string, html: string) {
  const cleanSubject = subject.trim()
  if (!cleanSubject) throw new Error('Dê um assunto para o rascunho.')
  if (cleanSubject.length > 200) throw new Error('O assunto pode ter até 200 caracteres.')
  if (html.length > 200_000) throw new Error('O HTML excede o limite de 200 KB.')
  if (/<\s*(script|iframe|object|embed)\b/i.test(html) || /\s(?:href|src)\s*=\s*["']?\s*javascript:/i.test(html)) {
    throw new Error('O conteúdo contém marcação ativa que não pode ser salva.')
  }
  return { subject: cleanSubject, body: `<!-- buttondown-editor-mode: fancy -->${ensureUnsubscribeLink(html)}`, status: 'draft' as const }
}

export function extractEmailBody(html: string) {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)
  return match?.[1]?.trim() || html
}
