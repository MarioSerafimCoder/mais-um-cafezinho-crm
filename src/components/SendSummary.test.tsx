import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SendSummary } from './SendSummary'
import { deliveryDraftKey } from '../lib/delivery-preparation'
import { ApiError } from '../lib/api'
import type { DraftRecord } from '../types'

const mocks = vi.hoisted(() => ({ campaignDelivery: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { campaignDelivery: mocks.campaignDelivery }, ApiError: class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status } } }))
const draft: DraftRecord = { id: 'draft-summary', subject: 'Assunto local', content: '<p>Texto</p>', status: 'draft', templateId: null, updatedAt: '2026-10-29T10:00:00Z', revision: 4, cloudRevision: 4 }
const preparation = () => ({ attemptId: 'attempt-summary', draftId: draft.id, draftKey: deliveryDraftKey(draft), audienceMode: 'selected' as const, recipientCount: 1, cloudRevision: 4, subject: 'Assunto confirmado', expiresAt: new Date(Date.now() + 60000).toISOString(), selectedRecipients: [{ id: 'sub_one', email_address: 'leitor@example.com' }] })
afterEach(cleanup)
beforeEach(() => { mocks.campaignDelivery.mockReset() })
it('abre com resumo validado e só envia mediante confirmação explícita', async () => {
  mocks.campaignDelivery.mockResolvedValue({ accepted: true })
  const prepared = preparation()
  render(<SendSummary draft={draft} prepared={prepared} onBack={vi.fn()} />)
  expect(screen.getByText('Assunto confirmado')).toBeInTheDocument()
  expect(screen.getByText('leitor@example.com')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Preparar envio' })).not.toBeInTheDocument()
  expect(mocks.campaignDelivery).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e enviar campanha' }))
  fireEvent.click(screen.getByRole('button', { name: /Enviando campanha/ }))
  await screen.findByText('Campanha aceita pela Buttondown.')
  expect(mocks.campaignDelivery).toHaveBeenCalledExactlyOnceWith({ action: 'confirm', draftId: draft.id, cloudRevision: 4, attemptId: prepared.attemptId, confirm: true })
})
it('bloqueia a confirmação quando a edição muda', () => {
  const prepared = preparation()
  const view = render(<SendSummary draft={draft} prepared={prepared} onBack={vi.fn()} />)
  view.rerender(<SendSummary draft={{ ...draft, subject: 'Alterado' }} prepared={prepared} onBack={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Confirmar e enviar campanha' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('Os dados da edição mudaram')
})
it('volta à preparação quando expira, sem enviar', () => {
  const onBack = vi.fn()
  render(<SendSummary draft={draft} prepared={{ ...preparation(), expiresAt: new Date(Date.now() - 1000).toISOString() }} onBack={onBack} />)
  expect(screen.getByRole('button', { name: 'Confirmar e enviar campanha' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar à preparação' }))
  expect(onBack).toHaveBeenCalledOnce()
  expect(mocks.campaignDelivery).not.toHaveBeenCalled()
})
it('não oferece repetição quando o resultado é incerto', async () => {
  mocks.campaignDelivery.mockRejectedValue(new ApiError('timeout', 502))
  render(<SendSummary draft={draft} prepared={preparation()} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e enviar campanha' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resultado incerto'))
  expect(screen.queryByRole('button', { name: 'Confirmar e enviar campanha' })).not.toBeInTheDocument()
})
