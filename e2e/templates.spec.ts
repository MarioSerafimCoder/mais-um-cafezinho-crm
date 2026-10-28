import { test, expect } from '@playwright/test'
for (const template of ['blog', 'curadoria', 'especial']) {
  test(`HOMOLOGAÇÃO NÃO ENVIAR: exportação ${template}`, async ({ page }) => {
    await page.goto(`/editor/new?template=${template}`)
    await expect(page.locator('.tiptap')).toBeVisible()
    await page.getByLabel('Assunto da newsletter').fill(`HOMOLOGAÇÃO NÃO ENVIAR ${template}`)
    await page.getByRole('button', { name: 'Prévia', exact: true }).click()
    const frame = page.frameLocator('iframe[title="Prévia da newsletter"]')
    await expect(frame.locator('h1')).toBeVisible()
    await expect(frame.getByRole('link', { name: /Descadastrar/ })).toHaveCount(1)
    await page.getByLabel('Fonte da prévia').selectOption('compatible')
    await expect(frame.locator('h1')).toBeVisible()
    await expect(frame.getByRole('link', { name: /Descadastrar/ })).toHaveCount(1)
    const html = await page.locator('iframe').getAttribute('srcdoc')
    expect(html).not.toMatch(/<head|<script|<!--\/?\$-->/i)
    expect(html).not.toContain('\n')
    await expect(page.getByText(/Resultado processado indisponível/)).toBeVisible()
  })
}
