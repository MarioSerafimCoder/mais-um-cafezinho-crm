import { expect, test } from '@playwright/test'

test('cadastro manual cria assinante pendente e aguarda confirmação', async ({ page }) => {
  let createdEmail = ''
  let creationCount = 0
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, cloud: true, demo: false } }))
  await page.route('**/api/subscribers*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { email_address: string }
      createdEmail = body.email_address
      creationCount += 1
      return route.fulfill({ status: 201, json: { id: 'sub_e2e', email_address: createdEmail, type: 'unactivated', creation_date: new Date().toISOString() } })
    }
    return route.fulfill({ json: { results: createdEmail ? [{ id: 'sub_e2e', email_address: createdEmail, type: 'unactivated', creation_date: new Date().toISOString() }] : [], count: createdEmail ? 1 : 0, next: null, previous: null } })
  })

  await page.goto('/subscribers')
  await page.getByLabel('E-mail do assinante').fill('marioserafim.da@gmail.com')
  await page.getByRole('button', { name: 'Cadastrar assinante' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cadastro criado.' })).toContainText('ficará pendente até a confirmação')
  await expect(page.getByRole('cell').filter({ hasText: 'marioserafim.da@gmail.com' })).toBeVisible()
  expect(creationCount).toBe(1)
})
