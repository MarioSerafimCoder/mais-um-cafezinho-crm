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

it('mantém as três confirmações humanas desmarcadas mesmo quando as validações técnicas passam', async () => {
  renderStage()
  await waitFor(() => expect(screen.getByText('Audiência carregada e com destinatários elegíveis.')).toBeInTheDocument())
  for (const label of ['Destinatários', 'Assunto e remetente', 'Conteúdo e prévia']) expect(screen.getByRole('button', { name: `Verificar ${label}` })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  expect(screen.getByText(/não é verificável automaticamente/)).toBeInTheDocument()
})

it('permite marcar e desmarcar as três confirmações sem equivaler à validação técnica', async () => {
  const { onAdvance } = renderStage()
  await waitFor(() => expect(screen.getByText('Audiência carregada e com destinatários elegíveis.')).toBeInTheDocument())
  for (const label of ['Destinatários', 'Assunto e remetente', 'Conteúdo e prévia']) fireEvent.click(screen.getByRole('button', { name: `Verificar ${label}` }))
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Verificar Assunto e remetente' }))
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Verificar Assunto e remetente' }))
  fireEvent.click(screen.getByRole('button', { name: 'Avançar' }))
  expect(onAdvance).toHaveBeenCalledOnce()
})

it('invalida a audiência quando a seleção muda e bloqueia após falha técnica', async () => {
  const { onAdvance, rerender } = renderStage()
  await waitFor(() => expect(screen.getByText('Audiência carregada e com destinatários elegíveis.')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Verificar Destinatários' }))
  fireEvent.click(screen.getByRole('button', { name: 'Verificar Assunto e remetente' }))
  rerender(<SendStage draft={{ ...draft, subject: '' }} settings={settings} onPrepare={vi.fn()} onEdit={vi.fn()} onAdvance={onAdvance} />)
  expect(screen.getByRole('button', { name: 'Verificar Assunto e remetente' })).toHaveAttribute('aria-pressed', 'false')

  mocks.subscribers.mockRejectedValue(new Error('Falha de consulta'))
  fireEvent.click(screen.getByRole('radio', { name: /Escolher contatos/ }))
  expect(screen.getByRole('button', { name: 'Verificar Destinatários' })).toHaveAttribute('aria-pressed', 'false')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Falha de consulta'))
  fireEvent.click(screen.getByRole('button', { name: 'Verificar Assunto e remetente' }))
  fireEvent.click(screen.getByRole('button', { name: 'Verificar Conteúdo e prévia' }))
  expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  expect(onAdvance).not.toHaveBeenCalled()
})
