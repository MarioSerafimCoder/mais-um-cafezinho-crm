import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DeliveryPreparation } from './DeliveryPreparation'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('não envia automaticamente e respeita a flag do servidor', async () => {
  const network = vi.fn().mockResolvedValue(Response.json({ enabled: false, recipients: [] }))
  vi.stubGlobal('fetch', network)
  render(<DeliveryPreparation />)
  expect(network).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Consultar destinatários e resultado'))
  await waitFor(() => expect(screen.getByText(/Teste desativado ou sem destinos autorizados/)).toBeInTheDocument())
  expect(network).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Enviar teste' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
