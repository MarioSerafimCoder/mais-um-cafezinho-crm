import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EmailEditor, type EmailEditorRef } from '@react-email/editor'
import { StarterKit } from '@react-email/editor/extensions'
import { EmailTheming, useEditorImage } from '@react-email/editor/plugins'
import '@react-email/editor/themes/default.css'
import { ArrowLeft, ArrowDown, ArrowUp, Copy, Redo2, Save, Trash2, Undo2, UploadCloud } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { getTemplate, templates } from '../data/templates'
import { extractEmailBody, compatibleEmailBody } from '../lib/email'
import { buildEditorialEmail } from '../lib/email-layout'
import { contentQuality } from '../lib/content-quality'
import { TemplatesPage } from './TemplatesPage'
import { CampaignDelivery } from '../components/CampaignDelivery'
import { DeliveryPreparation } from '../components/DeliveryPreparation'
import { downloadDraftBackup, readDrafts, readSettings, writeDraft } from '../lib/storage'
import { DraftSession } from '../lib/draft-session'
import { DraftPersistence } from '../lib/draft-persistence'
import { isEditorDocument, isSafeEmailBody, safeUrl } from '../../shared/safety'
import type { DraftRecord, IntegrationStatus, NewsletterTemplateId } from '../types'
import { Button, ErrorState, Field, LoadingState } from '../components/ui'
import { assertDocumentSupported, blockAction, currentBlock, documentBlocks, replaceTemplate } from '../lib/editor-blocks'

type Editor = NonNullable<EmailEditorRef['editor']>
const dateLabel = (date?: string) => date ? new Date(date).toLocaleString('pt-BR') : 'Ainda não sincronizado'
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const campaignDate = (value?: string | null) => { const date = value ? new Date(value) : new Date(); return Number.isNaN(date.valueOf()) ? localDate() : localDate(date) }

function downloadRecord(draft: DraftRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `cafezinho-${draft.id}.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function EditorPage() {
  const { id = 'new' } = useParams()
  const [params] = useSearchParams()
  if (id === 'new' && !templates.some(template => template.id === params.get('template'))) return <TemplatesPage />
  return <EditorWorkspace key={`${id}:${params.get('template') || ''}`} copyPublished={params.get('copy') === '1'} routeId={id} templateId={params.get('template') as NewsletterTemplateId | null} />
}

function EditorWorkspace({ routeId, templateId, copyPublished }: { routeId: string; templateId: NewsletterTemplateId | null; copyPublished: boolean }) {
  const navigate = useNavigate()
  const ref = useRef<EmailEditorRef | null>(null)
  const sessionRef = useRef<DraftSession | null>(null)
  const [coordinator, setCoordinator] = useState<DraftPersistence | null>(null)
  const persistence = useRef<DraftPersistence | null>(null)
  const htmlExporter = useRef<() => Promise<string>>(async () => '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewRequest = useRef(0)
  const previewSelection = useRef<{ from: number; to: number } | null>(null)
  const captureError = useRef(false)
  const [, refresh] = useReducer((value) => value + 1, 0)
  const [session, setSession] = useState<DraftSession | null>(null)
  const [initial, setInitial] = useState<DraftRecord | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [generation, setGeneration] = useState(0)
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')
  const [recoveryRecord, setRecoveryRecord] = useState<DraftRecord | null>(null)
  const [stage, setStage] = useState<'edit' | 'preview' | 'send'>('edit')
  const [html, setHtml] = useState('')
  const [previewKind, setPreviewKind] = useState<'original' | 'compatible'>('original')
  const [replacement, setReplacement] = useState<NewsletterTemplateId | null>(null)
  const [remoteCopy, setRemoteCopy] = useState<DraftRecord | null>(null)
  const [showHtml, setShowHtml] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(true)
  const deliveryTools = useRef<HTMLElement | null>(null)
  const blocker = useBlocker(() => Boolean(sessionRef.current?.dirty || captureError.current))
  const cancelPending = useCallback(() => { previewRequest.current++; if (timer.current) clearTimeout(timer.current) }, [])

  const install = useCallback((draft: DraftRecord) => {
    if (draft.schemaVersion !== undefined && draft.schemaVersion !== 2) throw new Error('O rascunho usa uma versão mais recente do formato. O original foi preservado para recuperação.')
    if (!isSafeEmailBody(draft.content) || (draft.document && !isEditorDocument(draft.document))) throw new Error('Este rascunho contém marcação não permitida. Exporte uma cópia para recuperação; o original foi preservado.')
    const next = new DraftSession(draft)
    next.onChange = refresh
    sessionRef.current = next; setInitial(draft); setSession(next); setGeneration((value) => value + 1)
    return next
  }, [])

  useEffect(() => {
    let active = true
    let local: DraftRecord | undefined
    let owned: DraftSession | null = null
    void Promise.resolve().then(async () => {
    if (!active) return
    try {
      local = copyPublished ? undefined : readDrafts().find((item) => item.id === routeId || item.buttondownId === routeId)
      if (routeId === 'new') {
        const template = getTemplate(templateId, readSettings())
        const fresh: DraftRecord = { id: `local-${crypto.randomUUID()}`, subject: template.subject, description: template.preheader, buttondownTemplate: template.buttondownTemplate, editionDate: localDate(), content: template.content, templateId: template.id, status: 'draft', updatedAt: new Date().toISOString(), revision: 0 }
        writeDraft(fresh)
        navigate(`/editor/${fresh.id}`, { replace: true })
        return
      }
      if (local) owned = install(local)
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Falha ao abrir o rascunho.'); return }

    await api.status().then(async (status) => {
      if (!active) return
      setIntegration(status)
      if (local) {
        if (status.cloud) {
          try {
            const remote = await api.cloudDraft(local.id)
            if (active && (remote.cloudRevision || 0) > (local.cloudRevision || 0)) {
              const current = sessionRef.current
              if (current && !current.dirty && local.cloudSavedRevision === (local.revision || 0) && current.value.revision === local.revision) {
                writeDraft(remote, current.value); owned = install(remote)
              } else setRemoteCopy(remote)
            }
          } catch (cause) { if (active && !(cause instanceof ApiError && cause.status === 404)) setError('A cópia local está disponível, mas não foi possível conferir a versão na nuvem.') }
        }
        return
      }
      if (status.cloud && !copyPublished) {
        try { const remote = await api.cloudDraft(routeId); if (active) owned = install(remote); return }
        catch (cause) { if (!(cause instanceof ApiError && cause.status === 404)) throw cause }
      }
      if (!status.connected) throw new Error(status.reason || 'Rascunho não encontrado neste navegador. A recuperação remota exige conexão.')
      const campaign = await api.campaign(routeId)
      if (!active) return
      if (campaign.status !== 'draft') {
        const copy: DraftRecord = { id: `local-${crypto.randomUUID()}`, subject: campaign.subject || '', description: campaign.description || '', content: extractEmailBody(campaign.body || ''), templateId: null, buttondownTemplate: 'classic', editionDate: localDate(), status: 'draft', updatedAt: new Date().toISOString(), revision: 0 }
        writeDraft(copy); navigate(`/editor/${copy.id}`, { replace: true }); return
      }
      owned = install({ id: `bd-${campaign.id}`, buttondownId: campaign.id, subject: campaign.subject || '', description: campaign.description || '', buttondownTemplate: campaign.template === 'classic' || campaign.template === 'modern' ? campaign.template : 'modern', editionDate: campaignDate(campaign.publish_date || campaign.creation_date), content: extractEmailBody(campaign.body || ''), templateId: null, status: 'draft', updatedAt: new Date().toISOString(), revision: 0 })
    }).catch((cause: unknown) => {
      if (!active) return
      if (local) { setError('Sem conexão. Continue editando: o salvamento neste navegador permanece disponível.') }
      else setLoadError(cause instanceof Error ? cause.message : 'Não foi possível abrir o rascunho.')
    })
    })
    return () => { active = false; cancelPending(); if (owned) owned.onChange = () => {} }
  }, [routeId, templateId, copyPublished, navigate, install, cancelPending])

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (sessionRef.current?.dirty || captureError.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [])

  const capture = useCallback((editorRef: EmailEditorRef) => {
    try {
      sessionRef.current?.snapshotDocument(editorRef.getJSON())
      captureError.current = false
    } catch (cause) { captureError.current = true; setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o documento.'); throw cause }
  }, [])

  const saveLocal = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (ref.current?.editor) capture(ref.current)
    if (captureError.current) throw new Error('O documento ainda não pôde ser salvo. Exporte uma cópia antes de sair.')
    return sessionRef.current?.save()
  }, [capture])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    try { saveLocal(); blocker.proceed() }
    catch (cause) {
      // The router is an external system: release its blocked transition only after saving.
      // oxlint-disable-next-line react/set-state-in-effect
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); blocker.reset()
    }
  }, [blocker, saveLocal])

  const schedule = useCallback(() => {
    if (persistence.current) { persistence.current.schedule(); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { try { saveLocal() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no salvamento local.') } }, 600)
  }, [saveLocal])
  const onUpdate = useCallback((editorRef: EmailEditorRef) => { try { capture(editorRef); schedule() } catch { /* The document stays in memory and the error is visible. */ } }, [capture, schedule])
  const onReady = useCallback((editorRef: EmailEditorRef) => {
    ref.current = editorRef
    const original = sessionRef.current?.value.document
    try { if (original && editorRef.editor) assertDocumentSupported(editorRef.editor, original) }
    catch (cause) { setRecoveryRecord(sessionRef.current?.value || null); sessionRef.current = null; captureError.current = false; setLoadError(cause instanceof Error ? cause.message : 'Documento incompatível com esta versão.'); return }
    setEditor(editorRef.editor); onUpdate(editorRef)
  }, [onUpdate])
  const attach = useCallback((value: EmailEditorRef | null) => { ref.current = value }, [])

  useEffect(() => {
    if (!editor) return
    const updateSelection = () => refresh()
    editor.on('selectionUpdate', updateSelection)
    return () => { editor.off('selectionUpdate', updateSelection) }
  }, [editor])

  const exportHtml = async () => {
    if (!ref.current?.editor) throw new Error('O editor ainda está carregando.')
    const draft = sessionRef.current?.value
    const settings = readSettings()
    const result = buildEditorialEmail(await ref.current.getEmailHTML(), {
      newsletterName: settings.newsletterName,
      editionLabel: templates.find((item) => item.id === draft?.templateId)?.category || 'NOTAS EDITORIAIS',
      editionDate: draft?.editionDate || '',
      buttondownTemplate: draft?.buttondownTemplate || 'classic',
    })
    if (!isSafeEmailBody(result)) throw new Error('O HTML contém marcação não permitida ou excede o limite. O documento editável continua salvo.')
    return result
  }

  const openPreview = async () => {
    if (editor) {
      const native = window.getSelection()
      if (native?.anchorNode && native.focusNode && editor.view.dom.contains(native.anchorNode) && editor.view.dom.contains(native.focusNode)) {
        const anchor = editor.view.posAtDOM(native.anchorNode, native.anchorOffset)
        const focus = editor.view.posAtDOM(native.focusNode, native.focusOffset)
        previewSelection.current = { from: Math.min(anchor, focus), to: Math.max(anchor, focus) }
      } else previewSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to }
    }
    const request = ++previewRequest.current
    setError('')
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        saveLocal()
        const revision = sessionRef.current?.value.revision
        const result = await exportHtml()
        if (request !== previewRequest.current) return
      if (revision === sessionRef.current?.value.revision) { setHtml(result); setStage('preview'); return }
      }
      throw new Error('O texto mudou durante a geração da prévia. Tente novamente quando terminar a frase.')
    } catch (cause) { if (request === previewRequest.current) setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a prévia.') }
  }

  useEffect(() => { htmlExporter.current = exportHtml })
  const editorReady = Boolean(editor)
  useEffect(() => {
    if (!session || !editorReady) return
    const coordinator = new DraftPersistence(session, () => htmlExporter.current())
    coordinator.onChange = refresh
    persistence.current = coordinator
    void Promise.resolve().then(() => setCoordinator(coordinator))
    const online = () => { void coordinator.reconnect() }
    window.addEventListener('online', online)
    return () => { coordinator.dispose(); persistence.current = null; window.removeEventListener('online', online) }
  }, [session, editorReady])
  useEffect(() => { if (integration) persistence.current?.configure(integration) }, [integration, session, editorReady])

  const sync = async () => {
    if (!persistence.current) return
    setError(''); setNotice('')
    try {
      saveLocal()
      await persistence.current.flush(true)
      const current = sessionRef.current?.value
      setNotice(current?.syncedRevision === current?.revision
        ? 'Edição preparada. Nenhum e-mail foi enviado.'
        : 'A versão anterior foi preparada. As alterações mais recentes estão sendo salvas.')
      await openPreview()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a edição.') }
  }
  const syncForDelivery = async (): Promise<DraftRecord> => {
    let queue = persistence.current
    for (let attempt = 0; attempt < 30 && (!queue || !queue.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      queue = persistence.current
    }
    if (!queue?.status) throw new Error('Não foi possível iniciar a sincronização. Confira a conexão e tente novamente.')
    for (let attempt = 0; attempt < 3; attempt++) {
      saveLocal()
      await queue.flush(true)
      const latest = sessionRef.current?.value
      if (latest?.buttondownId && latest.cloudRevision && Number.isSafeInteger(latest.revision)
        && latest.document && latest.revision === latest.syncedRevision && latest.revision === latest.cloudSavedRevision) {
        const persisted = await api.cloudDraft(latest.id)
        if (persisted.document && persisted.buttondownId === latest.buttondownId
          && persisted.cloudRevision === latest.cloudRevision && persisted.revision === latest.revision
          && persisted.syncedRevision === latest.revision && persisted.cloudSavedRevision === latest.revision
          && persisted.syncedBodyHash === latest.syncedBodyHash) return persisted
      }
    }
    throw new Error('A edição mudou durante a sincronização. Tente preparar novamente.')
  }

  const uploadImage = useCallback(async (file: File) => {
    try { return await api.uploadImage(file) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no upload.'); throw cause }
  }, [])
  const image = useEditorImage({ uploadImage })
  const extensions = useMemo(() => [StarterKit.configure(), EmailTheming.configure({ theme: 'basic' }), image], [image])

  if (loadError) return <><Link to="/campaigns" className="back-link"><ArrowLeft size={15} /> Campanhas</Link><ErrorState message={loadError} /><Button variant="outline" onClick={() => recoveryRecord ? downloadRecord(recoveryRecord) : downloadDraftBackup()}>Exportar dados para recuperação</Button></>
  if (!session || !initial) return <LoadingState label="Abrindo o caderno…" />
  const draft = session.value
  const selected = editor ? currentBlock(editor) : null
  const outline = editor ? documentBlocks(editor).filter(block => block.kind === 'heading').slice(0, 12) : []
  const saveLabel = coordinator?.label || (session.state === 'erro' ? 'Não foi possível salvar — intervenção necessária.' : 'Salvando…')
  const busy = session.syncing || session.cloudSaving || Boolean(coordinator?.busy)

  const run = (action: () => void | Promise<void>) => { setNotice(''); setError(''); void Promise.resolve().then(action).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.')) }
  const insert = (kind: string) => {
    if (!editor) return
    if (kind === 'image') { const input = document.getElementById('image-url'); const panel = input?.closest('details'); if (panel) panel.open = true; input?.focus(); return }
    if (kind === 'button') editor.chain().focus().setButton().run()
    else editor.chain().focus().insertContent(({ paragraph: '<p>Escreva por aqui.</p>', heading: '<h2>Uma nova ideia</h2>', quote: '<blockquote><p>Uma frase que pede uma pausa.</p></blockquote>', divider: '<hr />' } as Record<string, string>)[kind]).run()
  }
  const openDelivery = (kind: 'test' | 'campaign') => {
    setStage('send')
    setError(''); setNotice('')
    void syncForDelivery().then(() => setNotice('Edição salva e sincronizada automaticamente. Nenhum e-mail foi enviado.'))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar a edição para o envio.'))
    requestAnimationFrame(() => {
      const panel = deliveryTools.current
      if (!panel) return
      const target = kind === 'campaign' ? panel.querySelector<HTMLDetailsElement>('.campaign-delivery') : panel.querySelector<HTMLElement>('.test-delivery')
      if (target instanceof HTMLDetailsElement) target.open = true;
      (target?.querySelector('summary, button') as HTMLElement | null)?.focus()
    })
  }
  const returnToEdit = () => {
    setStage('edit')
    requestAnimationFrame(() => {
      if (editor && previewSelection.current) editor.chain().focus().setTextSelection(previewSelection.current).run()
      else editor?.commands.focus()
    })
  }

  return <div className={`editor-page stage-${stage}`}>
    <nav className="editor-stages" aria-label="Etapas da newsletter"><button className={stage === 'edit' ? 'active' : ''} onClick={returnToEdit}>1 · Edição</button><button className={stage === 'preview' ? 'active' : ''} onClick={() => void openPreview()}>2 · Prévia</button><button className={stage === 'send' ? 'active' : ''} onClick={() => openDelivery('campaign')}>3 · Envio</button></nav>
    <div className="editor-topline"><Link className="back-link" to="/campaigns"><ArrowLeft size={15} /> Edições</Link><span className="editor-save-state" data-state={session.state} role="status">{saveLabel}</span><button className="inspector-toggle" type="button" aria-expanded={toolsOpen} aria-controls="editor-inspector" onClick={() => setToolsOpen(value => !value)}>{toolsOpen ? 'Recolher ferramentas' : 'Mostrar ferramentas'}</button></div>
    <div className="editor-heading"><div className="editor-heading-copy"><p className="eyebrow">CADERNO DE EDIÇÃO</p><textarea className="subject-input" rows={1} value={draft.subject} onInput={(event) => { const field = event.currentTarget; field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px` }} onChange={(event) => { session.edit({ subject: event.target.value }); schedule() }} aria-label="Assunto da newsletter" /></div><div className="editor-heading-actions"><Button className="editor-save-sync-button" icon={<span className="editor-save-sync-icon"><Save size={15} /><UploadCloud size={14} /></span>} onClick={() => void sync()} disabled={busy || !integration?.connected}>{busy ? 'Salvando…' : 'Revisar edição'}</Button><Button variant="outline" onClick={() => openDelivery('test')}>Enviar teste</Button><Button variant="outline" onClick={() => openDelivery('campaign')}>Enviar campanha</Button></div></div>
    {(!integration?.connected || !integration.cloud) && <p className="editor-demo-note">{!integration?.connected ? integration?.demo ? 'Demonstração identificada. A sincronização com Buttondown e D1 não está disponível.' : integration?.reason || 'Sem conexão confirmada com a Buttondown. O conteúdo continua salvo neste navegador.' : 'A recuperação entre dispositivos está indisponível. O conteúdo será salvo neste dispositivo.'}</p>}
    {(error || session.error || coordinator?.error) && <div className="editor-inline-error" role="alert">{error || session.error || coordinator?.error}<button onClick={() => { setError(''); session.clearError() }} aria-label="Fechar aviso">×</button></div>}
    {notice && <div className="editor-inline-success" role="status">{notice}</div>}
    {remoteCopy && <div className="editor-demo-note"><span>Há uma versão mais recente na nuvem. Sua cópia local está preservada.</span><Button size="sm" onClick={() => run(() => { downloadRecord(session.value); const remote = { ...remoteCopy, revision: Math.max(draft.revision || 0, remoteCopy.revision || 0) + 1 }; writeDraft(remote, readDrafts().find((item) => item.id === remote.id) || null); install(remote); setRemoteCopy(null) })}>Exportar esta cópia e abrir a versão da nuvem</Button></div>}
    {stage === 'preview' && <section className="editor-stage-page"><p className="eyebrow">ETAPA 02 · PRÉVIA</p><h1>Revise antes de enviar</h1><p className="editor-preview-subject"><strong>Assunto:</strong> {draft.subject}</p><label className="editor-preview-source">Versão que será revisada<select aria-label="Fonte da prévia" value={previewKind} onChange={event => setPreviewKind(event.target.value as 'original' | 'compatible')}><option value="original">HTML original exportado</option><option value="compatible">Fragmento compatível enviado à Buttondown</option></select></label>{contentQuality(html).map(warning => <p role="status" key={warning}>{warning}</p>)}<div className="editor-stage-actions"><Button variant="outline" onClick={returnToEdit}>Voltar à edição</Button><Button onClick={() => openDelivery('campaign')}>Continuar para envio</Button></div><iframe title="Prévia da edição" sandbox="" referrerPolicy="no-referrer" srcDoc={previewKind === 'original' ? html : compatibleEmailBody(html)} /><p className="editor-preview-note">Prévia simulada do HTML exportado. Gmail e Outlook podem alterar fontes e espaçamento. O rodapé de descadastro é acrescentado pela Buttondown.</p>{draft.buttondownId ? <a href={`https://buttondown.com/emails/${encodeURIComponent(draft.buttondownId)}`} target="_blank" rel="noopener noreferrer">Conferir resultado processado na Buttondown (última sincronização)</a> : <p>Resultado processado indisponível: este documento ainda não foi sincronizado.</p>}</section>}
    {stage === 'send' && <section ref={deliveryTools} className="editor-stage-page editor-send-page"><p className="eyebrow">ETAPA 03 · ENVIO</p><h1>Revise o envio</h1><p>Escolha os destinatários e envie. Sua edição é salva e sincronizada automaticamente.</p><div className="editor-stage-actions"><Button variant="outline" onClick={() => void openPreview()}>Voltar à prévia</Button><Button variant="quiet" onClick={returnToEdit}>Voltar à edição</Button></div><CampaignDelivery key={draft.id} draft={draft} onPrepare={syncForDelivery} /><DeliveryPreparation key={draft.id} draft={draft} onPrepare={syncForDelivery} /></section>}
    <div className={`editor-workbench${toolsOpen ? '' : ' tools-closed'}`} hidden={stage !== 'edit'}>
      <section className="editor-center">
        <div className="editor-toolbar"><label className="insert-menu">Inserir bloco <select aria-label="Inserir bloco" value="" onChange={(event) => insert(event.target.value)}><option value="">Escolher…</option><optgroup label="Texto"><option value="paragraph">Parágrafo</option><option value="heading">Título de seção</option><option value="quote">Citação</option></optgroup><optgroup label="Mídia e links"><option value="image">Imagem</option><option value="button">Botão</option></optgroup><optgroup label="Estrutura"><option value="divider">Divisória</option></optgroup></select></label><div className="toolbar-history toolbar-group"><button className="icon-button" aria-label="Desfazer" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></button><button className="icon-button" aria-label="Refazer" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></button></div></div>
        <div className="editor-canvas"><div className="canvas-ruler"><span>EDIÇÃO EM CURSO</span></div><div className="email-editor-container"><EmailEditor key={`${initial.id}:${generation}`} ref={attach} onReady={onReady} onUpdate={onUpdate} content={initial.document || initial.content} extensions={extensions} theme="basic" placeholder="Pressione / para inserir um bloco" /></div></div>
        <div className="editor-canvas-footer"><span>Documento editável em JSON · HTML gerado para prévia e Buttondown</span><button className="html-toggle" onClick={() => run(async () => { setHtml(await exportHtml()); setShowHtml((value) => !value) })}>{showHtml ? 'Fechar HTML' : 'Ver HTML'}</button></div>{showHtml && <pre className="html-output">{html}</pre>}
      </section>
      <aside id="editor-inspector" className="editor-inspector" hidden={!toolsOpen}><div className="inspector-title"><div><p className="eyebrow">FERRAMENTAS</p><h2>Composição</h2></div></div>
        <details className="inspector-section"><summary>Templates</summary><Field label="Ponto de partida"><select value={draft.templateId || ''} disabled={busy} onChange={(event) => setReplacement(event.target.value as NewsletterTemplateId)}><option value="" disabled>Importado / sem template</option>{templates.map((item) => <option value={item.id} key={item.id}>{item.number} · {item.name}</option>)}</select></Field><span className="inspector-hint">A troca pede confirmação e pode ser desfeita.</span></details>
        <details className="inspector-section"><summary>Configurações da edição</summary>
          <Field label="Texto de prévia (preheader)"><input maxLength={200} value={draft.description || ''} disabled={busy} onChange={(event) => { session.edit({ description: event.target.value }); schedule() }} /></Field>
          <Field label="Data da edição"><input type="date" value={draft.editionDate || ''} disabled={busy} onChange={(event) => { session.edit({ editionDate: event.target.value }); schedule() }} /></Field>
          <Field label="Template desta edição na Buttondown"><select aria-label="Template desta edição na Buttondown" value={draft.buttondownTemplate || 'classic'} disabled={busy} onChange={(event) => { session.edit({ buttondownTemplate: event.target.value as 'classic' | 'modern' }); schedule() }}><option value="classic">Classic · conteúdo em primeiro plano (recomendado)</option><option value="modern">Modern · masthead e identidade Buttondown</option></select></Field>
          <span className="inspector-hint">A escolha é enviada somente neste rascunho. Classic mantém o conteúdo editorial à frente; Modern acrescenta masthead, assunto, data e um preâmbulo em inglês. A moldura do CRM se ajusta para evitar repetir marca e cabeçalho.</span>
        </details>
        <section className="inspector-section"><span className="inspector-label">BLOCO SELECIONADO {selected ? `${selected.index + 1} / ${selected.parent.childCount}` : ''}</span><div className="block-actions">{([['up', 'Subir', ArrowUp], ['down', 'Descer', ArrowDown], ['duplicate', 'Duplicar', Copy], ['delete', 'Excluir bloco', Trash2]] as const).map(([action, label, Icon]) => <button key={action} disabled={!editor} onMouseDown={(event) => event.preventDefault()} onClick={() => editor && blockAction(editor, action)}><Icon size={14} />{label}</button>)}</div>
          {editor && <ol className="block-outline" aria-label="Estrutura da edição">{outline.map((block, index) => <li key={block.position}><button aria-current={selected?.position === block.position ? 'true' : undefined} onClick={() => editor.chain().focus().setTextSelection(Math.min(block.position + 1, editor.state.doc.content.size)).scrollIntoView().run()}>{index + 1}. {block.label}</button></li>)}</ol>}
        </section>
        {editor && <MediaControls editor={editor} connected={Boolean(integration?.connected)} disabled={busy} upload={uploadImage} onError={setError} />}
        <details className="inspector-section"><summary>Exportação e recuperação</summary><Button size="sm" variant="outline" disabled={!integration?.cloud || busy} onClick={() => run(async () => { setRemoteCopy(await api.cloudDraft(draft.id)) })}>Conferir versão recuperável</Button><Button size="sm" variant="outline" onClick={() => downloadRecord({ ...session.value, document: ref.current?.getJSON() || session.value.document })}>Exportar documento</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await persistence.current?.reconnect(); await persistence.current?.flush(true) })}>Tentar preparar novamente</Button><span className="inspector-hint">{integration?.cloud ? `Última cópia na nuvem: ${dateLabel(draft.lastCloudSavedAt)}${draft.lastCloudSavedAt && draft.cloudSavedRevision !== draft.revision ? ' · há alterações posteriores' : ''}` : 'Recuperação entre dispositivos exige o banco editorial configurado. A cópia deste navegador continua disponível.'}</span></details>
        <p className="inspector-hint">Envios reais exigem ativação explícita no servidor e permissão de envio na Buttondown. A configuração atual permanece fechada por padrão.</p>
      </aside>
    </div>
    {replacement && <div className="editor-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Trocar template" className="editor-dialog"><h2>Trocar o ponto de partida?</h2><p>O conteúdo, assunto e texto de prévia serão substituídos. Desfazer recupera o conteúdo; o backup exportado também conserva o assunto anterior.</p><Button variant="outline" onClick={() => setReplacement(null)}>Cancelar</Button><Button onClick={() => run(() => { if (!editor) return; downloadRecord(session.value); const template = getTemplate(replacement, readSettings()); replaceTemplate(editor, template.content); session.edit({ subject: template.subject, description: template.preheader, buttondownTemplate: template.buttondownTemplate, templateId: template.id }); capture(ref.current!); schedule(); setReplacement(null) })}>Substituir conteúdo e assunto</Button></section></div>}

  </div>
}

function MediaControls({ editor, connected, disabled, upload, onError }: { editor: Editor; connected: boolean; disabled: boolean; upload: (file: File) => Promise<{ url: string }>; onError: (error: string) => void }) {
  const [image, setImage] = useState<Record<string, unknown> | null>(() => editor.isActive('image') ? editor.getAttributes('image') : null)
  const [src, setSrc] = useState(String(image?.src || ''))
  const [alt, setAlt] = useState(String(image?.alt || ''))
  const [url, setUrl] = useState(String(editor.getAttributes('link').href || editor.getAttributes('button').href || ''))
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const range = useRef({ from: editor.state.selection.from, to: editor.state.selection.to, image: editor.isActive('image'), button: editor.isActive('button') })
  const inspecting = useRef(false)
  const rememberRange = () => {
    if (inspecting.current) return
    let { from, to } = editor.state.selection
    const native = editor.view.dom.ownerDocument.getSelection()
    if (native?.anchorNode && native.focusNode && editor.view.dom.contains(native.anchorNode) && editor.view.dom.contains(native.focusNode)) {
      const anchor = editor.view.posAtDOM(native.anchorNode, native.anchorOffset)
      const focus = editor.view.posAtDOM(native.focusNode, native.focusOffset)
      from = Math.min(anchor, focus); to = Math.max(anchor, focus)
    }
    range.current = { from, to, image: editor.isActive('image'), button: editor.isActive('button') }
    inspecting.current = true
  }
  useEffect(() => {
    const selected = () => {
      if (inspecting.current || !editor.view.hasFocus()) return
      range.current = { from: editor.state.selection.from, to: editor.state.selection.to, image: editor.isActive('image'), button: editor.isActive('button') }
      const attributes = editor.isActive('image') ? editor.getAttributes('image') : null
      setImage(attributes)
      if (attributes) { setSrc(String(attributes.src || '')); setAlt(String(attributes.alt || '')) }
      setUrl(String(editor.getAttributes('link').href || editor.getAttributes('button').href || ''))
    }
    const editing = () => { inspecting.current = false }
    editor.on('selectionUpdate', selected); editor.on('focus', selected)
    editor.view.dom.addEventListener('pointerdown', editing); editor.view.dom.addEventListener('keydown', editing)
    return () => { editor.off('selectionUpdate', selected); editor.off('focus', selected); editor.view.dom.removeEventListener('pointerdown', editing); editor.view.dom.removeEventListener('keydown', editing) }
  }, [editor])
  const restoreRange = () => {
    if (range.current.image) editor.commands.setNodeSelection(range.current.from)
    else editor.commands.setTextSelection({ from: Math.min(range.current.from, editor.state.doc.content.size), to: Math.min(range.current.to, editor.state.doc.content.size) })
  }
  const applyImage = () => {
    if (!safeUrl(src, true)) { onError('Use uma URL HTTPS válida para a imagem.'); return }
    restoreRange()
    if (image) editor.chain().focus().updateAttributes('image', { src, alt }).run()
    else editor.chain().focus().setImage({ src, alt }).run()
  }
  return <div className="media-controls" onMouseDownCapture={rememberRange}>
    <details className="inspector-section" open={Boolean(image)}><summary>{image ? 'Imagem selecionada' : 'Inserir imagem'}</summary><Field label="URL da imagem"><input id="image-url" value={src} onChange={(event) => setSrc(event.target.value)} disabled={disabled} placeholder="https://…" /></Field><Field label="Texto alternativo" hint="Descreva o que a imagem acrescenta. Deixe vazio para uma imagem decorativa."><input value={alt} onChange={(event) => setAlt(event.target.value)} disabled={disabled} /></Field><Button size="sm" variant="outline" disabled={disabled || !src} onClick={applyImage}>{image ? 'Atualizar imagem' : 'Inserir imagem por URL'}</Button><Field label="Enviar arquivo" hint={connected ? 'PNG, JPEG, GIF ou WebP · até 8 MB' : 'Upload exige Buttondown conectada.'}><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={disabled || !connected || uploading} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8_000_000) { onError('A imagem deve ter até 8 MB.'); return } setUploading(true); setUploaded(false); void upload(file).then((result) => { if (!editor.isDestroyed) { setSrc(result.url); setUploaded(true) } }).catch(() => {}).finally(() => setUploading(false)) }} /></Field>{uploaded && <p className="inspector-hint">Upload concluído. Revise o texto alternativo e use Inserir imagem para escolher a posição na edição.</p>}</details>
    <details className="inspector-section"><summary onMouseDown={(event) => event.preventDefault()}>Links e botões</summary><p className="inspector-hint">Selecione o texto ou o botão na edição antes de aplicar o endereço.</p><Field label="Destino do link"><input value={url} onChange={(event) => setUrl(event.target.value)} disabled={disabled} placeholder="https://…" /></Field><Button size="sm" variant="outline" disabled={disabled || !url} onClick={() => { if (!safeUrl(url)) { onError('Use HTTPS, HTTP, mailto ou tel para o link.'); return } restoreRange(); if (range.current.button) editor.chain().focus().updateButton({ href: url }).run(); else if (!editor.state.selection.empty || editor.isActive('link')) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); else onError('Selecione o texto que receberá o link.') }}>Aplicar link</Button><Button size="sm" variant="quiet" disabled={disabled} onClick={() => { restoreRange(); editor.chain().focus().extendMarkRange('link').unsetLink().run() }}>Remover link do texto</Button></details>
  </div>
}
