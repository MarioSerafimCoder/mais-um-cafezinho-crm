export const byteLength = (text: string) => new TextEncoder().encode(text).length

export function safeUrl(value: string, image = false) {
  if (!image && /^\{\{\s*unsubscribe_url\s*\}\}$/.test(value)) return true
  const clean = Array.from(value).filter((char) => char.charCodeAt(0) > 32 && char.charCodeAt(0) !== 127).join('')
  try {
    const url = new URL(clean)
    return image ? url.protocol === 'https:' : ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)
  } catch { return !image && clean.startsWith('#') }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
