import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { EditorPage } from './EditorPage'
import { readDrafts } from '../lib/storage'

const mocks = vi.hoisted(() => ({ configured: false, cloud: false, save: vi.fn(), saveCloud: vi.fn() }))
vi.mock('../lib/api', () => {
  class MockApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) { super(message); this.status = status }
  }
  return { ApiError: MockApiError, api: { status: async () => ({ configured: mocks.configured, connected: mocks.configured, demo: !mocks.configured, cloud: mocks.cloud }), cloudDraft: async () => { throw new MockApiError('Não encontrado', 404) }, campaignDeliveryStatus: async () => ({ enabled: false }), saveDraft: mocks.save, saveCloudDraft: mocks.saveCloud } }
})
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

beforeEach(() => { cleanup(); localStorage.clear(); mocks.configured = false; mocks.cloud = false; mocks.save.mockReset(); mocks.saveCloud.mockReset() })

function openEditor() {
  return render(<RouterProvider router={createMemoryRouter([{ path: '/editor/:id', element: <EditorPage /> }], { initialEntries: ['/editor/new'] })} />)
}

it('preserva e salva a edição ao entrar e sair da prévia', async () => {
  openEditor()
  const body = await screen.findByLabelText('Conteúdo de teste')
  fireEvent.change(body, { target: { value: '<p>Minha edição preservada.</p>' } })
  fireEvent.click(screen.getByRole('button', { name: '2 · Prévia' }))
  await screen.findByTitle('Prévia da edição')
  await waitFor(() => expect(readDrafts()[0]?.document?.content?.[0].content?.[0].text).toContain('Minha edição preservada.'))
  fireEvent.click(screen.getByRole('button', { name: 'Voltar à edição' }))
  expect(screen.getByLabelText('Conteúdo de teste')).toHaveValue('<p>Minha edição preservada.</p>')
})

it('não restaura o assunto antigo quando uma sincronização termina depois da edição', async () => {
  mocks.configured = true
  mocks.cloud = true
  let finish!: (value: { id: string }) => void
  mocks.save.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  mocks.saveCloud.mockImplementation(async (draft) => ({ ...draft, cloudRevision: (draft.cloudRevision || 0) + 1, lastCloudSavedAt: 'agora' }))
  openEditor()
  const subject = await screen.findByLabelText('Assunto da newsletter')
  fireEvent.change(subject, { target: { value: 'Antes da sincronização' } })
  expect(screen.queryByRole('button', { name: 'Salvar local' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Salvar rascunho na Buttondown' })).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Preparar edição' })[0])
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce())
  fireEvent.change(subject, { target: { value: 'Escrito durante a sincronização' } })
  finish({ id: 'em_test' })
  await screen.findByText('A versão anterior foi preparada. As alterações mais recentes estão sendo salvas.')
  expect(mocks.saveCloud.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(mocks.saveCloud).toHaveBeenLastCalledWith(expect.objectContaining({ subject: 'Escrito durante a sincronização', buttondownId: 'em_test' }))
  expect(readDrafts()[0]?.subject).toBe('Escrito durante a sincronização')
})
