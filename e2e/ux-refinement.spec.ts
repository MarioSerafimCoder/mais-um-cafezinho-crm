import { expect, test } from '@playwright/test'
test('visão geral retoma o rascunho local', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mais-um-cafezinho:drafts:v1', JSON.stringify([{ id: 'local-continue', subject: 'Edição para continuar', content: '<p>Texto</p>', status: 'draft', templateId: null, revision: 1, updatedAt: '2026-10-28T14:00:00Z' }])))
  await page.route('**/api/status', route => route.abort())
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Continuar escrevendo' })).toHaveAttribute('href', '/editor/local-continue')
})
test('visão geral exibe métricas reais e ações da campanha', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, demo: false, cloud: true } }))
  await page.route('**/api/dashboard', route => route.fulfill({ json: {
    subscribers: 177,
    newSubscribers: 4,
    sentCampaigns: 1,
    drafts: 0,
    scheduled: 0,
    recent: [{ id: 'em_metrics', subject: 'Uma edição com métricas', status: 'sent', publish_date: '2026-10-26T09:00:00Z', absolute_url: 'https://buttondown.com/example', analytics: { recipients: 177, deliveries: 177, opens: 0, clicks: 0, temporary_failures: 1, permanent_failures: 0, unsubscriptions: 0, complaints: 0, open_rate: 0.6136, click_rate: 0.017, temporary_failure_rate: 0.0056, complaint_rate: 0 } }],
    upcoming: [],
    demo: false,
  } }))
  await page.goto('/')
  await expect(page.getByRole('columnheader', { name: 'ABERTURA' })).toBeVisible()
  await expect(page.getByText('61,36%')).toBeVisible()
  await page.getByRole('button', { name: 'Ações para Uma edição com métricas' }).click()
  await expect(page.getByText('Visualizar email', { exact: true })).toBeVisible()
  await expect(page.getByText('Estatísticas', { exact: true })).toBeVisible()
  await expect(page.getByText('Duplicar', { exact: true })).toBeVisible()
  await expect(page.getByText('Exportar modelo', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Estatísticas' }).click()
  await expect(page.getByRole('dialog', { name: 'Uma edição com métricas' })).toBeVisible()
})

test('visão geral oculta métricas e ações de analytics indisponíveis', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { configured: true, connected: true, demo: false, cloud: true } }))
  await page.route('**/api/dashboard', route => route.fulfill({ json: { subscribers: 12, newSubscribers: 1, sentCampaigns: 1, drafts: 0, scheduled: 0, recent: [{ id: 'em_no_analytics', subject: 'Sem analytics', status: 'sent', publish_date: '2026-10-26T09:00:00Z', absolute_url: 'https://buttondown.com/example', analytics: null }], upcoming: [], demo: false } }))
  await page.goto('/')
  await expect(page.getByRole('columnheader', { name: 'DATA DE ENVIO' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'ABERTURA' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ações para Sem analytics' }).click()
  await expect(page.getByText('Estatísticas', { exact: true })).toHaveCount(0)
})

test('três painéis e prévia utilizáveis em desktop e notebook', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/editor/new?template=blog')
  await expect(page.frameLocator('.gjs-frame').locator('h1')).toBeVisible()
  await page.screenshot({ path: 'logs/grapes-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.getByRole('heading', { name: 'Blocos', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Propriedades', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: 'logs/grapes-notebook.png', fullPage: true })
  await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
  await expect(page.getByTitle('Prévia da edição')).toBeVisible()
  await expect.poll(() => page.frameLocator('iframe[title="Prévia da edição"]').locator('html').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})
