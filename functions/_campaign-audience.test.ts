// @vitest-environment node
import { expect, it } from 'vitest'
import { selectedAudienceFilters } from './_campaign-audience'
it('recusa audiência vazia, inativa e duplicada em vez de produzir filtros vazios', () => {
  const recipient = { id: 'sub_one', email_address: 'chosen@example.com', type: 'regular' }
  expect(() => selectedAudienceFilters([])).toThrow()
  expect(() => selectedAudienceFilters([{ ...recipient, type: 'unsubscribed' }])).toThrow()
  expect(() => selectedAudienceFilters([recipient, { ...recipient, id: 'sub_two' }])).toThrow()
})
