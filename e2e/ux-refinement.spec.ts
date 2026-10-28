import { expect, test } from '@playwright/test'

test('home continua o rascunho local mesmo sem dados da plataforma', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mais-um-cafezinho:drafts:v1', JSON.stringify([{ id: 'local-continue', subject: 'Edição para continuar', content: '<p>Texto</p>', status: 'draft', templateId: null, revision: 1, updatedAt: '2026-10-28T14:00:00Z' }])))
  await page.route('**/api/status', route => route.abort())
  await page.goto('/')
  await expect(page.getByText('Edição para continuar')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar escrevendo' })).toHaveAttribute('href', '/editor/local-continue')
  await expect(page.getByRole('link', { name: 'Nova edição' }).first()).toHaveAttribute('href', '/editor/new')
  await page.screenshot({ path: 'logs/ux-dashboard-desktop.png' })
})

test('assunto longo e painel recolhível permanecem utilizáveis no notebook', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/editor/new?template=blog')
  const subject = page.getByLabel('Assunto da newsletter')
  const title = 'Uma edição de assunto longo que precisa continuar inteiramente legível enquanto o autor revisa e prepara o conteúdo editorial'
  await subject.fill(title)
  await expect(subject).toHaveValue(title)
  await expect.poll(() => subject.evaluate(element => element.scrollHeight >= element.clientHeight)).toBe(true)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: 'logs/ux-editor-header-notebook.png' })
  await page.getByRole('button', { name: 'Recolher ferramentas' }).click()
  await expect(page.locator('#editor-inspector')).toBeHidden()
  await expect(page.locator('.tiptap')).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar ferramentas' }).click()
  await expect(page.locator('#editor-inspector')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar campanha', exact: true }).first().click()
  await expect(page.locator('.campaign-delivery')).toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Enviar teste', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Atualizar destinatário e histórico' })).toBeVisible()
  await page.screenshot({ path: 'logs/ux-editor-notebook.png' })
})
