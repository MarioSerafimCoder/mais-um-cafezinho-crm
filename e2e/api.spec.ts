import { expect, test } from '@playwright/test'

test('D1 local aplica controle de versão e rejeita overwrite concorrente', async ({ request }) => {
  const id = `test-${crypto.randomUUID()}`
  const draft = { id, subject: 'Original', content: '<p>Legado</p>', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Documento' }] }] }, status: 'draft', templateId: null, updatedAt: new Date().toISOString(), cloudRevision: 0 }
  const initial = await request.put(`/api/drafts/${id}`, { data: draft })
  expect(initial.status()).toBe(200)
  const saved = await initial.json()
  expect(saved.cloudRevision).toBe(1)
  expect((await request.put(`/api/drafts/${id}`, { data: { ...draft, subject: 'Não sobrescrever' } })).status()).toBe(409)
  expect((await (await request.get(`/api/drafts/${id}`)).json()).subject).toBe('Original')
  expect((await request.put(`/api/drafts/${id}`, { data: { ...saved, subject: 'Atualizado' } })).status()).toBe(200)
  expect((await (await request.get(`/api/drafts/${id}`)).json()).cloudRevision).toBe(2)
})

test('origem externa, estrutura perigosa e endpoints de envio são bloqueados', async ({ request }) => {
  expect((await request.put('/api/settings', { headers: { Origin: 'https://outside.example' }, data: {} })).status()).toBe(403)
  expect((await request.post('/api/emails/em_test/publish', { data: {} })).status()).toBe(404)
  const data = { id: 'test-invalid', subject: 'Perigoso', content: '<p>Oi</p>', document: { type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }] }, status: 'draft' }
  expect((await request.put('/api/drafts/test-invalid', { data })).status()).toBe(400)
})

test('configurações editoriais usam versão e persistem no D1 local', async ({ request }) => {
  const old = await request.get('/api/settings')
  const previous = old.status() === 200 ? await old.json() : { cloudRevision: 0 }
  const settings = { newsletterName: 'Mais um Cafezinho', senderName: 'Autor de teste', senderEmail: '', blogUrl: 'https://example.com/blog', portfolioUrl: 'https://example.com', instagramUrl: '', linkedinUrl: '', theme: 'light', cloudRevision: previous.cloudRevision }
  expect((await request.put('/api/settings', { data: settings })).status()).toBe(200)
  expect((await request.put('/api/settings', { data: settings })).status()).toBe(409)
  expect((await (await request.get('/api/settings')).json()).senderName).toBe('Autor de teste')
})
