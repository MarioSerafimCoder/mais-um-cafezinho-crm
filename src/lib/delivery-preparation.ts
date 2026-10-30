import type { DraftRecord, PreparedCampaignDelivery } from '../types'

export type PreparedDelivery = PreparedCampaignDelivery & { draftId: string; draftKey: string }
export function deliveryDraftKey(draft: DraftRecord) {
  return JSON.stringify([draft.id, draft.subject, draft.description || '', draft.revision, draft.cloudRevision, draft.syncedRevision, draft.cloudSavedRevision, draft.document || draft.content])
}
