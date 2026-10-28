import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const origin = process.argv[2] || 'http://127.0.0.1:5173'
const outputDirectory = 'docs/evidence/editorial-email'
const templates = ['blog', 'curadoria', 'especial']
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, colorScheme: 'light' },
  { name: 'mobile', width: 390, height: 844, colorScheme: 'light' },
  { name: 'dark-simulation', width: 390, height: 844, colorScheme: 'dark' },
]

await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const template of templates) {
    const context = await browser.newContext()
    const editor = await context.newPage()
    await editor.goto(`${origin}/editor/new?template=${template}`)
    await editor.locator('.tiptap').waitFor({ state: 'visible' })
    await editor.getByRole('button', { name: 'Prévia', exact: true }).click()
    const source = await editor.locator('iframe[title="Prévia da newsletter"]').getAttribute('srcdoc')
    if (!source) throw new Error(`A prévia do template ${template} não foi gerada.`)

    for (const viewport of viewports) {
      const renderPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: viewport.colorScheme })
      await renderPage.setContent(source, { waitUntil: 'load' })
      await renderPage.locator('h1').waitFor({ state: 'visible' })
      const dimensions = await renderPage.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, images: document.images.length }))
      if (dimensions.scroll > dimensions.client) throw new Error(`${template}/${viewport.name}: rolagem horizontal (${dimensions.scroll}px > ${dimensions.client}px).`)
      const path = `${outputDirectory}/${template}-${viewport.name}.png`
      await renderPage.screenshot({ path, fullPage: true })
      results.push({ template, viewport: viewport.name, path, ...dimensions })
      await renderPage.close()
    }
    await context.close()
  }
} finally {
  await browser.close()
}

for (const result of results) console.log(`${result.template} ${result.viewport}: ${result.client}px sem overflow; ${result.images} imagem(ns); ${result.path}`)
