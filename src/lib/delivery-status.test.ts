import { expect, it } from 'vitest'
import { deliveryStatus } from './delivery-status'

it('não confunde sent sem métricas com entrega confirmada', () => {
  expect(deliveryStatus({ provider_status: 'sent', delivery: null })).toMatchObject({ warning: true, title: 'Envio concluído na Buttondown' })
})
it('não confunde agendamento com envio concluído', () => {
  expect(deliveryStatus({ provider_status: 'scheduled' })).toMatchObject({ warning: true, title: 'Agendada na Buttondown' })
})
it('exibe falhas mesmo quando há entregas parciais', () => {
  expect(deliveryStatus({ provider_status: 'sent', delivery: { deliveries: 1, recipients: 2, permanent_failures: 1 } })).toMatchObject({ warning: true, title: 'Falha de entrega registrada' })
})
it('divergência de publicação tem precedência sobre as métricas', () => {
  expect(deliveryStatus({ provider_status: 'sent', publication_verified: false, delivery: { deliveries: 2 } })).toMatchObject({ warning: true, title: 'Publicação divergente' })
})
