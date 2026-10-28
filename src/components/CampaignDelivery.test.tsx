import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DraftRecord } from '../types'
import { CampaignDelivery } from './CampaignDelivery'

const mocks = vi.hoisted(() => ({ status: vi.fn(), delivery: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { campaignDeliveryStatus: mocks.status, subscribers: vi.fn(), campaignDelivery: mocks.delivery } }))

const draft: DraftRecord = {
  id: 'draft-ui-test', subject: 'Newsletter de teste', content: '<p>Conteúdo</p>', templateId: 'blog',
  status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z', buttondownId: 'em_test', cloudRevision: 1,
  revision: 1, syncedRevision: 1, cloudSavedRevision: 1,
}

afterEach(cleanup)
beforeEach(() => { mocks.status.mockReset(); mocks.delivery.mockReset() })

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

it('prepara a audiência e só envia depois da confirmação explícita', async () => {
  mocks.status.mockResolvedValue({ enabled: true, activeCount: 12 })
  mocks.delivery
    .mockResolvedValueOnce({ attemptId: 'attempt-campaign', audienceMode: 'all_active', recipientCount: 12, cloudRevision: 1, subject: draft.subject, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    .mockResolvedValueOnce({ accepted: true })
  render(<CampaignDelivery draft={draft} />)

  screen.getByText('Enviar campanha').closest('summary')?.click()
  const prepare = await screen.findByRole('button', { name: 'Revisar prévia e contagem' })
  expect(prepare).toBeEnabled()
  fireEvent.click(prepare)
  await waitFor(() => expect(document.querySelector('.campaign-delivery-preview')).toHaveTextContent('12'))
  expect(mocks.delivery).toHaveBeenCalledTimes(1)
  const send = screen.getByRole('button', { name: 'Confirmar e enviar agora' })
  expect(send).toBeDisabled()

  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo o envio imediato deste assunto para 12 contatos ativos/ }))
  fireEvent.click(send)
  await waitFor(() => expect(mocks.delivery).toHaveBeenCalledTimes(2))
  expect(mocks.delivery.mock.calls[1][0]).toMatchObject({ action: 'confirm', confirm: true, attemptId: 'attempt-campaign' })
  expect(await screen.findByText(/Buttondown aceitou o envio para 12 contatos/)).toBeInTheDocument()
  const result = screen.getByRole('status')
  expect(result).toHaveClass('campaign-feedback-success')
  expect(result).toHaveTextContent('A aceitação não confirma a entrega na caixa postal.')
})
