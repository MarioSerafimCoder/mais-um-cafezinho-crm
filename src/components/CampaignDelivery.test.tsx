import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DraftRecord } from '../types'
import { CampaignDelivery } from './CampaignDelivery'

const mocks = vi.hoisted(() => ({ status: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { campaignDeliveryStatus: mocks.status, subscribers: vi.fn(), campaignDelivery: vi.fn() } }))

const draft: DraftRecord = {
  id: 'draft-ui-test', subject: 'Newsletter de teste', content: '<p>Conteúdo</p>', templateId: 'blog',
  status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z', buttondownId: 'em_test', cloudRevision: 1,
  revision: 1, syncedRevision: 1, cloudSavedRevision: 1,
}

afterEach(cleanup)
beforeEach(() => { mocks.status.mockReset() })

it('mostra o bloqueio de campanhas com clareza e não expõe controles de audiência', async () => {
  mocks.status.mockResolvedValue({ enabled: false, activeCount: 12 })
  render(<CampaignDelivery draft={draft} />)

  const disclosure = screen.getByText('Enviar campanha')
  disclosure.closest('summary')?.click()
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Campanhas bloqueadas'))

  expect(screen.getByText(/autorização explícita do proprietário/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Envio não autorizado' })).toBeDisabled()
  expect(screen.queryByRole('group', { name: 'Audiência' })).not.toBeInTheDocument()
  expect(screen.getByText('Nenhum assinante será contatado.')).toBeInTheDocument()
})
