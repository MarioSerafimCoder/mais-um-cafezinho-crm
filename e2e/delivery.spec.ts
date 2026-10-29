import { expect, test } from '@playwright/test'
test('editor trabalha só com rascunhos e não oferece disparo', async ({ page }) => {
  let calls = 0
  await page.route(/api\/(campaign-delivery|editorial-test)/, route => { calls++; return route.abort() })
  await page.goto('/editor/new?template=blog')
  await expect(page.frameLocator('.gjs-frame').locator('h1')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
  await expect(page.getByTitle('Prévia da edição')).toBeVisible()
  await expect(page.getByRole('button', { name: /Enviar|Disparar|Publicar/ })).toHaveCount(0)
  expect(calls).toBe(0)
})
test('envio de campanhas e testes sem configuração falham fechados', async ({ request }) => {
  expect((await request.post('/api/campaign-delivery', { data: { action: 'confirm', confirm: true } })).status()).toBe(403)
  expect((await request.post('/api/editorial-test', { data: { confirm: true } })).status()).toBe(403)
})
