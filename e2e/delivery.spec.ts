import { expect, test } from '@playwright/test'

test('editor salva no D1, sincroniza e exige confirmação exata antes do teste (provedor simulado)', async ({ page, request }) => {
  let sends = 0
  let accepted = false
  let prepared = false
  let preparedRevision = 0
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, cloud: true, demo: false } }))
  await page.route('**/api/emails', async route => {
    const data = route.request().postDataJSON()
    await route.fulfill({ json: { id: 'em_e2e', ...data } })
  })
  await page.route('**/api/editorial-test*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, recipients: ['owner@example.com'], attempts: accepted ? [{ id: 'attempt-e2e', recipient: 'owner@example.com', cloud_revision: preparedRevision, state: 'accepted', created_at: new Date().toISOString() }] : prepared ? [{ id: 'attempt-e2e', recipient: 'owner@example.com', cloud_revision: preparedRevision, state: 'prepared', created_at: new Date().toISOString() }] : [] } })
    const data = route.request().postDataJSON()
    if (data.confirm) { sends++; accepted = true; return route.fulfill({ json: { accepted: true } }) }
    prepared = true
    preparedRevision = data.cloudRevision
    return route.fulfill({ json: { attemptId: 'attempt-e2e', recipient: 'owner@example.com', cloudRevision: data.cloudRevision } })
  })
  await page.goto('/editor/new?template=blog')
  await expect(page.locator('.tiptap')).toBeVisible()
  await page.getByLabel('Assunto da newsletter').fill('HOMOLOGAÇÃO — fluxo CRM')
  await page.getByRole('button', { name: 'Enviar teste', exact: true }).first().click()
  await page.getByRole('button', { name: 'Atualizar destinatário e histórico' }).click()
  const prepareTest = page.getByRole('button', { name: 'Preparar novo teste' })
  await expect(prepareTest).toBeEnabled()
  await prepareTest.click()
  await expect(page.locator('.test-confirmation-card .test-recipient-address')).toHaveText('owner@example.com')
  const id = page.url().split('/').pop()!
  const saved = await (await request.get(`/api/drafts/${id}`)).json()
  expect(saved.syncedBodyHash).toMatch(/^[a-f0-9]{64}$/)
  expect(saved.cloudSavedRevision).toBe(saved.revision)
  expect(saved.syncedRevision).toBe(saved.revision)
  await page.getByRole('button', { name: '3 · Envio' }).click()
  await page.getByRole('button', { name: 'Atualizar destinatário e histórico' }).click()
  await expect(page.locator('.test-confirmation-card .test-recipient-address')).toHaveText('owner@example.com')
  const send = page.getByRole('button', { name: 'Enviar este teste', exact: true })
  await expect(send).toBeDisabled(); expect(sends).toBe(0)
  await page.reload()
  await page.getByRole('button', { name: '3 · Envio' }).click()
  await page.getByRole('button', { name: 'Atualizar destinatário e histórico' }).click()
  await expect(page.locator('.test-confirmation-card .test-recipient-address')).toHaveText('owner@example.com')
  await expect(page.getByRole('button', { name: 'Enviar este teste', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Confirmo o envio de um teste para este endereço.' }).check()
  await send.click()
  await expect(page.getByText(/Teste aceito pela Buttondown/)).toBeVisible()
  await expect(page.getByLabel('Histórico de testes')).toContainText('recebimento pendente')
  expect(sends).toBe(1)
  await page.reload()
  await page.getByRole('button', { name: '3 · Envio' }).click()
  await page.getByRole('button', { name: 'Atualizar destinatário e histórico' }).click()
  await expect(page.getByLabel('Histórico de testes')).toContainText('Aceito pela Buttondown')
  expect(sends).toBe(1)
})

test('envio de campanhas e testes sem configuração falham fechados', async ({ request }) => {
  expect((await request.post('/api/campaign-delivery', { data: { action: 'confirm', confirm: true } })).status()).toBe(403)
  expect((await request.post('/api/editorial-test', { data: { confirm: true } })).status()).toBe(403)
})
