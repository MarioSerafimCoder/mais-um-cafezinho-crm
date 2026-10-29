import { expect, test } from '@playwright/test'

test('etapas de prévia, destinatários e resumo da campanha', async ({ page }) => {
  await page.route('**/api/subscribers?*', route => route.fulfill({ json: { count: 2, results: [{ id: 'sub_one', email_address: 'mario@example.com', type: 'regular' }, { id: 'sub_two', email_address: 'leitor@example.com', type: 'premium' }], next: null, previous: null } }))
  await page.goto('/editor/new?template=blog')
  const canvas = page.frameLocator('.gjs-frame')
  await expect(canvas.locator('h1')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar para envio', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar para envio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Revise o envio', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Destinatários', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar email de teste', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Enviar email de teste', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Envio de email de teste' })).toBeVisible()
  await page.getByLabel('E-mail para envio do teste').fill('mario@example.com, leitor@example.com')
  await expect(page.getByRole('button', { name: 'Enviar o teste', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()

  for (const label of ['Verificar Destinatários', 'Verificar Assunto e remetente', 'Verificar Conteúdo e prévia']) await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('button', { name: 'Avançar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Resumo', exact: true })).toBeVisible()
  await expect(page.getByText('O resumo exibirá assunto, audiência, quantidade e seleção somente depois da validação do backend.', { exact: true })).toBeVisible()
  await expect(page.getByText('Campanhas bloqueadas pelo proprietário.', { exact: false })).toBeVisible()
})
