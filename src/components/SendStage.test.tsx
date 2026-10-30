import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SendStage } from './SendStage'
import type { DraftRecord, NewsletterSettings } from '../types'

const mocks = vi.hoisted(() => ({ subscribers: vi.fn(), editorialTest: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { subscribers: mocks.subscribers, editorialTest: mocks.editorialTest } }))

const draft = { id: 'draft-send', subject: 'Assunto da edição', content: '<p>Conteúdo</p>', document: { type: 'grapesjs', version: 3, format: 'mjml', styles: [], components: [{ type: 'mj-mjml', tagName: 'mjml', components: [] }] }, status: 'draft', templateId: null, updatedAt: '2026-10-29T10:00:00Z' } as DraftRecord
const settings: NewsletterSettings = { newsletterName: 'Mais um Cafezinho', senderName: 'Mário Serafim', senderEmail: '', blogUrl: '', portfolioUrl: '', instagramUrl: '', linkedinUrl: '', theme: 'light' }
const page = { results: [{ id: 'sub-1', email_address: 'leitor@example.com', type: 'regular' }], count: 1, next: null, previous: null }

afterEach(cleanup)
beforeEach(() => {
  mocks.subscribers.mockReset().mockResolvedValue(page)
  mocks.editorialTest.mockReset()
})

function renderStage(onAdvance = vi.fn()) {
  return { onAdvance, ...render(<SendStage draft={draft} settings={settings} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />) }
}

it('verifica automaticamente e permite avançar sem confirmações manuais', async () => {
  const { onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled())
  for (const title of ['Destinatários', 'Assunto e remetente', 'Conteúdo e prévia']) expect(screen.getByRole('img', { name: `${title}: pronto` })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Verificar / })).not.toBeInTheDocument()
  expect(screen.getByText(/não pode ser verificado aqui/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Avançar' }))
  expect(onAdvance).toHaveBeenCalledWith({ mode: 'all_active' }, 2, [])
})

it('atualiza os avisos quando assunto ou documento são corrigidos', async () => {
  const { rerender, onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled())
  const view = (value: DraftRecord) => <SendStage draft={value} settings={settings} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />
  rerender(view({ ...draft, subject: '' }))
  expect(screen.getByRole('img', { name: 'Assunto e remetente: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Conteúdo e prévia: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  rerender(view({ ...draft, document: undefined }))
  expect(screen.getByRole('img', { name: 'Conteúdo e prévia: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  rerender(view({ ...draft, subject: 'a'.repeat(201) }))
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  rerender(view(draft))
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled()
})

it('verifica destinatários selecionados automaticamente e bloqueia seleção vazia', async () => {
  renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled())
  fireEvent.click(screen.getByRole('radio', { name: /Escolher contatos/ }))
  await screen.findByRole('checkbox')
  expect(screen.getByRole('img', { name: 'Destinatários: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('img', { name: 'Destinatários: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
})

it('falha na consulta de destinatários não invalida assunto nem conteúdo', async () => {
  mocks.subscribers.mockRejectedValue(new Error('Falha de consulta'))
  renderStage()
  await screen.findByRole('alert')
  expect(screen.getByRole('img', { name: 'Destinatários: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Assunto e remetente: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Conteúdo e prévia: pronto' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
})

it('bloqueia referência de remetente inválida e retoma ao corrigir', async () => {
  const { rerender, onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled())
  rerender(<SendStage draft={draft} settings={{ ...settings, senderEmail: 'invalido' }} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />)
  expect(screen.getByRole('img', { name: 'Assunto e remetente: pendente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  rerender(<SendStage draft={draft} settings={{ ...settings, senderEmail: 'editor@example.com' }} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />)
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled()
})
