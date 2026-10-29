import { test, expect } from '@playwright/test'
for (const template of ['blog', 'curadoria', 'especial', 'carta', 'bastidores', 'convite']) {
  test('compilação real e fragmento compatível: ' + template, async ({ page }) => {
    await page.goto('/editor/new?template=' + template)
    await expect(page.frameLocator('.gjs-frame').locator('h1')).toBeVisible()
    await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
    const frame = page.frameLocator('iframe[title="Prévia da edição"]')
    await expect(frame.locator('h1')).toBeVisible()
    await expect(frame.getByText('Mais um Cafezinho', { exact: true })).toHaveCount(1)
    await expect(frame.locator('table[role="presentation"]').first()).toHaveAttribute('width', '100%')
    await expect(frame.getByRole('link', { name: /Descadastrar/ })).toHaveCount(0)
    const html = await page.getByTitle('Prévia da edição').getAttribute('srcdoc')
    expect(html).not.toMatch(/<head|<script|<style|<mj-/i)
    expect(html).not.toContain('\n')
    await page.getByRole('button', { name: 'Mobile', exact: true }).click()
    await expect(page.getByTitle('Prévia da edição')).toHaveCSS('width', '375px')
  })
}
