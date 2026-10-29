import type { DraftRecord } from '../types'
import type { DocumentNode } from '../../shared/safety'
import { isEditorDocument } from '../../shared/safety'
import { isGrapesDocument } from '../../shared/grapes-document'
import { validateDraftPayload } from './email'
import { readDrafts, writeDraft } from './storage'

export type SaveState = 'alterado' | 'salvando' | 'salvo' | 'erro'
type SyncPayload = { id?: string; subject: string; body: string; description?: string; buttondownTemplate?: 'classic' | 'modern'; createKey?: string; expectedBodyHash?: string }

async function bodyHash(body: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The structured snapshot is saved synchronously; network replies only merge metadata. */
export class DraftSession {
  value: DraftRecord
  state: SaveState = 'salvo'
  error = ''
  syncing = false
  cloudSaving = false
  private stored: DraftRecord | null
  onChange: () => void = () => {}

  constructor(draft: DraftRecord) {
    this.value = structuredClone(draft)
    this.stored = readDrafts().find((item) => item.id === draft.id) || null
    this.state = this.stored ? 'salvo' : 'alterado'
  }

  get dirty() { return JSON.stringify(this.value) !== JSON.stringify(this.stored) }
  private emit() { this.onChange() }
  clearError() { this.error = ''; this.emit() }

  edit(patch: Partial<Pick<DraftRecord, 'subject' | 'description' | 'buttondownTemplate' | 'editionDate' | 'templateId' | 'document'>>) {
    if (patch.document && !isEditorDocument(patch.document) && !isGrapesDocument(patch.document)) throw new Error('O documento contém uma estrutura ou atributo não permitido.')
    if (Object.entries(patch).every(([key, value]) => JSON.stringify(this.value[key as keyof DraftRecord]) === JSON.stringify(value))) return
    this.value = { ...this.value, ...structuredClone(patch), schemaVersion: isGrapesDocument(patch.document || this.value.document) ? 3 : 2, revision: (this.value.revision || 0) + 1, updatedAt: new Date().toISOString() }
    this.state = 'alterado'; this.error = ''; this.emit()
  }

  save() {
    this.state = 'salvando'; this.emit()
    try {
      writeDraft(this.value, this.stored)
      this.stored = structuredClone(this.value)
      this.state = 'salvo'; this.error = ''; this.emit()
      return structuredClone(this.value)
    } catch (error) {
      this.state = 'erro'; this.error = error instanceof Error ? error.message : 'Falha ao salvar neste navegador.'; this.emit()
      throw error
    }
  }

  async saveCloud(save: (draft: DraftRecord) => Promise<DraftRecord>) {
    if (this.cloudSaving) throw new Error('Aguarde a gravação na nuvem terminar.')
    this.cloudSaving = true; this.emit()
    try {
      const snapshot = this.save()
      const result = await save(snapshot)
      // Never restore subject/document from a response captured before a keystroke.
      this.value = { ...this.value, cloudRevision: result.cloudRevision, lastCloudSavedAt: result.lastCloudSavedAt, cloudSavedRevision: snapshot.revision || 0 }
      this.save()
      return result
    } finally { this.cloudSaving = false; this.emit() }
  }

  async sync(exportHtml: () => Promise<string>, send: (payload: SyncPayload) => Promise<{ id: string; body?: string }>, beforeCreate?: () => Promise<unknown>) {
    if (this.syncing) return
    this.syncing = true; this.emit()
    try {
      const snapshot = this.save()
      let pending = snapshot.pendingCreate
      if (!pending || snapshot.buttondownId) {
        // getEmailHTML captures editor JSON synchronously before starting its async render.
        const html = await exportHtml()
        const payload = validateDraftPayload(snapshot.subject, html)
        pending = { key: snapshot.createKey || `crm-${snapshot.id}`, subject: payload.subject, body: payload.body, description: snapshot.description || '', template: snapshot.buttondownTemplate || 'classic', revision: snapshot.revision || 0 }
      }
      if (!snapshot.buttondownId) {
        this.value = { ...this.value, createKey: pending.key, pendingCreate: pending, cloudSavedRevision: undefined }
        this.save() // Retrying an uncertain creation must resend exactly the same payload/key.
        if (beforeCreate) await beforeCreate()
      }
      const response = await send({ id: snapshot.buttondownId, subject: pending.subject, body: pending.body, description: pending.description, buttondownTemplate: pending.template, createKey: pending.key, expectedBodyHash: snapshot.syncedBodyHash })
      if (!response.id) throw new Error('A Buttondown não retornou o identificador do rascunho.')
      const syncedBodyHash = await bodyHash(typeof response.body === 'string' ? response.body : pending.body)
      this.value = { ...this.value, content: pending.body, buttondownId: response.id, lastSyncedAt: new Date().toISOString(), syncedRevision: pending.revision, syncedBodyHash, pendingCreate: undefined, cloudSavedRevision: undefined }
      this.save()
      return response
    } finally { this.syncing = false; this.emit() }
  }

  snapshotDocument(document: DocumentNode) { this.edit({ document }) }
}
