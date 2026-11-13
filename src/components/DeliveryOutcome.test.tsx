import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DeliveryOutcome } from './DeliveryOutcome'
const reconcile = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ api: { reconcileCampaignAttempt: reconcile } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('consulta uma publicação aceita e alerta sobre zero destinatários', async () => {
  reconcile.mockResolvedValue({ attempt: { provider_status: 'sent', publication_verified: true, delivery: { recipients: 0, deliveries: 0 } } })
  render(<DeliveryOutcome draftId="draft" attemptId="attempt" providerStatus="scheduled" />)
  expect(screen.getByRole('heading')).toHaveTextContent('Agendada')
  await screen.findByText('Nenhum destinatário recebeu o disparo')
  expect(reconcile).toHaveBeenCalledExactlyOnceWith('draft', 'attempt')
})

it('permite consultar novamente após falha de leitura sem oferecer reenvio', async () => {
  reconcile.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ attempt: { provider_status: 'sent', publication_verified: true, delivery: { recipients: 1, deliveries: 1 } } })
  render(<DeliveryOutcome draftId="draft" attemptId="attempt" providerStatus="in_flight" />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar resultado da entrega' }))
  await screen.findByText('Entregas registradas pelo provedor')
  expect(reconcile).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument()
})
