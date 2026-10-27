import { buttondown, errorResponse, json } from '../_utils'
import type { AppEnv } from '../_utils'

type Context = { request: Request; env: AppEnv }
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export const onRequestPost = async ({ request, env }: Context) => {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > 8_500_000) return json({ error: 'A imagem deve ter até 8 MB.' }, 413)
  try {
    const form = await request.formData()
    const file = form.get('image')
    if (!(file instanceof File)) return json({ error: 'Envie um arquivo de imagem.' }, 400)
    if (file.size > 8_000_000) return json({ error: 'A imagem deve ter até 8 MB.' }, 413)
    if (!allowedTypes.has(file.type.toLowerCase())) return json({ error: 'Formato não aceito. Use PNG, JPEG, GIF ou WebP.' }, 415)
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
