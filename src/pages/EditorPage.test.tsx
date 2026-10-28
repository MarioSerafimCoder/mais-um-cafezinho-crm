import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { EditorPage } from './EditorPage'
import { readDrafts } from '../lib/storage'

const mocks = vi.hoisted(() => ({ configured: false, save: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { status: async () => ({ configured: mocks.configured, connected: mocks.configured, demo: !mocks.configured }), campaignDeliveryStatus: async () => ({ enabled: false }), saveDraft: mocks.save } }))
vi.mock('@react-email/editor/extensions', () => ({ StarterKit: { configure: () => ({}) } }))
vi.mock('@react-email/editor/plugins', () => ({ EmailTheming: { configure: () => ({}) }, useEditorImage: () => ({}) }))
vi.mock('@react-email/editor', async () => {
  const { forwardRef, useImperativeHandle, useState, useMemo, useEffect } = await import('react')
  return {
    EmailEditor: forwardRef(({ content, onReady }: { content: string | { content?: Array<{ content?: Array<{ text?: string }> }> }; onReady: (value: unknown) => void }, ref) => {
      const [body, setBody] = useState(typeof content === 'string' ? content : content.content?.[0]?.content?.[0]?.text || '')
      const handle = useMemo(() => {
        const block = { nodeSize: body.length + 2, textContent: body, type: { name: 'paragraph' }, isBlock: true }
        const doc = { childCount: 1, child: () => block, content: { size: body.length + 2 }, descendants: (visit: (node: typeof block, position: number) => void) => visit(block, 0) }
        const chain = { setTextSelection: () => chain, focus: () => chain, run: () => true }; return { editor: { chain: () => chain, view: { dom: document.createElement('div'), hasFocus: () => false }, schema: { nodes: { doc: { spec: {} }, paragraph: { spec: {} }, text: { spec: {} } }, marks: {} }, commands: { focus: () => {} }, on: () => {}, off: () => {}, isActive: () => false, getAttributes: () => ({}), state: { selection: { from: 1, to: 1, node: block, $from: { parent: doc, index: () => 0 } }, doc } }, getEmailHTML: async () => body, getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] }) }
      }, [body])
      useImperativeHandle(ref, () => handle, [handle])
      useEffect(() => onReady(handle), [handle, onReady])
      return <textarea aria-label="Conteúdo de teste" value={body} onChange={(event) => setBody(event.target.value)} />
    }),
  }
})

beforeEach(() => { cleanup(); localStorage.clear(); mocks.configured = false; mocks.save.mockReset() })

function openEditor() {
  return render(<RouterProvider router={createMemoryRouter([{ path: '/editor/:id', element: <EditorPage /> }], { initialEntries: ['/editor/new'] })} />)
}

it('preserva e salva a edição ao entrar e sair da prévia', async () => {
  openEditor()
  const body = await screen.findByLabelText('Conteúdo de teste')
  fireEvent.change(body, { target: { value: '<p>Minha edição preservada.</p>' } })
  fireEvent.click(screen.getByRole('button', { name: 'Prévia' }))
  await screen.findByTitle('Prévia da newsletter')
  fireEvent.click(screen.getAllByRole('button', { name: 'Salvar local' })[0])
  await waitFor(() => expect(readDrafts()[0]?.document?.content?.[0].content?.[0].text).toContain('Minha edição preservada.'))
  fireEvent.click(screen.getByRole('button', { name: 'Escrever' }))
  expect(screen.getByLabelText('Conteúdo de teste')).toHaveValue('<p>Minha edição preservada.</p>')
})

it('não restaura o assunto antigo quando uma sincronização termina depois da edição', async () => {
  mocks.configured = true
  let finish!: (value: { id: string }) => void
  mocks.save.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  openEditor()
  const subject = await screen.findByLabelText('Assunto da newsletter')
  fireEvent.change(subject, { target: { value: 'Antes da sincronização' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Salvar rascunho na Buttondown' })[0])
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce())
  fireEvent.change(subject, { target: { value: 'Escrito durante a sincronização' } })
  finish({ id: 'em_test' })
  await screen.findByText('Rascunho salvo na Buttondown. Nenhum envio foi feito.')
  expect(readDrafts()[0]?.subject).toBe('Escrito durante a sincronização')
})
