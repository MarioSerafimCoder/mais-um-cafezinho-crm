import { isEditorDocument, isSafeEmailBody } from '../../shared/safety'
import type { DraftRecord } from '../types'
import { isGrapesDocument } from '../../shared/grapes-document'
import { readDrafts } from './storage'

export function importRecoveryCopies(text: string) {
  if (text.length > 5_000_000) throw new Error('O backup excede o limite de 5 MB.')
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('O arquivo não contém JSON válido. O original não foi alterado.') }
  const values = Array.isArray(data) ? data : [data]
  if (!values.length || values.length > 1000) throw new Error('O backup precisa conter entre 1 e 1000 rascunhos.')
  const recovered: DraftRecord[] = values.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Há um rascunho inválido no arquivo.')
    const draft = item as DraftRecord
    if (typeof draft.subject !== 'string' || typeof draft.content !== 'string' || !isSafeEmailBody(draft.content) || (draft.document && !isEditorDocument(draft.document) && !isGrapesDocument(draft.document))) throw new Error('Há um documento inválido ou marcação perigosa no backup.')
    return { id: `local-${crypto.randomUUID()}`, subject: `${draft.subject} — recuperado`, description: draft.description, buttondownTemplate: draft.buttondownTemplate, editionDate: draft.editionDate, content: draft.content, document: draft.document ? structuredClone(draft.document) : undefined, schemaVersion: isGrapesDocument(draft.document) ? 3 : draft.document ? 2 : undefined, templateId: ['blog', 'curadoria', 'especial', 'carta', 'bastidores', 'convite'].includes(draft.templateId || '') ? draft.templateId : null, status: 'draft', revision: 0, updatedAt: new Date().toISOString() }
  })
  const existing = readDrafts()
  // Validate every record before one atomic write; never replace an existing id.
  localStorage.setItem('mais-um-cafezinho:drafts:v1', JSON.stringify([...recovered, ...existing]))
  return recovered.length
}
