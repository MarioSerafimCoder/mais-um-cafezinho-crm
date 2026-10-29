import type { Editor, Component } from 'grapesjs'
import type { GrapesComponent, GrapesDocument } from '../../shared/grapes-document'
import { isGrapesDocument } from '../../shared/grapes-document'
import { mj, textDefaults } from './editor-migration'

export const editorialBlocks = [
  { id: 'title', label: 'Título', category: 'Texto', content: mj('mj-text', { ...textDefaults, 'font-family': 'Georgia, serif', 'font-size': '32px' }, [], '<h2 style="margin:0;font-weight:400">Uma nova ideia</h2>') },
  { id: 'paragraph', label: 'Parágrafo', category: 'Texto', content: mj('mj-text', textDefaults, [], '<p style="margin:0">Escreva por aqui.</p>') },
  { id: 'link', label: 'Link', category: 'Texto', content: mj('mj-text', textDefaults, [], '<p><a href="https://marioserafim.com.br" style="color:#b52930">Continuar a leitura</a></p>') },
  { id: 'quote', label: 'Citação', category: 'Texto', content: mj('mj-text', { ...textDefaults, 'container-background-color': '#f6f2ef', padding: '18px', color: '#b52930' }, [], '<blockquote style="margin:0">Uma frase que merece uma pausa.</blockquote>') },
  { id: 'image', label: 'Imagem', category: 'Elementos', content: mj('mj-image', { src: 'https://placehold.co/600x300/f2f0ed/171717.png?text=Sua+imagem', alt: 'Sua imagem', padding: '12px 0' }) },
  { id: 'button', label: 'Botão', category: 'Elementos', content: mj('mj-button', { href: 'https://marioserafim.com.br', 'background-color': '#b52930', color: '#ffffff', 'font-family': 'Arial', 'font-size': '16px', padding: '18px 0', 'inner-padding': '14px 22px', 'border-radius': '3px' }, [], 'Saiba mais') },
  { id: 'divider', label: 'Separador', category: 'Elementos', content: mj('mj-divider', { 'border-color': '#dedbd7', 'border-width': '1px', padding: '22px 0' }) },
  { id: 'spacer', label: 'Espaçador', category: 'Elementos', content: mj('mj-spacer', { height: '24px' }) },
  { id: 'section', label: 'Seção', category: 'Estrutura', content: mj('mj-section', { padding: '24px', 'background-color': '#ffffff' }, [mj('mj-column', {}, [mj('mj-text', textDefaults, [], 'Uma nova seção')])]) },
  { id: 'columns', label: 'Duas colunas', category: 'Estrutura', content: mj('mj-section', { padding: '20px', 'background-color': '#ffffff' }, [mj('mj-column', { width: '50%' }, [mj('mj-text', textDefaults, [], 'Primeira coluna')]), mj('mj-column', { width: '50%' }, [mj('mj-text', textDefaults, [], 'Segunda coluna')])]) },
  { id: 'header', label: 'Cabeçalho', category: 'Editorial', content: mj('mj-section', { 'background-color': '#171717', padding: '26px' }, [mj('mj-column', {}, [mj('mj-text', { color: '#ffffff', 'font-family': 'Georgia, serif', 'font-size': '28px' }, [], 'Mais um Cafezinho'), mj('mj-divider', { 'border-color': '#b52930', width: '36px', align: 'left' })])]) },
  { id: 'signature', label: 'Assinatura', category: 'Editorial', content: mj('mj-text', textDefaults, [], '<p>Até a próxima,<br><strong>Mário Serafim</strong> · Diretor de arte.</p><p><a href="https://marioserafim.com.br" style="color:#b52930">Portfólio</a> · <a href="https://marioserafim.com.br/blog" style="color:#b52930">Blog</a></p>') },
]
export function snapshotEditor(editor: Editor): GrapesDocument {
  const serialize = (component: Component): GrapesComponent => {
    const raw = component.toJSON() as GrapesComponent
    const result: GrapesComponent = {}
    // Persist native semantic model fields; UI traits, toolbars and scripts never cross storage.
    for (const field of ['type', 'tagName', 'content', 'attributes', 'style', 'classes', 'name', 'void', 'src'] as const) if (raw[field] !== undefined) Object.assign(result, { [field]: raw[field] })
    if (component.get('type') !== 'textnode') result.tagName = component.get('tagName')
    if (component.components().length) result.components = component.components().map(serialize)
    // GrapesJS may store HTML styles in CSS Composer rules. Resolve those rules
    // onto their own component so the persisted document has no head dependency.
    const style = component.getStyle()
    if (Object.keys(style).length) result.style = style as Record<string, string | number>
    return result
  }
  const document: GrapesDocument = { type: 'grapesjs', version: 3, format: 'mjml', components: editor.getComponents().map(serialize), styles: [] }
  if (!isGrapesDocument(document)) throw new Error('O bloco contém atributos não permitidos. Desfaça a última alteração para continuar salvando.')
  return document
}
export function insertBlock(editor: Editor, content: GrapesComponent) {
  const structure = ['mj-section', 'mj-wrapper'].includes(content.type || '')
  let selected = editor.getSelected()
  while (selected && selected.get('type') !== (structure ? 'mj-body' : 'mj-column')) selected = selected.parent()
  const destination = selected || editor.getWrapper()?.findType(structure ? 'mj-body' : 'mj-column').at(-1)
  if (!destination) throw new Error('Selecione uma coluna para inserir o bloco.')
  const added = destination.append(structuredClone(content))[0]; editor.select(added)
}
export function moveBlock(editor: Editor, direction: -1 | 1) {
  const selected = editor.getSelected(); const parent = selected?.parent()
  if (!selected || !parent || ['mj-mjml', 'mj-body'].includes(selected.get('type') || '')) return
  const index = selected.index(); const target = index + direction
  if (target >= 0 && target < parent.components().length) selected.move(parent, { at: target })
}

