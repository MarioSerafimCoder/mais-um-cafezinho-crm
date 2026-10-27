import { buttondown, errorResponse, json, readLimitedBody } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export const onRequestPost = async ({ request, env }: Context) => {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > 8_500_000) return json({ error: 'A imagem deve ter até 8 MB.' }, 413)
  try {
    const bytes = await readLimitedBody(request, 8_500_000)
    const form = await new Request(request.url, { method: 'POST', headers: request.headers, body: bytes }).formData()
    const file = form.get('image')
    if (!(file instanceof File)) return json({ error: 'Envie um arquivo de imagem.' }, 400)
    if (file.size > 8_000_000) return json({ error: 'A imagem deve ter até 8 MB.' }, 413)
    if (!allowedTypes.has(file.type.toLowerCase())) return json({ error: 'Formato não aceito. Use PNG, JPEG, GIF ou WebP.' }, 415)
    if (!file.size) return json({ error: 'A imagem está vazia.' }, 400)
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const text = new TextDecoder().decode(signature)
    const formatMatches = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => signature[i] === b)
      : file.type === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
      : file.type === 'image/gif' ? /^GIF8[79]a/.test(text)
      : text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP'
    if (!formatMatches) return json({ error: 'O conteúdo do arquivo não corresponde ao formato informado.' }, 415)
    const outbound = new FormData()
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'newsletter-image'
    outbound.append('image', file, filename)
    const result = await buttondown({ request, env }, '/images', { method: 'POST', body: outbound }) as { image?: string }
    if (!result?.image || !/^https:\/\//i.test(result.image)) return json({ error: 'A Buttondown não retornou uma URL segura para a imagem.' }, 502)
    return json({ url: result.image }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
