import type { EmailEditorRef } from '@react-email/editor'
import { closeHistory } from '@tiptap/pm/history'
type Editor = NonNullable<EmailEditorRef['editor']>
import type { DocumentNode } from '../../shared/safety'

export function assertDocumentSupported(editor: Editor, document: DocumentNode) {
  const check = (node: DocumentNode) => {
    const type = editor.schema.nodes[node.type || '']
    if (!type || Object.keys(node.attrs || {}).some((key) => !(key in (type.spec.attrs || {})))) throw new Error('Este documento usa um bloco ou atributo de outra versão do editor. Exporte uma cópia para recuperação; o original não foi alterado.')
    for (const mark of node.marks || []) {
      const type = editor.schema.marks[mark.type]
      if (!type || Object.keys(mark.attrs || {}).some((key) => !(key in (type.spec.attrs || {})))) throw new Error('O documento usa uma marca de formatação não disponível nesta versão.')
    }
    node.content?.forEach(check)
  }
  check(document)
}

export function currentBlock(editor: Editor) {
  const { selection } = editor.state
  const point = selection.$from
  if ('node' in selection && selection.node) {
    const node = point.parent.child(point.index())
    return { index: point.index(), position: selection.from, node, parent: point.parent }
  }
  let depth = point.depth
  for (let i = 1; i <= point.depth; i++) if (['listItem', 'blockquote', 'button'].includes(point.node(i).type.name)) { depth = i; break }
  while (depth > 0 && !point.node(depth).isBlock) depth--
  if (depth > 0) return { index: point.index(depth - 1), position: point.before(depth), node: point.node(depth), parent: point.node(depth - 1) }
  return null
}

export function documentBlocks(editor: Editor) {
  const blocks: Array<{ position: number; label: string; kind: string }> = []
  const labels: Record<string, string> = { paragraph: 'Parágrafo vazio', heading: 'Título', image: 'Imagem', button: 'Botão', divider: 'Divisória', horizontalRule: 'Divisória', blockquote: 'Citação', table: 'Tabela', bulletList: 'Lista', orderedList: 'Lista numerada' }
  editor.state.doc.descendants((node, position) => {
    if (['container', 'body', 'globalContent'].includes(node.type.name)) return true
    if (node.isBlock) { blocks.push({ position, label: node.textContent.slice(0, 42) || labels[node.type.name] || 'Bloco', kind: node.type.name }); return false }
    return true
  })
  return blocks
}

export function replaceTemplate(editor: Editor, content: string) {
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor.commands.setContent(content)
  editor.view.dispatch(closeHistory(editor.state.tr))
}

export function blockAction(editor: Editor, action: 'up' | 'down' | 'duplicate' | 'delete') {
  const block = currentBlock(editor)
  if (!block) return
  const { index, position, node, parent } = block
  const end = position + node.nodeSize
  const tr = closeHistory(editor.state.tr)
  let nextPosition = position
  if (action === 'duplicate') { tr.insert(end, node.copy(node.content)); nextPosition = end }
  else if (action === 'delete') tr.delete(position, end)
  else if (action === 'up' && index > 0) { nextPosition = position - parent.child(index - 1).nodeSize; tr.delete(position, end).insert(nextPosition, node) }
  else if (action === 'down' && index < parent.childCount - 1) { nextPosition = position + parent.child(index + 1).nodeSize; tr.delete(position, end).insert(nextPosition, node) }
  else return
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor.commands.setTextSelection(Math.max(1, Math.min(nextPosition + 1, editor.state.doc.content.size)))
  editor.commands.focus()
}
