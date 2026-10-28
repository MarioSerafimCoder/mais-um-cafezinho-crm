import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SubscribersPage } from './SubscribersPage'

const mocks = vi.hoisted(() => ({ status: vi.fn(), subscribers: vi.fn(), addSubscriber: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: { status: mocks.status, subscribers: mocks.subscribers, addSubscriber: mocks.addSubscriber },
  requireConnection: (status: unknown) => status,
}))

afterEach(cleanup)
beforeEach(() => {
  mocks.status.mockReset().mockResolvedValue({ configured: true, connected: true, cloud: true, demo: false })
  mocks.subscribers.mockReset().mockResolvedValue({ results: [], count: 0, next: null, previous: null })
  mocks.addSubscriber.mockReset()
})

it('ativa o cadastro depois do clique e informa que não precisa confirmar por e-mail', async () => {
  mocks.addSubscriber.mockResolvedValue({ id: 'sub_new', email_address: 'marioserafim.da@gmail.com', type: 'regular', creation_date: '2026-10-28T12:00:00Z' })
  render(<SubscribersPage />)

  const email = await screen.findByRole('textbox', { name: 'E-mail do assinante' })
  expect(mocks.addSubscriber).not.toHaveBeenCalled()
  fireEvent.change(email, { target: { value: 'marioserafim.da@gmail.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e ativar' }))

  await waitFor(() => expect(mocks.addSubscriber).toHaveBeenCalledWith('marioserafim.da@gmail.com'))
  expect(await screen.findByRole('status')).toHaveTextContent(/sem confirmação por e-mail/)
})
