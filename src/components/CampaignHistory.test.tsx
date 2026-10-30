import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CampaignHistory } from './CampaignHistory'
const mocks = vi.hoisted(() => ({ history: vi.fn(), reconcile: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { campaignAttempts: mocks.history, reconcileCampaignAttempt: mocks.reconcile } }))
afterEach(cleanup)
it('consulta tentativa incerta e exibe o estado reconciliado sem enviar', async () => {
  const attempt = { id: 'attempt', draft_id: 'draft', subject: 'Newsletter', state: 'attempted', created_at: '2026-10-30T12:00:00Z' }
  mocks.history.mockResolvedValue({ attempts: [attempt] })
  mocks.reconcile.mockResolvedValue({ attempt: { ...attempt, state: 'accepted', publication_hash: 'hash', provider_status: 'in_flight' } })
  render(<CampaignHistory draftId="draft" />)
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar histórico de envios' }))
  await screen.findByText(/Resultado incerto/)
  fireEvent.click(screen.getByRole('button', { name: 'Consultar estado na Buttondown' }))
  await screen.findByText(/Publicação confirmada/)
  expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith('draft', 'attempt')
  expect(screen.getByText(/in_flight/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /enviar campanha/i })).not.toBeInTheDocument()
})
