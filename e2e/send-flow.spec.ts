import { expect, test } from '@playwright/test'

test('etapas de prévia, destinatários e resumo da campanha', async ({ page }) => {
  await page.route('**/api/subscribers?*', route => route.fulfill({ json: { count: 2, results: [{ id: 'sub_one', email_address: 'mario@example.com', type: 'regular' }, { id: 'sub_two', email_address: 'leitor@example.com', type: 'premium' }], next: null, previous: null } }))
  let remote: Record<string, unknown> = {}
  let preparedCalls = 0
  let confirmedCalls = 0
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, cloud: true, demo: false } }))
  await page.route('**/api/emails**', async route => {
    if (['POST', 'PATCH'].includes(route.request().method())) remote = { ...route.request().postDataJSON(), id: 'em_test' }
    await route.fulfill({ json: remote })
  })
  await page.route('**/api/campaign-delivery', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } })
    const input = route.request().postDataJSON()
    if (input.action === 'confirm') { confirmedCalls++; return route.fulfill({ json: { accepted: true } }) }
    preparedCalls++
    await route.fulfill({ json: { attemptId: 'attempt-e2e', audienceMode: input.audience.mode, recipientCount: 2, cloudRevision: input.cloudRevision, subject: remote.subject, expiresAt: new Date(Date.now() + 60000).toISOString() } })
  })
  await page.goto('/editor/new?template=blog')
  const canvas = page.frameLocator('.gjs-frame')
  await expect(canvas.locator('h1')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar para envio', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar para envio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Prepare o envio', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Destinatários', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar email de teste', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Enviar email de teste', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Envio de email de teste' })).toBeVisible()
  await page.getByLabel('E-mail para envio do teste').fill('mario@example.com, leitor@example.com')
  await expect(page.getByRole('button', { name: 'Enviar o teste', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()

  for (const title of ['Destinatários', 'Assunto e remetente', 'Conteúdo e prévia']) await expect(page.getByRole('img', { name: `${title}: pronto`, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Verificar / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preparar envio e ver resumo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Preparar envio e ver resumo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Resumo e envio', exact: true })).toBeVisible()
  expect(preparedCalls).toBe(1)
  expect(confirmedCalls).toBe(0)
  await expect(page.getByRole('button', { name: 'Preparar envio', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirmar e enviar campanha' }).click()
  await expect(page.getByText('Campanha aceita pela Buttondown.', { exact: true })).toBeVisible()
  expect(confirmedCalls).toBe(1)
})

test('envio desativado mantém a edição na etapa de preparação', async ({ page }) => {
  await page.route('**/api/subscribers?*', route => route.fulfill({ json: { count: 1, results: [], next: null, previous: null } }))
  await page.goto('/editor/new?template=blog')
  await expect(page.frameLocator('.gjs-frame').locator('h1')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar para envio', exact: true }).click()
  await page.getByRole('button', { name: 'Preparar envio e ver resumo', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('desativado')
  await expect(page.getByRole('heading', { name: 'Prepare o envio', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '4 · Resumo e envio', exact: true })).toBeDisabled()
})
