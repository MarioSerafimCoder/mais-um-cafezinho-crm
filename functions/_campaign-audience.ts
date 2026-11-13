import { isActiveSubscriberType } from '../shared/audience'
type Recipient = { id: string; email_address: string; type: string }

/** Values come only from subscribers revalidated on the server at confirmation. */
export function selectedAudienceFilters(subscribers: Recipient[]) {
  if (!subscribers.length || subscribers.length > 500 || subscribers.some(s => !isActiveSubscriberType(s.type) || !s.email_address || !s.id) || new Set(subscribers.map(s => s.email_address.toLowerCase())).size !== subscribers.length) throw new Error('INVALID_SELECTED_AUDIENCE')
  return {
    predicate: 'or', groups: [],
    filters: subscribers.map(s => ({ field: 'subscriber.email_address', operator: 'equals', value: s.email_address })),
  }
}
