import { deliveryDraftKey, type PreparedDelivery } from '../lib/delivery-preparation'
import { campaignHash } from '../../shared/campaign-fingerprint'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Editor } from 'grapesjs'
import { api, ApiError } from '../lib/api'
import { getTemplate, templates } from '../data/templates'
import { TemplatesPage } from './TemplatesPage'
import { GrapesEditor } from '../components/GrapesEditor'
import { SendStage } from '../components/SendStage'
import { SendSummary } from '../components/SendSummary'
import { Button, ErrorState, Field, LoadingState } from '../components/ui'
import { DraftSession } from '../lib/draft-session'
import { DraftPersistence } from '../lib/draft-persistence'
import { preserveOriginal, readOriginal, readDrafts, readSettings, writeDraft, downloadDraftBackup } from '../lib/storage'
import { migrateDraft, htmlToDocument, assertPreserved, documentContent } from '../lib/editor-migration'
import { compileEmail } from '../lib/mjml-export'
import { editorialBlocks, snapshotEditor } from '../lib/grapes-editor'
import { isGrapesDocument, type GrapesDocument } from '../../shared/grapes-document'
import type { DraftRecord, IntegrationStatus, NewsletterTemplateId } from '../types'

const today = () => new Date().toLocaleDateString('en-CA')
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function EditorPage() {
  const { id = 'new' } = useParams(); const [params] = useSearchParams()
  const template = params.get('template') as NewsletterTemplateId | null
  if (id === 'new' && !templates.some(item => item.id === template)) return <TemplatesPage />
  return <Workspace key={`${id}:${template}:${params.get('copy')}`} routeId={id} templateId={template} copy={params.get('copy') === '1'} />
}
function Workspace({ routeId, templateId, copy }: { routeId: string; templateId: NewsletterTemplateId | null; copy: boolean }) {
  const navigate = useNavigate(); const [, refresh] = useReducer(n => n + 1, 0)
  const session = useRef<DraftSession | null>(null); const queue = useRef<DraftPersistence | null>(null); const editor = useRef<Editor | null>(null)
  const source = useRef<DraftRecord | null>(null); const invalid = useRef(false)
  const [currentSession, setCurrentSession] = useState<DraftSession | null>(null)
  const [persistenceView, setPersistenceView] = useState<DraftPersistence | null>(null)
  const [initial, setInitial] = useState<GrapesDocument | null>(null); const [integration, setIntegration] = useState<IntegrationStatus | null>(null)
  const [error, setError] = useState(''); const [loadError, setLoadError] = useState(''); const [notice, setNotice] = useState('')
  const [stage, setStage] = useState<'edit' | 'preview' | 'send' | 'summary'>('edit'); const [preview, setPreview] = useState(''); const [previewDevice, setPreviewDevice] = useState('Desktop')
  const [preparedDelivery, setPreparedDelivery] = useState<PreparedDelivery | null>(null)
  const [settings] = useState(() => readSettings())
  const blocker = useBlocker(() => Boolean(session.current?.dirty || invalid.current))
  useEffect(() => {
    let active = true
    const install = (record: DraftRecord) => {
      if (!active) return
      source.current = structuredClone(record)
      const migrated = migrateDraft(record)
      if (!isGrapesDocument(migrated.document)) throw new Error('Documento não compatível.')
      compileEmail(migrated.document) // Validate conversion before ANY original is replaced.
      if (record.schemaVersion !== 3) preserveOriginal(record)
      const next = new DraftSession(record); next.value = migrated; next.onChange = refresh; session.current = next; setCurrentSession(next)
      setInitial(migrated.document)
    }
    void (async () => {
      try {
        if (routeId === 'new') {
          const t = getTemplate(templateId, readSettings()); const document = htmlToDocument(t.content)
          // Templates have one native, editable masthead. Export never adds another.
          document.components[0].components![0].components!.unshift(structuredClone(editorialBlocks.find(b => b.id === 'header')!.content))
          const fresh: DraftRecord = { id: `local-${crypto.randomUUID()}`, subject: t.subject, description: t.preheader, buttondownTemplate: 'modern', editionDate: today(), content: compileEmail(document), document, schemaVersion: 3, templateId: t.id, status: 'draft', revision: 0, updatedAt: new Date().toISOString() }
          if (active) { writeDraft(fresh); navigate(`/editor/${fresh.id}`, { replace: true }) }
          return
        }
        let local = copy ? undefined : readDrafts().find(d => d.id === routeId || d.buttondownId === routeId)
        source.current = local || null
        let status: IntegrationStatus
        try { status = await api.status() } catch { status = { configured: false, connected: false, cloud: false, demo: false } }
        if (!active) return
        setIntegration(status)
        if (status.cloud && !copy) {
          try {
            const cloud = await api.cloudDraft(local?.id || routeId)
            if (!active) return
            if (!local || (cloud.cloudRevision || 0) > (local.cloudRevision || 0)) {
              if (local && local.cloudSavedRevision !== (local.revision || 0)) setError('Há uma versão mais recente na nuvem. Sua cópia local foi preservada; exporte-a antes de recuperar a versão remota.')
              else local = cloud
            }
          } catch (cause) { if (!(cause instanceof ApiError && cause.status === 404) && !local) throw cause }
        }
        if (local) { install(local); return }
        if (!status.connected) throw new Error('O rascunho não está disponível neste navegador e a conexão não pôde ser estabelecida.')
        const remote = await api.campaign(routeId)
        if (!active) return
        if (remote.status !== 'draft' && !copy) throw new Error('Esta campanha já foi enviada. Abra uma cópia para editar.')
        // Fancy isn't a canonical source; don't pretend its transformed document is original HTML.

        const record: DraftRecord = { id: copy ? `local-${crypto.randomUUID()}` : `bd-${remote.id}`, ...(copy ? {} : { buttondownId: remote.id, syncedCampaignHash: await campaignHash(remote) }), subject: remote.subject || '', description: remote.description || '', content: remote.body || '', templateId: null, buttondownTemplate: remote.template === 'modern' ? 'modern' : 'classic', editionDate: today(), status: 'draft', revision: 0, updatedAt: new Date().toISOString() }
        source.current = record
        if (remote.template === 'fancy' || (remote.body && !/<[a-z][\s\S]*>/i.test(remote.body))) throw new Error('A campanha remota não contém HTML compatível. O original remoto foi preservado.')
        install(record)
      } catch (cause) { if (active) setLoadError(cause instanceof Error ? cause.message : 'Não foi possível abrir a edição.') }
    })()
    return () => { active = false; queue.current?.dispose(); if (session.current) session.current.onChange = () => {} }
  }, [routeId, templateId, copy, navigate])
  const capture = () => {
    if (!session.current) return
    if (editor.current) {
      const doc = snapshotEditor(editor.current)
      session.current.edit({ document: doc })
      invalid.current = false
    }
    if (invalid.current) throw new Error('A última alteração não pôde ser salva. Desfaça-a ou exporte uma cópia.')
    session.current.save()
  }
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void Promise.resolve().then(() => { try { capture(); blocker.proceed() } catch (cause) { setError(String(cause)); blocker.reset() } })
  })
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { try { capture() } catch { event.preventDefault(); event.returnValue = '' } }
    const online = () => { void queue.current?.reconnect() }
    window.addEventListener('beforeunload', leave); window.addEventListener('online', online)
    return () => { window.removeEventListener('beforeunload', leave); window.removeEventListener('online', online) }
  }, [])
  const ready = (instance: Editor, document: GrapesDocument) => {
    const current = session.current; if (!current) return
    // GrapesJS normalization is part of the migration, not an editorial revision.
    if (isGrapesDocument(current.value.document)) assertPreserved(documentContent(current.value.document), documentContent(document))
    current.value = { ...current.value, document, ...(source.current?.schemaVersion !== 3 ? { cloudSavedRevision: undefined } : {}) }
    current.save(); editor.current = instance
    const persistence = new DraftPersistence(current, async () => {
      const document = current.value.document
      if (!isGrapesDocument(document)) throw new Error('Documento inválido.')
      return compileEmail(document)
    })
    persistence.onChange = refresh; queue.current = persistence; setPersistenceView(persistence)
    if (integration) persistence.configure(integration)
    refresh()
  }
  const changed = (document: GrapesDocument) => {
    try { session.current?.edit({ document }); invalid.current = false; queue.current?.schedule(); setError('') }
    catch (cause) { invalid.current = true; setError(String(cause)) }
  }
  const action = async (work: () => void | Promise<void>) => { setError(''); try { await work() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.') } }
  const openPreview = () => void action(() => {
    capture(); const doc = session.current?.value.document
    if (!isGrapesDocument(doc)) throw new Error('O editor ainda está carregando.')
    setPreview(compileEmail(doc)); setStage('preview')
  })
  const prepareForExternalAction = async () => {
    session.current?.edit({ buttondownTemplate: 'modern' })
    capture()
    if (!queue.current) throw new Error('O salvamento ainda está sendo preparado.')
    await queue.current.flush(true)
    if (!session.current) throw new Error('A edição ainda está carregando.')
    return structuredClone(session.current.value)
  }
  const prepareDelivery = async (audience: { mode: 'all_active' } | { mode: 'selected'; subscriberIds: string[] }) => {
    setPreparedDelivery(null)
    const status = await api.campaignDeliveryStatus()
    if (!status.enabled) throw new Error('O envio de campanhas está desativado neste ambiente. A preparação não está disponível.')
    const latest = await prepareForExternalAction()
    if (!latest.buttondownId || !latest.cloudRevision) throw new Error('Sincronize a edição antes de preparar o envio.')
    const result = await api.campaignDelivery({ action: 'prepare', draftId: latest.id, cloudRevision: latest.cloudRevision, audience })
    if (!result.attemptId || !Number.isSafeInteger(result.recipientCount) || Number(result.recipientCount) < 1 || result.cloudRevision !== latest.cloudRevision || !result.subject || result.audienceMode !== audience.mode || !result.expiresAt || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()) throw new Error('Não foi possível preparar o envio. Tente novamente.')
    if (!session.current || deliveryDraftKey(session.current.value) !== deliveryDraftKey(latest)) throw new Error('A edição mudou durante a preparação. Prepare novamente.')
    setPreparedDelivery({ ...result as import('../types').PreparedCampaignDelivery, draftId: latest.id, draftKey: deliveryDraftKey(latest) })
    setStage('summary')
  }
  const editFromSend = (target: 'subject' | 'content' | 'audience') => {
    if (target === 'subject') setStage('edit')
    else if (target === 'content') setStage('preview')
    else setStage('send')
  }
  const exportOriginal = () => void action(async () => {
    let original = readOriginal(session.current?.value.id || routeId)
    if (!original && integration?.cloud && source.current?.schemaVersion === 3) original = await api.originalDraft(session.current?.value.id || routeId).catch(() => null)
    original ||= source.current
    if (original) download(`cafezinho-original-${original.id}.json`, JSON.stringify(original, null, 2))
    else downloadDraftBackup()
  })
  if (loadError) return <><Link to="/campaigns">← Edições</Link><ErrorState message={loadError} /><Button variant="outline" onClick={exportOriginal}>Exportar original para recuperação</Button></>
  if (!initial || !currentSession) return <LoadingState label="Preparando seu documento no novo editor…" />
  const current = currentSession; const draft = current.value; const busy = persistenceView?.busy || current.syncing
  return <div className={`grapes-page stage-${stage}`}>
    <div className="grapes-page-top"><Link className="back-link" to="/campaigns">← Edições</Link><span role="status">{persistenceView?.label || 'Abrindo canvas…'}</span></div>
    <nav className="editor-stage-nav" aria-label="Etapas da campanha">{[['edit', '1 · Edição'], ['preview', '2 · Prévia'], ['send', '3 · Preparação'], ['summary', '4 · Resumo e envio']].map(([key, label], index) => <button type="button" key={key} className={stage === key ? 'is-active' : ''} disabled={key === 'summary' ? !preparedDelivery || preparedDelivery.draftKey !== deliveryDraftKey(draft) : index > (['edit', 'preview', 'send', 'summary'] as const).indexOf(stage)} onClick={() => setStage(key as typeof stage)}>{label}</button>)}</nav>
    {stage === 'edit' && <div className="grapes-page-heading"><div><p className="eyebrow">MAIS UM CAFEZINHO · ESTÚDIO EDITORIAL</p><input className="subject-input" aria-label="Assunto da newsletter" value={draft.subject} onChange={e => { current.edit({ subject: e.target.value }); queue.current?.schedule() }} /></div><Button onClick={openPreview}>Revisar edição</Button></div>}
    {stage === 'preview' && <div className="grapes-page-heading"><div><p className="eyebrow">ETAPA 02 · PRÉVIA</p><h1>Revise sua edição</h1></div><div className="stage-heading-actions"><Button variant="outline" onClick={() => setStage('edit')}>Voltar à edição</Button><Button onClick={() => setStage('send')}>Continuar para envio</Button></div></div>}
    <details className="grapes-edition-settings"><summary>Detalhes da edição e recuperação</summary><div className="grapes-edition-fields"><Field label="Texto de prévia"><input value={draft.description || ''} maxLength={200} onChange={e => { current.edit({ description: e.target.value }); queue.current?.schedule() }} /></Field><Field label="Data da edição"><input type="date" value={draft.editionDate || ''} onChange={e => { current.edit({ editionDate: e.target.value }); queue.current?.schedule() }} /></Field></div><div className="grapes-recovery-actions"><Button variant="outline" size="sm" disabled={busy || !integration?.connected} onClick={() => void action(async () => { current.edit({ buttondownTemplate: 'modern' }); capture(); await queue.current?.flush(true); setNotice('Rascunho sincronizado. Nenhum e-mail foi enviado.') })}>Sincronizar rascunho</Button><Button variant="quiet" size="sm" onClick={() => void action(() => { capture(); download(`cafezinho-${draft.id}.json`, JSON.stringify(current.value, null, 2)) })}>Exportar documento</Button><Button variant="quiet" size="sm" onClick={exportOriginal}>Exportar original</Button><Button variant="quiet" size="sm" onClick={() => void action(() => { capture(); if (isGrapesDocument(current.value.document)) download('newsletter.html', compileEmail(current.value.document), 'text/html') })}>Exportar HTML</Button></div></details>
    {error && <ErrorState message={error} />}{notice && <p className="success-message" role="status">{notice}</p>}
    <div hidden={stage !== 'edit'}><GrapesEditor document={initial} onReady={ready} onChange={changed} onError={message => { invalid.current = true; setError(message) }} /></div>
    {stage === 'preview' && <section className="grapes-preview"><div className="grapes-preview-heading"><div><p className="eyebrow">PRÉVIA DA EDIÇÃO</p><h2>{draft.subject}</h2></div><div>{['Desktop', 'Mobile'].map(name => <Button key={name} variant="outline" aria-pressed={name === previewDevice} onClick={() => setPreviewDevice(name)}>{name}</Button>)}</div></div><iframe style={{ width: previewDevice === 'Mobile' ? 375 : '100%' }} title="Prévia da edição" sandbox="" referrerPolicy="no-referrer" srcDoc={preview} /><p>Prévia do fragmento HTML sincronizado. A plataforma acrescenta o rodapé de descadastro.</p></section>}
    {stage === 'send' && <SendStage draft={draft} settings={settings} onPrepare={prepareForExternalAction} onEdit={editFromSend} onAdvance={prepareDelivery} />}
    {stage === 'summary' && preparedDelivery && <SendSummary key={preparedDelivery.attemptId} draft={draft} prepared={preparedDelivery} onBack={() => { setPreparedDelivery(null); setStage('send') }} />}

  </div>
}
