import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

test('layout centralizado e contraste resistem às regras globais do provedor', async ({ page, browser }) => {
  await page.goto('/editor/new?template=blog')
  await expect(page.frameLocator('.gjs-frame').locator('h1')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar edição', exact: true }).click()
  const html = await page.getByTitle('Prévia da edição').getAttribute('srcdoc')
  expect(html).toBeTruthy()
  await mkdir('logs/email-redesign', { recursive: true })
  await writeFile('logs/email-redesign/fragment.html', html!)
  // Cascade rules observed in the delivered Gmail HTML and Modern stylesheet.
  const css = 'a{color:#0069ff!important}blockquote,blockquote p{color:#666!important;background-color:#f5f5f5!important}p{font-size:16px!important;line-height:24px!important}div,table,td,p,h1,h2{color:#000}'
  for (const width of [1440, 390]) {
    const preview = await browser.newPage({ viewport: { width, height: 1000 } })
    await preview.setContent(`<html><head><style>${css}</style></head><body style="margin:0;background:#fafafa"><table role="presentation" width="100%"><tr><td align="center"><div style="max-width:640px;margin:0 auto">${html}</div></td></tr></table></body></html>`)
    const frame = preview.locator('div[role="article"]')
    const bounds = await frame.boundingBox()
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(3)
    await expect(preview.getByRole('link', { name: /Continuar a leitura/ })).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(preview.locator('blockquote p')).toHaveCSS('color', 'rgb(37, 37, 37)')
    expect(await preview.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await preview.screenshot({ path: `logs/email-redesign/${width === 1440 ? 'desktop' : 'mobile'}.png`, fullPage: true })
    await preview.close()
  }
})
