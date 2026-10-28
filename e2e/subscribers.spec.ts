import { expect, test } from '@playwright/test'

test('cadastro manual ativa o assinante sem exigir confirmação por e-mail', async ({ page }) => {
  let createdEmail = ''
  let creationCount = 0
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, cloud: true, demo: false } }))
  await page.route('**/api/subscribers*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { email_address: string }
      createdEmail = body.email_address
      creationCount += 1
      return route.fulfill({ status: 201, json: { id: 'sub_e2e', email_address: createdEmail, type: 'regular', creation_date: new Date().toISOString() } })
    }
    return route.fulfill({ json: { results: createdEmail ? [{ id: 'sub_e2e', email_address: createdEmail, type: 'regular', creation_date: new Date().toISOString() }] : [], count: createdEmail ? 1 : 0, next: null, previous: null } })
  })

  await page.goto('/subscribers')
  await page.getByLabel('E-mail do assinante').fill('marioserafim.da@gmail.com')
  await page.getByRole('button', { name: 'Cadastrar e ativar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Assinante cadastrado e ativo' })).toContainText('sem confirmação por e-mail')
  await expect(page.getByRole('row').filter({ hasText: 'marioserafim.da@gmail.com' })).toContainText('Inscrito')
  expect(creationCount).toBe(1)
})

test('o botão Ativar transforma um cadastro pendente em assinante ativo', async ({ page }) => {
  let activated = false
  let updates = 0
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, cloud: true, demo: false } }))
  await page.route('**/api/subscribers*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { email_address: string }
      expect(body.email_address).toBe('marioserafim.da@gmail.com')
      updates += 1
      activated = true
      return route.fulfill({ status: 200, json: { id: 'sub_pending', email_address: body.email_address, type: 'regular', activatedExisting: true } })
    }
    return route.fulfill({ json: { results: [{ id: 'sub_pending', email_address: 'marioserafim.da@gmail.com', type: activated ? 'regular' : 'unactivated', creation_date: new Date().toISOString() }], count: 1, next: null, previous: null } })
  })

  await page.goto('/subscribers')
  await page.getByRole('button', { name: 'Ativar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Assinante ativado sem confirmação por e-mail' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'marioserafim.da@gmail.com' })).toContainText('Inscrito')
  expect(updates).toBe(1)
})
