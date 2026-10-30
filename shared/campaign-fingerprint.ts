export async function campaignHash(campaign: { subject?: string; body?: string; description?: string; template?: string | null }) {
  const value = JSON.stringify([campaign.subject || '', campaign.body || '', campaign.description || '', campaign.template ?? null])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
