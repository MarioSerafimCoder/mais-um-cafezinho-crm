type Recipient = { id: string; email_address: string; type: string }

/** Values come only from subscribers revalidated on the server at confirmation. */
export function selectedAudienceFilters(subscribers: Recipient[]) {
  if (!subscribers.length || subscribers.length > 500 || subscribers.some(s => !['regular', 'premium'].includes(s.type) || !s.email_address || !s.id) || new Set(subscribers.map(s => s.email_address.toLowerCase())).size !== subscribers.length) throw new Error('INVALID_SELECTED_AUDIENCE')
  return {
    predicate: 'and', filters: [], groups: [
      { predicate: 'or', groups: [], filters: subscribers.map(s => ({ field: 'subscriber.email_address', operator: 'equals', value: s.email_address })) },
      { predicate: 'or', groups: [], filters: ['regular', 'premium'].map(type => ({ field: 'subscriber.type', operator: 'equals', value: type })) },
    ],
  }
}
