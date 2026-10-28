import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SubscribersPage } from './SubscribersPage'

const mocks = vi.hoisted(() => ({ status: vi.fn(), subscribers: vi.fn(), createSubscriber: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: { status: mocks.status, subscribers: mocks.subscribers, createSubscriber: mocks.createSubscriber },
  requireConnection: (status: unknown) => status,
}))

afterEach(cleanup)
beforeEach(() => {
  mocks.status.mockReset().mockResolvedValue({ configured: true, connected: true, cloud: true, demo: false })
  mocks.subscribers.mockReset().mockResolvedValue({ results: [], count: 0, next: null, previous: null })
  mocks.createSubscriber.mockReset()
})

it('cadastra apenas após envio manual e mostra que a confirmação está pendente', async () => {
  mocks.createSubscriber.mockResolvedValue({ id: 'sub_new', email_address: 'marioserafim.da@gmail.com', type: 'unactivated', creation_date: '2026-10-28T12:00:00Z' })
  render(<SubscribersPage />)

  const email = await screen.findByRole('textbox', { name: 'E-mail do assinante' })
  expect(mocks.createSubscriber).not.toHaveBeenCalled()
  fireEvent.change(email, { target: { value: 'marioserafim.da@gmail.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar assinante' }))

  await waitFor(() => expect(mocks.createSubscriber).toHaveBeenCalledWith('marioserafim.da@gmail.com'))
  expect(await screen.findByRole('status')).toHaveTextContent(/ficará pendente até a confirmação/)
})
