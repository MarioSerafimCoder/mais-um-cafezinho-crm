export const onRequest = ({ request, next }: { request: Request; next: () => Promise<Response> }) => new URL(request.url).pathname.startsWith('/api/')
  ? Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
  : next()
