import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DeliveryPreparation } from './DeliveryPreparation'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('exige endereço e confirmação, invalida a confirmação ao trocar destino e não envia', () => {
  const network = vi.fn(); vi.stubGlobal('fetch', network)
  render(<DeliveryPreparation />)
  const action = screen.getByRole('button', { name: 'Preparar teste sem enviar' })
  expect(action).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Destinatário de teste'), { target: { value: 'teste@example.com' } })
  expect(action).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(action)
  expect(screen.getByRole('status')).toHaveTextContent('teste@example.com')
  expect(network).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Destinatário de teste'), { target: { value: 'outro@example.com' } })
  expect(action).toBeDisabled()
})
