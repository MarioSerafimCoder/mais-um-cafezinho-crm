import { api, ApiError } from './api'
import type { DraftRecord } from '../types'
export type TestResult = { state: 'accepted' | 'rejected' | 'uncertain' | 'not_sent' | 'sending'; message?: string }
export type TestResults = Record<string, TestResult>
export async function sendTestBatch(emails: string[], previous: TestResults, prepare: () => Promise<DraftRecord>, update: (email: string, result: TestResult, revision?: number) => void, send = api.editorialTest) {
  const targets = emails.filter(email => !previous[email] || ['rejected', 'not_sent'].includes(previous[email].state))
  if (!targets.length) return
  targets.forEach(email => update(email, { state: 'not_sent', message: 'Aguardando preparação ou envio.' }))
  let draft: DraftRecord
  try { draft = await prepare(); if (!draft.buttondownId || !draft.cloudRevision) throw new Error('Sincronize a edição antes de enviar o teste.') }
  catch (error) { targets.forEach(email => update(email, { state: 'not_sent', message: String(error) })); return }
  for (const recipient of targets) {
    update(recipient, { state: 'sending' }, draft.revision || 0)
    let confirming = false
    try {
      const request = { draftId: draft.id, cloudRevision: draft.cloudRevision, recipient }
      const prepared = await send(request)
      if (!prepared.attemptId) throw new Error('Não foi possível preparar este destinatário.')
      confirming = true
      const result = await send({ ...request, attemptId: prepared.attemptId, confirm: true })
      if (!result.accepted) throw new Error('Aceitação não confirmada pelo servidor.')
      update(recipient, { state: 'accepted' }, draft.revision || 0)
    } catch (error) {
      const rejected = error instanceof ApiError && error.providerState === 'rejected'
      const conflict = error instanceof ApiError && error.status === 409
      update(recipient, { state: rejected ? 'rejected' : confirming || conflict ? 'uncertain' : 'not_sent', message: error instanceof Error ? error.message : String(error) }, draft.revision || 0)
    }
  }
}
