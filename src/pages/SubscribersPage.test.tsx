import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SubscribersPage } from './SubscribersPage'

const mocks = vi.hoisted(() => ({ status: vi.fn(), subscribers: vi.fn(), addSubscriber: vi.fn(), deleteSubscriber: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: { status: mocks.status, subscribers: mocks.subscribers, addSubscriber: mocks.addSubscriber, deleteSubscriber: mocks.deleteSubscriber },
  requireConnection: (status: unknown) => status,
}))

afterEach(cleanup)
beforeEach(() => {
  mocks.status.mockReset().mockResolvedValue({ configured: true, connected: true, cloud: true, demo: false })
  mocks.subscribers.mockReset().mockResolvedValue({ results: [], count: 0, next: null, previous: null })
  mocks.addSubscriber.mockReset()
  mocks.deleteSubscriber.mockReset()
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

it('abre a confirmação antes de executar a exclusão e cancela sem chamar a API', async () => {
  mocks.subscribers.mockResolvedValue({ results: [{ id: 'sub_delete', email_address: 'leitor@example.com', type: 'regular' }], count: 1, next: null, previous: null })
  render(<SubscribersPage />)

  fireEvent.click(await screen.findByRole('button', { name: 'Excluir leitor@example.com' }))
  expect(mocks.deleteSubscriber).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Excluir contato definitivamente?' })).toBeVisible()
  const input = screen.getByRole('textbox', { name: 'Digite o e-mail para confirmar' })
  const confirm = screen.getByRole('button', { name: 'Excluir definitivamente' })
  fireEvent.change(input, { target: { value: 'outro@example.com' } })
  expect(confirm).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog', { name: 'Excluir contato definitivamente?' })).not.toBeInTheDocument()
  expect(mocks.deleteSubscriber).not.toHaveBeenCalled()
})

it('confirma o e-mail exato e atualiza a lista somente após a exclusão', async () => {
  mocks.subscribers.mockResolvedValue({ results: [{ id: 'sub_delete', email_address: 'leitor@example.com', type: 'regular' }], count: 1, next: null, previous: null })
  mocks.deleteSubscriber.mockResolvedValue({ deleted: true })
  render(<SubscribersPage />)

  fireEvent.click(await screen.findByRole('button', { name: 'Excluir leitor@example.com' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Digite o e-mail para confirmar' }), { target: { value: 'leitor@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }))
  await waitFor(() => expect(mocks.deleteSubscriber).toHaveBeenCalledWith('sub_delete', 'leitor@example.com'))
  expect(await screen.findByRole('status')).toHaveTextContent('Contato excluído da base: leitor@example.com.')
})

it('mantém o assinante e o modal aberto quando a exclusão falha', async () => {
  mocks.subscribers.mockResolvedValue({ results: [{ id: 'sub_delete', email_address: 'leitor@example.com', type: 'regular' }], count: 1, next: null, previous: null })
  mocks.deleteSubscriber.mockRejectedValue(new Error('Buttondown indisponível'))
  render(<SubscribersPage />)

  fireEvent.click(await screen.findByRole('button', { name: 'Excluir leitor@example.com' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Digite o e-mail para confirmar' }), { target: { value: 'leitor@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Buttondown indisponível')
  expect(screen.getAllByText('leitor@example.com').length).toBeGreaterThanOrEqual(2)
})
