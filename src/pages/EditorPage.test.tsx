import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { EditorPage } from './EditorPage'
import { readDrafts } from '../lib/storage'

vi.mock('../lib/api', () => ({ api: { status: async () => ({ configured: false, demo: true }) } }))
vi.mock('@react-email/editor/extensions', () => ({ StarterKit: { configure: () => ({}) } }))
vi.mock('@react-email/editor/plugins', () => ({ EmailTheming: { configure: () => ({}) }, useEditorImage: () => ({}) }))
vi.mock('@react-email/editor', async () => {
  const { forwardRef, useImperativeHandle, useState } = await import('react')
  return {
    EmailEditor: forwardRef(({ content }: { content: string }, ref) => {
      const [body, setBody] = useState(content)
      useImperativeHandle(ref, () => ({ editor: {}, getEmailHTML: async () => body }), [body])
      return <textarea aria-label="Conteúdo de teste" value={body} onChange={(event) => setBody(event.target.value)} />
    }),
  }
})

beforeEach(() => localStorage.clear())

it('preserva e salva a edição ao entrar e sair da prévia', async () => {
  render(<MemoryRouter initialEntries={['/editor/new']}><Routes><Route path="/editor/:id" element={<EditorPage />} /></Routes></MemoryRouter>)
  const body = await screen.findByLabelText('Conteúdo de teste')
  fireEvent.change(body, { target: { value: '<p>Minha edição preservada.</p>' } })
  fireEvent.click(screen.getByRole('button', { name: 'Prévia' }))
  await screen.findByTitle('Prévia da newsletter')
  fireEvent.click(screen.getAllByRole('button', { name: 'Salvar local' })[0])
  await waitFor(() => expect(readDrafts()[0]?.content).toContain('Minha edição preservada.'))
  fireEvent.click(screen.getByRole('button', { name: 'Escrever' }))
  expect(screen.getByLabelText('Conteúdo de teste')).toHaveValue('<p>Minha edição preservada.</p>')
})
