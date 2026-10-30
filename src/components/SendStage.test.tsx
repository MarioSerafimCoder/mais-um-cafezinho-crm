import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import { SendStage } from './SendStage'
import type { DraftRecord, NewsletterSettings } from '../types'

const mocks = vi.hoisted(() => ({ subscribers: vi.fn(), editorialTest: vi.fn() }))
vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), api: { subscribers: mocks.subscribers, editorialTest: mocks.editorialTest } }))

const draft = { id: 'draft-send', subject: 'Assunto da edição', content: '<p>Conteúdo</p>', document: { type: 'grapesjs', version: 3, format: 'mjml', styles: [], components: [{ type: 'mj-mjml', tagName: 'mjml', components: [] }] }, status: 'draft', templateId: null, updatedAt: '2026-10-29T10:00:00Z' } as DraftRecord
const settings: NewsletterSettings = { newsletterName: 'Mais um Cafezinho', senderName: 'Mário Serafim', senderEmail: '', blogUrl: '', portfolioUrl: '', instagramUrl: '', linkedinUrl: '', theme: 'light' }
const page = { results: [{ id: 'sub-1', email_address: 'leitor@example.com', type: 'regular' }], count: 1, next: null, previous: null }

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  mocks.subscribers.mockReset().mockResolvedValue(page)
  mocks.editorialTest.mockReset()
})

function renderStage(onAdvance = vi.fn()) {
  return { onAdvance, ...render(<SendStage draft={draft} settings={settings} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />) }
}

it('verifica automaticamente e permite avançar sem confirmações manuais', async () => {
  const { onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled())
  for (const title of ['Destinatários', 'Assunto e remetente', 'Conteúdo e prévia']) expect(screen.getByRole('img', { name: `${title}: pronto` })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Verificar / })).not.toBeInTheDocument()
  expect(screen.getByText(/não pode ser verificado aqui/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Preparar envio e ver resumo' }))
  await waitFor(() => expect(onAdvance).toHaveBeenCalledWith({ mode: 'all_active' }, 1, []))
})

it('atualiza os avisos quando assunto ou documento são corrigidos', async () => {
  const { rerender, onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled())
  const view = (value: DraftRecord) => <SendStage draft={value} settings={settings} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />
  rerender(view({ ...draft, subject: '' }))
  expect(screen.getByRole('img', { name: 'Assunto e remetente: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Conteúdo e prévia: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
  rerender(view({ ...draft, document: undefined }))
  expect(screen.getByRole('img', { name: 'Conteúdo e prévia: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
  rerender(view({ ...draft, subject: 'a'.repeat(201) }))
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
  rerender(view(draft))
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled()
})

it('verifica destinatários selecionados automaticamente e bloqueia seleção vazia', async () => {
  renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled())
  fireEvent.click(screen.getByRole('radio', { name: /Escolher contatos/ }))
  await screen.findByRole('checkbox')
  expect(screen.getByRole('img', { name: 'Destinatários: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('img', { name: 'Destinatários: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
})

it('falha na consulta de destinatários não invalida assunto nem conteúdo', async () => {
  mocks.subscribers.mockRejectedValue(new Error('Falha de consulta'))
  renderStage()
  await screen.findByRole('alert')
  expect(screen.getByRole('img', { name: 'Destinatários: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Assunto e remetente: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Conteúdo e prévia: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
})

it('bloqueia referência de remetente inválida e retoma ao corrigir', async () => {
  const { rerender, onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled())
  rerender(<SendStage draft={draft} settings={{ ...settings, senderEmail: 'invalido' }} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />)
  expect(screen.getByRole('img', { name: 'Assunto e remetente: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeDisabled()
  rerender(<SendStage draft={draft} settings={{ ...settings, senderEmail: 'editor@example.com' }} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />)
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled()
})

it('mantém na preparação e mostra falha ao preparar', async () => {
  const advance = vi.fn().mockRejectedValue(new Error('Envio desativado'))
  renderStage(advance)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Preparar envio e ver resumo' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Envio desativado'))
  expect(screen.getByRole('button', { name: 'Preparar envio e ver resumo' })).toBeEnabled()
})

it('mostra sucessos e falhas e preserva resultados ao reabrir o diálogo', async () => {
  mocks.editorialTest.mockImplementation(async input => {
    if (!input.confirm) return { attemptId: input.recipient }
    if (input.recipient === 'b@example.com') throw new ApiError('Recusado', 502, 'rejected')
    if (input.recipient === 'c@example.com') throw new ApiError('Timeout', 0)
    return { accepted: true }
  })
  render(<SendStage draft={draft} settings={settings} onPrepare={async () => ({ ...draft, buttondownId: 'em_test', cloudRevision: 1 })} onEdit={vi.fn()} onAdvance={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Enviar email de teste' }))
  fireEvent.change(screen.getByLabelText('E-mail para envio do teste'), { target: { value: 'a@example.com,b@example.com,c@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar o teste' }))
  await screen.findByText(/Resultado incerto — repetição bloqueada/)
  expect(screen.getByText(/Aceito pela Buttondown/)).toBeInTheDocument()
  expect(screen.getByText(/Não enviado — recusado/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enviar email de teste' }))
  mocks.editorialTest.mockClear().mockImplementation(async input => input.confirm ? { accepted: true } : { attemptId: 'retry' })
  fireEvent.click(screen.getByRole('button', { name: 'Repetir somente não enviados' }))
  await waitFor(() => expect(mocks.editorialTest).toHaveBeenCalledTimes(2))
  expect(mocks.editorialTest.mock.calls.every(([input]) => input.recipient === 'b@example.com')).toBe(true)
})

it('permite testar a nova revisão ao mesmo destinatário preservando o histórico anterior', async () => {
  localStorage.setItem(`cafezinho:test-results:${draft.id}`, JSON.stringify({ 'a@example.com': { state: 'accepted' } }))
  let current = { ...draft, revision: 1, buttondownId: 'em_test', cloudRevision: 1 }
  mocks.editorialTest.mockImplementation(async input => input.confirm ? { accepted: true } : { attemptId: 'attempt' })
  const view = render(<SendStage draft={current} settings={settings} onPrepare={async () => current} onEdit={vi.fn()} onAdvance={vi.fn()} />)
  const send = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar email de teste' }))
    fireEvent.change(screen.getByLabelText('E-mail para envio do teste'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar o teste' }))
    await screen.findByText(/Aceito pela Buttondown/)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  }
  await send()
  current = { ...current, revision: 2, subject: 'Conteúdo revisado' }
  view.rerender(<SendStage draft={current} settings={settings} onPrepare={async () => current} onEdit={vi.fn()} onAdvance={vi.fn()} />)
  await send()
  expect(mocks.editorialTest).toHaveBeenCalledTimes(4)
  for (const suffix of ['', ':revision:1', ':revision:2']) expect(JSON.parse(localStorage.getItem(`cafezinho:test-results:${draft.id}${suffix}`)!)['a@example.com'].state).toBe('accepted')
})
