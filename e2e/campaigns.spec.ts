import { expect, test } from '@playwright/test'

const local = { id: 'local-list', subject: 'Edição local', content: '<p>Texto</p>', status: 'draft', templateId: null, revision: 1, updatedAt: '2026-10-28T10:00:00Z' }
test('campanhas preservam fontes independentes e acumulam páginas sem duplicar', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('mais-um-cafezinho:drafts:v1', JSON.stringify([value])), local)
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, cloud: true, demo: false } }))
  await page.route('**/api/drafts*', route => route.fulfill({ status: 503, json: { error: 'offline' } }))
  await page.route('**/api/emails?*', route => route.fulfill({ json: { results: [{ id: 'em_remote', subject: 'Publicação', status: 'sent', publish_date: '2026-10-28T12:00:00Z', absolute_url: 'https://example.com/edicao' }], next: route.request().url().endsWith('page=1') ? 'page2' : null, count: 1, previous: null } }))
  await page.goto('/campaigns')
  await expect(page.getByText('Edição local', { exact: true })).toBeVisible()
  await expect(page.getByText('Publicação', { exact: true })).toBeVisible()
  await expect(page.locator('.campaign-row').first()).toContainText('Publicação')
  await page.getByRole('button', { name: 'Carregar mais edições' }).click()
  await expect(page.locator('.campaign-row')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Continuar edição' })).toHaveAttribute('href', '/editor/local-list')
})
test('uma consulta lenta não oculta a edição local nem a nuvem', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('mais-um-cafezinho:drafts:v1', JSON.stringify([value])), local)
  await page.route('**/api/status', route => route.abort())
  await page.route('**/api/drafts', route => route.fulfill({ json: { results: [{ ...local, id: 'cloud-only', subject: 'Outra edição' }], next: null } }))
  await page.goto('/campaigns')
  await expect(page.getByText('Edição local', { exact: true })).toBeVisible()
  await expect(page.getByText('Outra edição', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tentar novamente' }).first()).toBeVisible()
})
