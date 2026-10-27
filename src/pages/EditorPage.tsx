import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EmailEditor, type EmailEditorRef } from '@react-email/editor'
import { StarterKit } from '@react-email/editor/extensions'
import { EmailTheming, useEditorImage } from '@react-email/editor/plugins'
import '@react-email/editor/themes/default.css'
import { ArrowLeft, ArrowDown, ArrowUp, Check, Code2, Eye, ImagePlus, LoaderCircle, Monitor, PanelRight, Redo2, Save, Smartphone, TextCursorInput, Trash2, Undo2, Link2, Quote, Minus, Copy, Info, UploadCloud, Type, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { getTemplate, templates } from '../data/templates'
import { extractEmailBody, ensureUnsubscribeLink, validateDraftPayload } from '../lib/email'
import { readDrafts, readSettings, writeDraft } from '../lib/storage'
import type { DraftRecord, IntegrationStatus, NewsletterTemplateId } from '../types'
import { Button, ErrorState, Field, LoadingState, StatusPill } from '../components/ui'

type EditorDraft = DraftRecord & { remoteStatus?: string }
type PreviewDevice = 'desktop' | 'mobile'

function localId() {
  return `local-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`
}

function moveSelectedBlock(ref: EmailEditorRef | null, action: 'up' | 'down' | 'duplicate' | 'delete') {
  const editor = ref?.editor
  if (!editor) return false
  const json = editor.getJSON()
  const blocks = json.content || []
  if (!blocks.length) return false
  let position = 0
  let selected = 0
  for (let index = 0; index < blocks.length; index += 1) {
    const size = editor.state.doc.child(index).nodeSize
    if (editor.state.selection.from >= position && editor.state.selection.from <= position + size) { selected = index; break }
    position += size
  }
  const next = [...blocks]
  if (action === 'delete') next.splice(selected, 1)
  if (action === 'duplicate') next.splice(selected + 1, 0, structuredClone(next[selected]))
  if (action === 'up' && selected > 0) [next[selected - 1], next[selected]] = [next[selected], next[selected - 1]]
  if (action === 'down' && selected < next.length - 1) [next[selected + 1], next[selected]] = [next[selected], next[selected + 1]]
  editor.commands.setContent({ type: 'doc', content: next } as never)
  return true
}

export function EditorPage() {
  const { id: routeId = 'new' } = useParams()
  const [searchParams] = useSearchParams()
  const editorRef = useRef<EmailEditorRef>(null)
  const saveTimer = useRef<number | null>(null)
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [initialContent, setInitialContent] = useState<string | null>(null)
  const [loadedRoute, setLoadedRoute] = useState<string | null>(null)
  const [integration, setIntegration] = useState<IntegrationStatus>({ configured: false, demo: true })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState('Ainda não salvo')
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [subject, setSubject] = useState('')
  const [templateId, setTemplateId] = useState<NewsletterTemplateId | null>(null)
  const [html, setHtml] = useState('')
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [previewing, setPreviewing] = useState(false)
  const [showHtml, setShowHtml] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void api.status().then(async (status) => {
      if (active) setIntegration(status)
      if (routeId === 'new') {
        const template = getTemplate(searchParams.get('template') as NewsletterTemplateId | null, readSettings())
        const fresh: EditorDraft = { id: localId(), subject: template.subject, content: template.content, templateId: template.id, status: 'draft', updatedAt: new Date().toISOString() }
        if (active) { setDraft(fresh); setSubject(fresh.subject); setTemplateId(fresh.templateId); setInitialContent(fresh.content); setLoadError(''); setLoadedRoute(routeId) }
        return
      }
      const localDraft = readDrafts().find((item) => item.id === routeId)
      if (localDraft) {
        if (active) { setDraft(localDraft); setSubject(localDraft.subject); setTemplateId(localDraft.templateId); setInitialContent(localDraft.content); setLoadError(''); setLoadedRoute(routeId) }
        return
      }
      if (routeId.startsWith('demo-')) {
        if (active) { setLoadError('Esta edição de demonstração é somente leitura. Duplique-a para começar um rascunho.'); setLoadedRoute(routeId) }
        return
      }
      const campaign = await api.campaign(routeId)
      if (!active) return
      if (campaign.status !== 'draft') {
        setLoadError('Só rascunhos podem ser editados por este painel.')
        setLoadedRoute(routeId)
        return
      }
      const body = extractEmailBody(campaign.body || '')
      const record: EditorDraft = { id: localId(), buttondownId: campaign.id, subject: campaign.subject || '', content: body, templateId: null, status: 'draft', updatedAt: new Date().toISOString(), remoteStatus: campaign.status }
      writeDraft(record)
      setDraft(record); setSubject(record.subject); setInitialContent(body); setLoadError(''); setLoadedRoute(routeId)
    }).catch((cause: unknown) => {
      if (active) { setLoadError(cause instanceof Error ? cause.message : 'Não foi possível abrir este rascunho.'); setLoadedRoute(routeId) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [routeId, searchParams])

  const persistLocal = useCallback(async (ref: EmailEditorRef | null = editorRef.current) => {
    if (!draft || !ref?.editor) return
    try {
      const exported = await ref.getEmailHTML()
      const content = extractEmailBody(exported)
      const next: EditorDraft = { ...draft, subject, content, templateId, updatedAt: new Date().toISOString() }
      writeDraft(next)
      setSaveState(`Salvo neste navegador · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`)
    } catch {
      setSaveState('Rascunho local não foi salvo')
    }
  }, [draft, subject, templateId])

  const scheduleAutosave = useCallback((ref: EmailEditorRef) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setSaveState('Salvando…')
    saveTimer.current = window.setTimeout(() => { void persistLocal(ref) }, 700)
  }, [persistLocal])

  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }, [])

  useEffect(() => {
    if (editorRef.current) scheduleAutosave(editorRef.current)
  }, [subject, templateId, scheduleAutosave])

  const exportHtml = useCallback(async () => {
    const raw = await editorRef.current?.getEmailHTML()
    if (!raw) return ''
    return ensureUnsubscribeLink(raw)
  }, [])

  const setPreview = async (next: boolean) => {
    if (next) {
      setBusy(true)
      try { setHtml(await exportHtml()); setPreviewing(true) }
      catch { setSaveError('Não foi possível gerar a prévia.'); }
      finally { setBusy(false) }
    } else setPreviewing(false)
  }

  const handleSaveLocal = async () => {
    setBusy(true); setSaveError('')
    try { await persistLocal(); setNotice('Rascunho salvo neste navegador.') }
    finally { setBusy(false) }
  }

  const handleSaveButtondown = async () => {
    if (!integration.configured) { setSaveError('Configure BUTTONDOWN_API_KEY no Cloudflare Pages para sincronizar.'); return }
    setBusy(true); setSaveError(''); setNotice('')
    try {
      const raw = await editorRef.current?.getEmailHTML()
      if (!raw) throw new Error('O editor ainda está carregando.')
      const payload = validateDraftPayload(subject, ensureUnsubscribeLink(raw))
      const saved = await api.saveDraft({ id: draft?.buttondownId, subject: payload.subject, body: payload.body })
      if (!draft) return
      const next: EditorDraft = { ...draft, buttondownId: saved.id, subject: payload.subject, content: extractEmailBody(raw), templateId, updatedAt: new Date().toISOString(), remoteStatus: 'draft' }
      writeDraft(next); setDraft(next); setSaveState('Sincronizado com Buttondown'); setNotice('Rascunho salvo na Buttondown. Nenhum envio foi feito.')
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar o rascunho.')
    } finally { setBusy(false) }
  }

  const insertHtml = (content: string) => editorRef.current?.editor?.chain().focus().insertContent(content).run()
  const addImage = () => {
    const value = window.prompt('Cole a URL pública HTTPS da imagem:')
    if (!value) return
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:') throw new Error()
      editorRef.current?.editor?.chain().focus().setImage({ src: url.href, alt: 'Imagem da newsletter' }).run()
      setSaveError('')
    } catch { setSaveError('Use uma URL pública que comece com https://.') }
  }

  const handleImageUpload = useCallback(async (file: File) => {
    try {
      const status = await api.status()
      if (!status.configured) throw new Error('Envio de arquivos exige Buttondown configurada. Use “Imagem por URL” no modo demonstração.')
      return await api.uploadImage(file)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Não foi possível enviar a imagem.')
      throw cause
    }
  }, [])

  const imageExtension = useEditorImage({ uploadImage: handleImageUpload })
  const editorExtensions = useMemo(() => [
    StarterKit.configure(),
    EmailTheming.configure({ theme: 'basic' }),
    imageExtension,
  ], [imageExtension])

  if (loading || loadedRoute !== routeId) return <LoadingState label="Abrindo o caderno…" />
  if (loadError) return <><Link className="back-link" to="/campaigns"><ArrowLeft size={15} /> Voltar às campanhas</Link><ErrorState message={loadError} /></>
  if (!draft || initialContent === null) return <ErrorState message="O rascunho não pôde ser carregado." />

  return <div className="editor-page">
    <div className="editor-topline"><Link className="back-link" to="/campaigns"><ArrowLeft size={15} /> Campanhas</Link><div className="editor-save-state"><span className="autosave-dot" />{saveState}</div></div>
    <div className="editor-heading"><div><p className="eyebrow">CADERNO DE EDIÇÃO {draft.buttondownId ? '· BUTTONDOWN' : '· LOCAL'}</p><input className="subject-input" value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Assunto da newsletter" placeholder="Assunto da newsletter" /><span className="editor-caption">O assunto será exibido na caixa de entrada.</span></div><div className="editor-heading-actions"><Button variant="outline" onClick={handleSaveLocal} icon={<Save size={15} />} disabled={busy}>Salvar local</Button><Button onClick={handleSaveButtondown} icon={busy ? <LoaderCircle className="spin" size={15} /> : <UploadCloud size={15} />} disabled={busy || !integration.configured} title={integration.configured ? 'Salvar como rascunho' : 'Configure Buttondown nas configurações'}>Salvar rascunho lá</Button></div></div>
    {!integration.configured && <div className="editor-demo-note"><Info size={15} /><span>Modo demonstração: salvamento local e prévia funcionam. Configure Buttondown para sincronizar e enviar imagens.</span></div>}
    {saveError && <div className="editor-inline-error" role="alert">{saveError}<button onClick={() => setSaveError('')} aria-label="Fechar aviso">×</button></div>}
    {notice && <div className="editor-inline-success" role="status"><Check size={15} />{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    <div className="editor-workbench">
      <section className="editor-center">
        <div className="editor-toolbar"><div className="toolbar-group"><button className="toolbar-button" onClick={() => insertHtml('<h2>Nova seção</h2><p>Comece a escrever por aqui.</p>')}><Type size={15} /><span>Seção</span></button><button className="toolbar-button" onClick={() => insertHtml('<p>Novo parágrafo. Desenvolva a ideia com calma.</p>')}><TextCursorInput size={15} /><span>Texto</span></button><button className="toolbar-button" onClick={() => editorRef.current?.editor?.chain().focus().setButton().run()}><Link2 size={15} /><span>Botão</span></button><button className="toolbar-button" onClick={addImage}><ImagePlus size={15} /><span>Imagem</span></button><button className="toolbar-button" onClick={() => insertHtml('<hr />')}><Minus size={15} /><span>Divisória</span></button><button className="toolbar-button" onClick={() => insertHtml('<blockquote><p>Um destaque, uma frase, uma pausa.</p></blockquote>')}><Quote size={15} /><span>Destaque</span></button></div><div className="toolbar-group toolbar-history"><button className="icon-button" aria-label="Desfazer" onClick={() => editorRef.current?.editor?.chain().focus().undo().run()}><Undo2 size={16} /></button><button className="icon-button" aria-label="Refazer" onClick={() => editorRef.current?.editor?.chain().focus().redo().run()}><Redo2 size={16} /></button></div></div>
        <div className={`editor-canvas${previewing ? ' is-preview' : ''}`}>
          <div className="canvas-ruler"><span>{previewing ? 'PRÉVIA DA NEWSLETTER' : 'EDIÇÃO EM CURSO'}</span><div className="canvas-view-actions"><button className={!previewing ? 'selected' : ''} onClick={() => void setPreview(false)}><PenLineIcon />Escrever</button><button className={previewing ? 'selected' : ''} onClick={() => void setPreview(true)}><Eye size={14} />Prévia</button></div></div>
          {previewing ? <div className={`email-preview-frame ${previewDevice}`}><iframe title="Prévia da newsletter" sandbox="" referrerPolicy="no-referrer" srcDoc={html} /></div> : <div className="email-editor-container"><EmailEditor key={draft.id + initialContent.slice(0, 20)} ref={(ref) => { editorRef.current = ref; if (ref) scheduleAutosave(ref) }} onReady={(ref) => { editorRef.current = ref; scheduleAutosave(ref) }} onUpdate={scheduleAutosave} extensions={editorExtensions} content={initialContent} theme="basic" placeholder="Pressione / para inserir um bloco" /></div>}
          {previewing && <div className="preview-device-controls"><span>Visualizar em</span><button className={previewDevice === 'desktop' ? 'active' : ''} onClick={() => setPreviewDevice('desktop')}><Monitor size={14} />Desktop</button><button className={previewDevice === 'mobile' ? 'active' : ''} onClick={() => setPreviewDevice('mobile')}><Smartphone size={14} />Celular</button></div>}
        </div>
        <div className="editor-canvas-footer"><span><span className="autosave-dot" />Salvo automaticamente neste navegador</span><span>HTML responsivo · descadastro Buttondown incluído</span></div>
      </section>
      <aside className="editor-inspector">
        <div className="inspector-title"><div><p className="eyebrow">FERRAMENTAS</p><h2>Composição</h2></div><PanelRight size={16} /></div>
        <div className="inspector-section"><span className="inspector-label">PONTO DE PARTIDA</span><Field label="Template"><select value={templateId || ''} onChange={(event) => {
          const nextId = event.target.value as NewsletterTemplateId
          const template = getTemplate(nextId, readSettings())
          if (!template || !editorRef.current?.editor) return
          editorRef.current.editor.commands.setContent(template.content)
          setSubject(template.subject); setTemplateId(nextId); setSaveError('')
        }}><option value="">Em branco / importado</option>{templates.map((item) => <option value={item.id} key={item.id}>{item.number} · {item.name}</option>)}</select></Field><div className="template-selection-note">O template substitui o conteúdo atual. Use desfazer para recuperar.</div></div>
        <div className="inspector-section"><span className="inspector-label">ADICIONAR BLOCO</span><button className="inspector-action" onClick={() => insertHtml('<h2>Uma nova ideia</h2><p>Escreva o que você quer dividir com o leitor.</p>')}><span><Type size={15} />Título e texto</span><span>+</span></button><button className="inspector-action" onClick={() => editorRef.current?.editor?.chain().focus().setButton().run()}><span><Link2 size={15} />Botão com link</span><span>+</span></button><button className="inspector-action" onClick={addImage}><span><ImagePlus size={15} />Imagem por URL</span><span>+</span></button><button className="inspector-action" onClick={() => insertHtml('<blockquote><p>Um trecho para ficar na memória.</p></blockquote>')}><span><Quote size={15} />Destaque autoral</span><span>+</span></button><button className="inspector-action" onClick={() => insertHtml('<hr />')}><span><Minus size={15} />Divisória</span><span>+</span></button></div>
        <div className="inspector-section"><span className="inspector-label">BLOCO ATUAL</span><div className="block-actions"><button onClick={() => moveSelectedBlock(editorRef.current, 'up')} title="Mover bloco para cima"><ArrowUp size={14} /><span>Subir</span></button><button onClick={() => moveSelectedBlock(editorRef.current, 'down')} title="Mover bloco para baixo"><ArrowDown size={14} /><span>Descer</span></button><button onClick={() => moveSelectedBlock(editorRef.current, 'duplicate')} title="Duplicar bloco"><Copy size={14} /><span>Duplicar</span></button><button onClick={() => moveSelectedBlock(editorRef.current, 'delete')} title="Remover bloco"><Trash2 size={14} /><span>Remover</span></button></div><span className="inspector-hint">Clique dentro do bloco antes de usar as ações.</span></div>
        <div className="inspector-bottom"><div className="safe-note"><ShieldCheckIcon /><p>Sem botão de envio em produção. Esta edição só vira um rascunho até a próxima etapa.</p></div><button className="html-toggle" onClick={() => setShowHtml((value) => !value)}><Code2 size={14} />{showHtml ? 'Fechar HTML' : 'Ver HTML de saída'}</button>{showHtml && <pre className="html-output">{html || 'Abra a prévia para gerar o HTML completo.'}</pre>}</div>
      </aside>
    </div>
    <div className="editor-bottom-bar"><span><StatusPill tone={integration.configured ? 'success' : 'warning'}>{integration.configured ? 'BUTTONDOWN PRONTA' : 'MODO DEMONSTRAÇÃO'}</StatusPill><span className="safe-footer-copy">Ação disponível: salvar rascunho. Envio real permanece desativado.</span></span><div><Button variant="quiet" size="sm" onClick={() => void handleSaveLocal()} disabled={busy}>Salvar local</Button><Button size="sm" onClick={() => void handleSaveButtondown()} disabled={busy || !integration.configured}>Salvar rascunho lá</Button></div></div>
  </div>
}

function PenLineIcon() { return <TextCursorInput size={14} /> }
function ShieldCheckIcon() { return <ShieldCheck size={15} /> }
