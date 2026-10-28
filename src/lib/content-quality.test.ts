import { expect, it } from 'vitest'
import { contentQuality } from './content-quality'
it('identifica problemas verificáveis sem prometer compatibilidade', () => {
  expect(contentQuality('<p>Olá</p><img src="https://example.com/a.png"><a href="https://example.com"></a>')).toHaveLength(3)
  expect(contentQuality('<h1>Olá</h1><img alt="Paisagem">')).toEqual([])
})
