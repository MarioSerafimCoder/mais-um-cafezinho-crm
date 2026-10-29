import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { EditorPage } from './EditorPage'
// Canvas behavior is exercised in a real Chromium browser in e2e/editor.spec.ts.
afterEach(cleanup)
it('nova edição começa pela escolha dos seis templates sem criar um rascunho vazio', () => {
  localStorage.clear()
  render(<RouterProvider router={createMemoryRouter([{ path: '/editor/:id', element: <EditorPage /> }], { initialEntries: ['/editor/new'] })} />)
  expect(screen.getByRole('heading', { name: 'Escolha o seu template' })).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Usar template' })).toHaveLength(6)
  expect(localStorage.getItem('mais-um-cafezinho:drafts:v1')).toBeNull()
})
