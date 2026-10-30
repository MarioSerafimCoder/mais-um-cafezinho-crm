import { ApiError, api } from './api'
import { DraftSession } from './draft-session'
import type { IntegrationStatus } from '../types'

type Services = Pick<typeof api, 'saveCloudDraft' | 'cloudDraft' | 'saveDraft' | 'status'>

/** One queue per mounted document. Local recovery never waits for the network. */
export class DraftPersistence {
  status: IntegrationStatus | null = null
  error = ''
  busy = false
  private stopped = false
  private blocked = false
  private blockedRevision?: number
  private retryCount = 0
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private cloudMetadata = ''
  onChange = () => {}

  readonly session: DraftSession
  private html: () => Promise<string>
  private services: Services
  constructor(session: DraftSession, html: () => Promise<string>, services: Services = api) {
    this.session = session; this.html = html; this.services = services
    this.cloudMetadata = this.metadata()
  }

  private metadata() { const d = this.session.value; return JSON.stringify([d.buttondownId, d.syncedRevision, d.pendingCreate, d.schemaVersion]) }
  get pending() {
    const d = this.session.value
    return !this.status || (this.status.cloud && (d.cloudSavedRevision !== (d.revision || 0) || this.cloudMetadata !== this.metadata())) || Boolean(d.migration?.sourceRevision !== (d.revision || 0) && d.buttondownId && (!this.status.connected || d.syncedRevision !== (d.revision || 0))) || Boolean(d.pendingCreate)
  }
  get label() {
    if (this.session.state === 'erro') return 'Não foi possível salvar — intervenção necessária.'
    if (this.busy || this.session.dirty) return 'Salvando…'
    if (this.pending || this.error) return 'Salvo neste dispositivo — sincronização pendente.'
    return 'Todas as alterações salvas.'
  }
  configure(status: IntegrationStatus) { this.status = status; this.schedule() }
  schedule() {
    if (this.stopped) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      try { this.session.save() } catch { this.onChange(); return }
      if (this.blockedRevision !== undefined && this.blockedRevision !== (this.session.value.revision || 0)) this.blocked = false
      if (!this.blocked) void this.flush().catch(() => {})
    }, 600)
    this.onChange()
  }
  async reconnect() {
    try { this.status = await this.services.status(); this.retryCount = 0; this.schedule() }
    catch (error) { this.error = String(error); this.onChange() }
  }
  dispose() { this.stopped = true; clearTimeout(this.timer); this.onChange = () => {} }

  private async cloud() {
    if (!this.status?.cloud) return
    const d = this.session.value
    if (d.cloudSavedRevision === (d.revision || 0) && this.cloudMetadata === this.metadata()) return
    const metadata = this.metadata()
    await this.session.saveCloud(async snapshot => {
      try { return await this.services.saveCloudDraft(snapshot) }
      catch (error) {
        // A lost acknowledgement is reconciled by reading, never by blind writes.
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
          const remote = await this.services.cloudDraft(snapshot.id).catch(() => null)
          const fields = ['subject', 'document', 'content', 'description', 'editionDate', 'templateId', 'buttondownTemplate', 'revision', 'buttondownId', 'syncedRevision', 'pendingCreate', 'syncedBodyHash', 'syncedCampaignHash'] as const
          if (remote && remote.cloudRevision === (snapshot.cloudRevision || 0) + 1 && fields.every(key => JSON.stringify(remote[key]) === JSON.stringify(snapshot[key]))) return remote
        }
        throw error
      }
    })
    this.cloudMetadata = metadata
  }

  async flush(prepare = false): Promise<void> {
    clearTimeout(this.timer)
    if (this.running) { await this.running; if (prepare) return this.flush(true); return }
    if (this.stopped) return
    if (this.blocked && !prepare) return
    this.blocked = false
    const work = async () => {
      this.busy = true; this.error = ''; this.onChange()
      let destination: 'cloud' | 'buttondown' = 'cloud'
      try {
        this.session.save()
        await this.cloud()
        if (this.stopped) return
        const d = this.session.value
        if (prepare && !this.status?.connected) throw new Error('Não foi possível preparar: a conexão com a Buttondown não está confirmada.')
        const untouchedMigration = d.schemaVersion === 3 && d.migration?.sourceRevision === (d.revision || 0)
        if (this.status?.connected && (prepare || !untouchedMigration) && ((!d.buttondownId && Boolean(d.document) && Boolean(d.subject.trim())) || (d.buttondownId && (d.syncedRevision !== (d.revision || 0) || (prepare && untouchedMigration))))) {
          destination = 'buttondown'
          await this.session.sync(this.html, this.services.saveDraft, () => this.cloud())
          destination = 'cloud'
          await this.cloud()
        }
        this.retryCount = 0
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível sincronizar.'
        // Unknown external outcomes need explicit recovery. D1 is protected by CAS.
        const recoverable = (destination === 'cloud' || Boolean(this.session.value.buttondownId && this.session.value.syncedBodyHash)) && error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
        this.blocked = !recoverable
        // Only local validation errors may resume automatically after an edit.
        this.blockedRevision = !(error instanceof ApiError) && destination === 'buttondown' && !this.session.value.pendingCreate ? (this.session.value.revision || 0) : undefined
        if (recoverable && this.retryCount < 3 && !this.stopped) {
          const delay = 1000 * 2 ** this.retryCount++
          this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, delay)
        }
        throw error
      } finally { this.busy = false; this.onChange() }
    }
    // Cross-tab serialization complements storage compare-and-swap and D1 revisions.
    this.running = (typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(`editorial:${this.session.value.id}`, work) : work())
    try { await this.running }
    finally { this.running = undefined }
    const d = this.session.value
    const cloudPending = this.status?.cloud && (d.cloudSavedRevision !== (d.revision || 0) || this.cloudMetadata !== this.metadata())
    const externalPending = d.migration?.sourceRevision !== (d.revision || 0) && this.status?.connected && d.buttondownId && d.syncedRevision !== (d.revision || 0)
    if (!this.stopped && !this.error && (cloudPending || externalPending)) this.schedule()
  }
}
