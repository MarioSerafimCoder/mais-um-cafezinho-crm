// Public campaign policy: confirmed subscribers, including premium lifecycle states.
export const activeSubscriberTypes = ['regular', 'premium', 'gifted', 'trialed', 'churning', 'churned', 'paused', 'past_due', 'upcoming'] as const
export function isActiveSubscriberType(type: string) { return (activeSubscriberTypes as readonly string[]).includes(type) }
export function activeSubscriberQuery(extra: Record<string, string> = {}) {
  const query = new URLSearchParams(extra)
  activeSubscriberTypes.forEach(type => query.append('type', type))
  return query
}
export function activeAudienceFilters() {
  // Native Everyone audience. Subscriber API types are not a contract for the
  // publication filter's status values. Buttondown applies active eligibility
  // and suppressions itself, as it does for Everyone in its publishing UI.
  return { predicate: 'and', groups: [], filters: [] }
}
