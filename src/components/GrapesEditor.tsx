import { useEffect, useRef, useState } from 'react'
import grapesjs, { type Editor, type Component, type Sector, type Property } from 'grapesjs'
import grapesMjml, { type MjmlParser } from 'grapesjs-mjml'
import mjml from 'mjml-browser'
import 'grapesjs/dist/css/grapes.min.css'
import { Button, Field } from './ui'
import { api } from '../lib/api'
import { editorialBlocks, insertBlock, moveBlock, snapshotEditor } from '../lib/grapes-editor'
import { assertPreserved, documentContent } from '../lib/editor-migration'
import { compileEmail } from '../lib/mjml-export'
import { isGrapesDocument, type GrapesDocument, type GrapesComponent } from '../../shared/grapes-document'
import { isSafeEmailBody, safeUrl } from '../../shared/safety'

const mjmlPlugin = typeof grapesMjml === 'function' ? grapesMjml : (grapesMjml as unknown as { default: typeof grapesMjml }).default

type Props = { document: GrapesDocument; onReady: (editor: Editor, document: GrapesDocument) => void; onChange: (document: GrapesDocument) => void; onError: (error: string) => void }
export function GrapesEditor(props: Props) {
  const canvas = useRef<HTMLDivElement>(null); const styles = useRef<HTMLDivElement>(null); const traits = useRef<HTMLDivElement>(null)
  const engine = useRef<Editor | null>(null); const callbacks = useRef(props); useEffect(() => { callbacks.current = props })
  const [undoState, setUndoState] = useState({ undo: false, redo: false })
  const [selected, setSelected] = useState<Component | null>(null); const [tick, setTick] = useState(0)
  const [device, setDevice] = useState('Desktop'); const [savedBlocks, setSavedBlocks] = useState<Array<{ label: string; content: GrapesComponent }>>([])
  const [blockName, setBlockName] = useState(''); const [uploading, setUploading] = useState(false)
  const key = 'mais-um-cafezinho:blocks:v3'
  useEffect(() => {
    if (!canvas.current || !styles.current || !traits.current) return
    let loading = true; let disposed = false
    const editor = grapesjs.init({
      container: canvas.current, height: '100%', width: 'auto', storageManager: false, fromElement: false,
      panels: { defaults: [] }, selectorManager: { componentFirst: true },
      styleManager: { appendTo: styles.current }, traitManager: { appendTo: traits.current },
      assetManager: { upload: false, embedAsBase64: false },
      deviceManager: { devices: [{ id: 'Desktop', name: 'Desktop', width: '' }, { id: 'Mobile', name: 'Mobile', width: '375px' }] },
      parser: { optionsHtml: { allowScripts: false, allowUnsafeAttr: false, allowUnsafeAttrValue: false } },
      plugins: [editor => mjmlPlugin(editor, { blocks: [], resetBlocks: true, resetDevices: false, useCustomTheme: false, hideSelector: true, fonts: {}, mjmlParser: (input, options) => {
        if (typeof input === 'string' && !isSafeEmailBody(input)) throw new Error('Conteúdo inseguro no canvas.')
        return mjml(input as string, { ...options, fonts: {} }) as ReturnType<MjmlParser>
      } })],
    })
    const sectorNames: Record<string, string> = { Dimension: 'Dimensões', Typography: 'Tipografia', Decorations: 'Cores e bordas' }
    const propertyNames: Record<string, string> = { width: 'Largura', height: 'Altura', padding: 'Espaçamento interno', margin: 'Margem', 'font-family': 'Fonte', 'font-size': 'Tamanho da fonte', 'font-weight': 'Peso', 'line-height': 'Entrelinhas', 'letter-spacing': 'Espaço entre letras', color: 'Cor do texto', 'background-color': 'Cor de fundo', 'container-background-color': 'Fundo do bloco', 'text-align': 'Alinhamento', align: 'Alinhamento', border: 'Borda', 'border-radius': 'Cantos' }

    engine.current = editor
    editorialBlocks.forEach(block => editor.Blocks.add(block.id, { label: block.label, content: block.content }))
    const select = () => { setUndoState({ undo: editor.UndoManager.hasUndo(), redo: editor.UndoManager.hasRedo() }); setSelected(editor.getSelected() || null); setTick(value => value + 1) }
    editor.on('component:selected component:deselected component:update:attributes component:update:style undo redo', select)
    editor.on('load', () => {
      if (disposed) return
      try {
        editor.StyleManager.getSectors().forEach((sector: Sector) => { sector.set('name', sectorNames[sector.get('name') || ''] || sector.get('name')); sector.getProperties().forEach((property: Property) => { const label = propertyNames[property.get('property') || '']; if (label) property.set('label', label) }) })
        editor.setComponents(structuredClone(callbacks.current.document.components))
        const normalized = snapshotEditor(editor)
        assertPreserved(documentContent(callbacks.current.document), documentContent(normalized))
        compileEmail(normalized)
        editor.UndoManager.clear(); loading = false
        callbacks.current.onReady(editor, normalized)
        try {
          const stored = JSON.parse(localStorage.getItem(key) || '[]')
          if (Array.isArray(stored)) setSavedBlocks(stored.filter(item => typeof item.label === 'string' && validBlock(item.content)).slice(0, 30))
        } catch { callbacks.current.onError('Não foi possível ler os blocos reutilizáveis.') }
      } catch (cause) { callbacks.current.onError(cause instanceof Error ? cause.message : 'Falha ao abrir o canvas.') }
    })
    editor.on('update', () => {
      if (loading || disposed) return
      try { callbacks.current.onChange(snapshotEditor(editor)); setUndoState({ undo: editor.UndoManager.hasUndo(), redo: editor.UndoManager.hasRedo() }); setTick(value => value + 1) }
      catch (cause) { callbacks.current.onError(cause instanceof Error ? cause.message : 'Falha ao registrar a edição.') }
    })
    return () => { disposed = true; engine.current = null; editor.destroy() }
  }, [])
  const run = (action: (editor: Editor) => void) => { try { if (engine.current) action(engine.current) } catch (e) { props.onError(e instanceof Error ? e.message : 'Não foi possível alterar o bloco.') } }
  const attributes = selected?.getAttributes() || {}; const type = selected?.get('type') || ''
  const setAttr = (name: string, value: string) => run(() => {
    if ((name === 'href' || name === 'src') && !safeUrl(value, name === 'src')) { props.onError('Informe uma URL válida.'); return }
    if (name === 'src') selected?.set('src', value)
    selected?.addAttributes({ [name]: value })
  })
  const saveBlock = () => run(() => {
    if (!selected || !blockName.trim()) return
    const content = selected.toJSON() as GrapesComponent
    if (!validBlock(content)) throw new Error('Este componente não pode ser reutilizado com segurança.')
    const next = [...savedBlocks, { label: blockName.trim().slice(0, 60), content }].slice(-30)
    if (JSON.stringify(next).length > 200_000) throw new Error('A biblioteca atingiu o limite de armazenamento.')
    localStorage.setItem(key, JSON.stringify(next)); setSavedBlocks(next); setBlockName('')
  })
  return <div className="grapes-workbench" data-revision={tick}>
    <aside className="grapes-library"><p className="eyebrow">COMPOR SUA EDIÇÃO</p><h2>Blocos</h2><p className="grapes-help">Arraste para o canvas ou clique para inserir.</p>
      {['Texto', 'Elementos', 'Estrutura', 'Editorial'].map(category => <section key={category}><h3>{category}</h3><div className="grapes-block-grid">{editorialBlocks.filter(b => b.category === category).map(block => <button key={block.id} draggable onDragStart={event => { const editor = engine.current; if (editor) editor.Blocks.startDrag(editor.Blocks.get(block.id), event.nativeEvent) }} onClick={() => run(editor => insertBlock(editor, block.content))}><span aria-hidden="true">{({ title: 'T', paragraph: '¶', image: '▧', button: '↗', columns: '▥', divider: '—', quote: '“', spacer: '↕', section: '▤', header: '▔', signature: '✎', link: '↗' } as Record<string,string>)[block.id]}</span>{block.label}</button>)}</div></section>)}
      <section><h3>Meus blocos</h3>{savedBlocks.map((block, i) => <button className="saved-editor-block" key={i} onClick={() => run(editor => insertBlock(editor, block.content))}>{block.label}</button>)}<p className="grapes-help">Selecione uma composição para guardá-la na biblioteca deste navegador.</p><input aria-label="Nome do bloco reutilizável" value={blockName} onChange={e => setBlockName(e.target.value)} placeholder="Nome da composição" /><Button variant="outline" size="sm" disabled={!selected || !blockName.trim()} onClick={saveBlock}>Salvar bloco</Button></section>
    </aside>
    <section className="grapes-center"><div className="grapes-toolbar"><div><Button size="sm" variant="quiet" disabled={!undoState.undo} onClick={() => run(e => { e.UndoManager.undo(); setTick(v => v + 1) })}>Desfazer</Button><Button size="sm" variant="quiet" disabled={!undoState.redo} onClick={() => run(e => { e.UndoManager.redo(); setTick(v => v + 1) })}>Refazer</Button></div><div>{['Desktop', 'Mobile'].map(name => <button aria-pressed={device === name} key={name} onClick={() => { setDevice(name); engine.current?.setDevice(name) }}>{name}</button>)}</div></div><div ref={canvas} className="grapes-canvas" aria-label="Canvas da newsletter" /></section>
    <aside className="grapes-properties"><p className="eyebrow">AJUSTAR O BLOCO</p><h2>Propriedades</h2><p className="grapes-help">{selected ? 'Edite o texto com dois cliques no canvas.' : 'Selecione um elemento para personalizar.'}</p>
      {selected && !['mj-mjml', 'mj-body'].includes(type) && <><div className="grapes-block-actions"><Button size="sm" variant="outline" onClick={() => run(e => moveBlock(e, -1))}>Subir</Button><Button size="sm" variant="outline" onClick={() => run(e => moveBlock(e, 1))}>Descer</Button><Button size="sm" variant="outline" onClick={() => run(e => { const parent = selected.parent(); if (parent) e.select(parent.append(selected.clone(), { at: selected.index() + 1 })[0]) })}>Duplicar</Button><Button size="sm" variant="quiet" onClick={() => run(() => selected.remove())}>Excluir bloco</Button></div>
      {['mj-image', 'image'].includes(type) && <><Field label="URL da imagem"><input key={`${selected.cid}-src`} defaultValue={attributes.src || ''} onBlur={e => setAttr('src', e.target.value)} /></Field><Field label="Texto alternativo"><input key={`${selected.cid}-alt`} defaultValue={attributes.alt || ''} onBlur={e => setAttr('alt', e.target.value)} /></Field><label className="grapes-upload">{uploading ? 'Enviando imagem…' : 'Carregar imagem'}<input aria-label="Carregar imagem" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; const target = selected; setUploading(true); try { const result = await api.uploadImage(file); if (!safeUrl(result.url, true)) throw new Error('O upload retornou uma URL inválida.'); target.set('src', result.url); target.addAttributes({ src: result.url }) } catch (cause) { props.onError(cause instanceof Error ? cause.message : 'Falha no upload.') } finally { setUploading(false) } }} /></label></>}
      {['mj-button', 'link', 'mj-image'].includes(type) && <Field label="Destino do link"><input key={`${selected.cid}-href`} defaultValue={attributes.href || ''} onBlur={e => setAttr('href', e.target.value)} /></Field>}
      </>}
      <div ref={traits} className="grapes-traits" /><div ref={styles} className="grapes-styles" />
    </aside>
  </div>
}
function validBlock(content: GrapesComponent) { return isGrapesDocument({ type: 'grapesjs', version: 3, format: 'mjml', styles: [], components: [{ type: 'mj-mjml', tagName: 'mjml', components: [content] }] }) }


