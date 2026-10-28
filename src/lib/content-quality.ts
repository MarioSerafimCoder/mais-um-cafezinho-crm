export function contentQuality(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const warnings: string[] = []
  if (!doc.querySelector('h1,h2')) warnings.push('Sem título no conteúdo.')
  const missingAlt = [...doc.querySelectorAll('img')].filter(image => !image.getAttribute('alt')?.trim()).length
  if (missingAlt) warnings.push(`${missingAlt} imagem(ns) sem texto alternativo.`)
  const emptyLinks = [...doc.querySelectorAll('a')].filter(link => !link.textContent?.trim() && !link.querySelector('img[alt]')).length
  if (emptyLinks) warnings.push(`${emptyLinks} link(s) sem descrição.`)
  if (!doc.querySelector('a[href*="unsubscribe_url"]')) warnings.push('Link de descadastro não encontrado no HTML.')
  if (new TextEncoder().encode(html).length > 100000) warnings.push('HTML acima de 100 KB: conferir corte da mensagem no cliente.')
  return warnings
}
