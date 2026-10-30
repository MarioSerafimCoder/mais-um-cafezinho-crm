import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SendSummary } from './SendSummary'
import type { DraftRecord, Subscriber } from '../types'

const mocks = vi.hoisted(() => ({ campaignDelivery: vi.fn(), campaignDeliveryStatus: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: { campaignDelivery: mocks.campaignDelivery, campaignDeliveryStatus: mocks.campaignDeliveryStatus },
  ApiError: class ApiError extends Error { status = 502 },
}))

const draft: DraftRecord = {
  id: 'draft-summary-test', subject: 'Assunto local', content: '<p>Conteúdo</p>',
  document: { type: 'grapesjs', version: 3, format: 'mjml', styles: [], components: [] },
  templateId: 'blog', status: 'draft', updatedAt: '2026-10-29T10:00:00Z', buttondownId: 'em_test',
  cloudRevision: 4, revision: 4, syncedRevision: 4, cloudSavedRevision: 4,
}
const recipient: Subscriber = { id: 'sub_one', email_address: 'mario@example.com', type: 'regular' }
const audience = { mode: 'selected' as const, subscriberIds: [recipient.id] }
const prepared = { attemptId: 'attempt-summary', audienceMode: 'selected' as const, recipientCount: 1, cloudRevision: 4, subject: 'Assunto confirmado no servidor', expiresAt: new Date(Date.now() + 60_000).toISOString(), selectedRecipients: [{ id: recipient.id, email_address: recipient.email_address }] }
const onPrepare = vi.fn(async () => draft)

afterEach(cleanup)
beforeEach(() => { mocks.campaignDelivery.mockReset(); mocks.campaignDeliveryStatus.mockReset().mockResolvedValue({ enabled: true }); onPrepare.mockClear() })

function renderSummary() {
  return render(<SendSummary draft={draft} audience={audience} count={1} recipients={[recipient]} onPrepare={onPrepare} onBack={vi.fn()} onTest={vi.fn()} />)
}

it('prepara primeiro, exibe dados do servidor e só confirma em um segundo clique', async () => {
  mocks.campaignDelivery.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ accepted: true })
  renderSummary()

  fireEvent.click(await screen.findByRole('button', { name: 'Preparar envio' }))
  await waitFor(() => expect(mocks.campaignDelivery).toHaveBeenCalledTimes(1))
  expect(mocks.campaignDelivery.mock.calls[0][0]).toMatchObject({ action: 'prepare', draftId: draft.id, audience })
  expect(mocks.campaignDelivery.mock.calls[0][0]).not.toHaveProperty('confirm')
  expect((await screen.findAllByText('Assunto confirmado no servidor')).length).toBeGreaterThan(0)
  expect(screen.getByText('1', { selector: 'dd' })).toBeInTheDocument()
  expect(screen.getByText(recipient.email_address)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e enviar campanha' }))
  await waitFor(() => expect(mocks.campaignDelivery).toHaveBeenCalledTimes(2))
  expect(mocks.campaignDelivery.mock.calls[1][0]).toMatchObject({ action: 'confirm', attemptId: prepared.attemptId, confirm: true })
  expect(await screen.findByText('Campanha aceita pela Buttondown.')).toBeInTheDocument()
  expect(screen.queryByText(/chegou à caixa de entrada/i)).not.toBeInTheDocument()
})

it('não repete confirmação em dois cliques rápidos e invalida a preparação se o assunto mudar', async () => {
  let resolveConfirm: ((value: { accepted: boolean }) => void) | undefined
  mocks.campaignDelivery.mockResolvedValueOnce(prepared).mockImplementationOnce(() => new Promise(resolve => { resolveConfirm = resolve }))
  const view = renderSummary()
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar envio' }))
  await screen.findByRole('button', { name: 'Confirmar e enviar campanha' })
  const confirm = screen.getByRole('button', { name: 'Confirmar e enviar campanha' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(mocks.campaignDelivery).toHaveBeenCalledTimes(2))
  expect(mocks.campaignDelivery.mock.calls.filter(([payload]) => payload.action === 'confirm')).toHaveLength(1)
  resolveConfirm?.({ accepted: true })

  view.rerender(<SendSummary draft={{ ...draft, subject: 'Assunto alterado' }} audience={audience} count={1} recipients={[recipient]} onPrepare={onPrepare} onBack={vi.fn()} onTest={vi.fn()} />)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar e enviar campanha' })).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByText(/dados da edição mudaram/i)).toBeInTheDocument())
})

it('bloqueia uma preparação expirada sem chamar confirm', async () => {
  mocks.campaignDelivery.mockResolvedValueOnce({ ...prepared, expiresAt: new Date(Date.now() - 1_000).toISOString() })
  renderSummary()
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar envio' }))
  await screen.findByRole('button', { name: 'Confirmar e enviar campanha' })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e enviar campanha' }))
  await waitFor(() => expect(screen.getByText(/preparação expirou/i)).toBeInTheDocument())
  expect(mocks.campaignDelivery).toHaveBeenCalledTimes(1)
})

it('bloqueia preparação quando o proprietário desativou envios', async () => {
  mocks.campaignDeliveryStatus.mockResolvedValue({ enabled: false })
  renderSummary()
  await screen.findByText(/Campanhas bloqueadas pelo proprietário/)
  const prepare = screen.getByRole('button', { name: 'Preparar envio' })
  expect(prepare).toBeDisabled()
  fireEvent.click(prepare)
  expect(mocks.campaignDelivery).not.toHaveBeenCalled()
})
