import { sendTestBatch, type TestResults } from '../lib/test-delivery'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, Mail, Send, X } from 'lucide-react'
import { api } from '../lib/api'
import type { ApiPage, DraftRecord, NewsletterSettings, Subscriber } from '../types'
import { Button, ErrorState, Field } from './ui'

type Audience = { mode: 'all_active' } | { mode: 'selected'; subscriberIds: string[] }
type Props = {
  draft: DraftRecord
  settings: NewsletterSettings
  onPrepare: () => Promise<DraftRecord>
  onEdit: (target: 'subject' | 'content' | 'audience') => void
  onAdvance: (audience: Audience, count: number, recipients: Subscriber[]) => void | Promise<void>
}
type TestDialogProps = { onPrepare: () => Promise<DraftRecord>; onClose: () => void; results: TestResults; onResult: (email: string, result: TestResults[string]) => void }

const pageSize = 25
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SendStage({ draft, settings, onPrepare, onEdit, onAdvance }: Props) {
  const [mode, setMode] = useState<Audience['mode']>('all_active')
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [selected, setSelected] = useState<Record<string, Subscriber>>({})
  const [pages, setPages] = useState<ApiPage<Subscriber> | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [countLoading, setCountLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const loading = mode === 'all_active' ? countLoading : listLoading
  const [countError, setCountError] = useState('')
  const [listError, setListError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [preparationError, setPreparationError] = useState('')
  const testStorageKey = `cafezinho:test-results:${draft.id}`
  const [testResults, setTestResults] = useState<TestResults>(() => {
    const saved = JSON.parse(localStorage.getItem(testStorageKey) || '{}') as TestResults
    return Object.fromEntries(Object.entries(saved).map(([email, result]) => [email, result.state === 'sending' ? { state: 'uncertain', message: 'Sessão interrompida. Consulte o histórico antes de repetir.' } : result]))
  })
  const latestTestResults = useRef(testResults)
  const recordTestResult = (email: string, result: TestResults[string]) => {
    const next = { ...latestTestResults.current, [email]: result }
    localStorage.setItem(testStorageKey, JSON.stringify(next))
    latestTestResults.current = next; setTestResults(next)
  }
  const [testOpen, setTestOpen] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let active = true
    // Loading state belongs to the external subscriber request.
    // oxlint-disable-next-line react/set-state-in-effect
    setCountLoading(true)
    void api.subscribers(1, '', 'active')
      .then(data => { if (active) { setActiveCount(data.count); setCountError('') } })
      .catch((cause: unknown) => { if (active) setCountError(cause instanceof Error ? cause.message : 'Não foi possível consultar os assinantes.') })
      .finally(() => { if (active) setCountLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (mode !== 'selected') return
    let active = true
    // Loading state belongs to the external subscriber request.
    // oxlint-disable-next-line react/set-state-in-effect
    setListLoading(true)
    void api.subscribers(page, search, 'active')
      .then(data => { if (active) { setPages(data); setListError('') } })
      .catch((cause: unknown) => { if (active) setListError(cause instanceof Error ? cause.message : 'Não foi possível carregar os contatos ativos.') })
      .finally(() => { if (active) setListLoading(false) })
    return () => { active = false }
  }, [mode, page, search])

  const contacts = useMemo(() => {
    const rows = pages?.results || []
    return rows.filter((contact, index) => rows.findIndex(item => item.id === contact.id) === index)
  }, [pages])
  const selectedRows = useMemo(() => Object.values(selected).sort((a, b) => a.email_address.localeCompare(b.email_address)), [selected])
  const count = mode === 'all_active' ? activeCount || 0 : selectedRows.length
  const totalPages = Math.max(1, Math.ceil((pages?.count || 0) / pageSize))
  const error = mode === 'selected' ? listError : countError
  const technicalChecks = {
    audience: !loading && !error && count > 0,
    subject: draft.subject.trim().length > 0 && draft.subject.trim().length <= 200,
    content: Boolean(draft.document),
  }
  const senderTechnical = settings.senderName.trim().length > 0 && emailPattern.test(settings.senderEmail.trim())
  const senderConfigurationError = settings.senderEmail.trim().length > 0 && !senderTechnical
  const allTechnicalChecksPassed = technicalChecks.audience && technicalChecks.subject && technicalChecks.content && !senderConfigurationError

  const toggle = (contact: Subscriber) => {
    if (!selected[contact.id] && selectedRows.length >= 500) return
    setSelected(current => {
      if (current[contact.id]) { const next = { ...current }; delete next[contact.id]; return next }
      return { ...current, [contact.id]: contact }
    })
  }
  const technicalMessage = loading ? '' : error || (!technicalChecks.audience ? 'Não há destinatários elegíveis para esta audiência.' : !technicalChecks.subject ? 'Informe um assunto com até 200 caracteres antes de avançar.' : !technicalChecks.content ? 'O documento da edição ainda não está disponível.' : senderConfigurationError ? 'O endereço de referência do remetente é inválido.' : '')

  return <section className="send-stage" aria-label="Etapa 3: envio">
    <div className="send-stage-heading"><div><p className="eyebrow">ETAPA 03 · PREPARAÇÃO</p><h1>Prepare o envio</h1><p>Confira os dados e prepare a campanha. O envio real será confirmado na etapa 4.</p></div><div className="send-stage-actions send-stage-actions-top"><Button variant="outline" onClick={() => onEdit('content')}>Voltar à prévia</Button><Button variant="outline" icon={<Mail size={16} />} onClick={() => setTestOpen(true)}>Enviar email de teste</Button><Button disabled={!allTechnicalChecksPassed || preparing} onClick={() => { if (!allTechnicalChecksPassed || preparing) return; setPreparing(true); setPreparationError(''); void Promise.resolve().then(() => onAdvance(mode === 'all_active' ? { mode } : { mode, subscriberIds: selectedRows.map(contact => contact.id) }, count, selectedRows)).catch(cause => setPreparationError(cause instanceof Error ? cause.message : 'Não foi possível preparar o envio.')).finally(() => setPreparing(false)) }}>{preparing ? 'Preparando campanha…' : 'Preparar envio e ver resumo'}</Button></div></div>
    <div className="send-checklist">
      <ChecklistCard title="Destinatários" ready={technicalChecks.audience} onEdit={() => onEdit('audience')}>
        <fieldset className="send-audience" disabled={loading || preparing}>
          <legend>Escolha a audiência</legend>
          <label className={mode === 'all_active' ? 'is-selected' : ''}><input type="radio" name={`send-audience-${draft.id}`} checked={mode === 'all_active'} onChange={() => setMode('all_active')} /><span><strong>Todos os assinantes</strong><small>Ativos · contagem estimada</small></span><b>{activeCount ?? '—'}</b></label>
          <label className={mode === 'selected' ? 'is-selected' : ''}><input type="radio" name={`send-audience-${draft.id}`} checked={mode === 'selected'} onChange={() => { setListLoading(true); setMode('selected') }} /><span><strong>Escolher contatos</strong><small>Seleção individual</small></span><b>{selectedRows.length}</b></label>
        </fieldset>
        {mode === 'selected' && <div className="send-contact-picker"><Field label="Buscar contatos ativos"><input type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Nome ou e-mail" /></Field><div className="send-contact-list">{contacts.map(contact => <label key={contact.id}><input type="checkbox" checked={Boolean(selected[contact.id])} onChange={() => toggle(contact)} /><span>{typeof contact.metadata?.name === 'string' ? contact.metadata.name : contact.email_address}<small>{contact.email_address}</small></span></label>)}{!contacts.length && <p>Nenhum contato ativo nesta página.</p>}</div><div className="send-pagination"><span>Página {page} de {totalPages}</span><span><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Próxima</button></span></div>{selectedRows.length > 0 && <div className="send-selected"><strong>Selecionados ({selectedRows.length}/500)</strong>{selectedRows.map(contact => <span key={contact.id}>{contact.email_address}</span>)}</div>}</div>}
        <TechnicalStatus valid={technicalChecks.audience}>{technicalChecks.audience ? 'Audiência carregada e com destinatários elegíveis.' : loading ? 'Consultando destinatários elegíveis…' : 'Nenhum destinatário elegível foi encontrado.'}</TechnicalStatus>
      </ChecklistCard>
      <ChecklistCard title="Assunto e remetente" ready={technicalChecks.subject && !senderConfigurationError} onEdit={() => onEdit('subject')}>
        <strong className="send-value">{draft.subject || 'Sem assunto'}</strong>
        <span className="send-value">{settings.senderName || 'Mário Serafim'}{settings.senderEmail ? ` · ${settings.senderEmail}` : ' · endereço configurado na Buttondown'}</span>
        <TechnicalStatus valid={technicalChecks.subject}>{technicalChecks.subject ? 'Assunto preenchido.' : 'Informe um assunto com até 200 caracteres.'}</TechnicalStatus>
        <TechnicalStatus valid={senderTechnical}>{senderTechnical ? 'Endereço de referência disponível; o envio usa o remetente configurado na Buttondown.' : senderConfigurationError ? 'Corrija o endereço de referência do remetente.' : 'O remetente é configurado na Buttondown e não pode ser verificado aqui.'}</TechnicalStatus>
      </ChecklistCard>
      <ChecklistCard title="Conteúdo e prévia" ready={technicalChecks.content} onEdit={() => onEdit('content')}>
        <span className="send-value">O conteúdo será preparado como HTML compatível com a newsletter.</span>
        <TechnicalStatus valid={technicalChecks.content}>{technicalChecks.content ? 'Documento carregado pelo sistema.' : 'Documento pendente.'}</TechnicalStatus>
      </ChecklistCard>
    </div>
    {preparationError && <ErrorState message={preparationError} />}
    {technicalMessage && !loading && <ErrorState message={technicalMessage} />}
    {testOpen && <TestEmailDialog results={testResults} onResult={recordTestResult} onPrepare={onPrepare} onClose={() => setTestOpen(false)} />}
  </section>
}

function TechnicalStatus({ valid, children }: { valid: boolean; children: React.ReactNode }) {
  return <p className={`send-technical-status${valid ? ' is-valid' : ''}`}><span aria-hidden="true">{valid ? '✓' : '!'}</span>{children}</p>
}

function ChecklistCard({ title, ready, onEdit, children }: { title: string; ready: boolean; onEdit?: () => void; children: React.ReactNode }) {
  return <article className={`send-check-card${ready ? ' is-checked' : ''}`}><div className="send-check-card-heading"><span className={`send-check-indicator${ready ? ' is-ready' : ''}`} role="img" aria-label={`${title}: ${ready ? 'pronto' : 'pendente'}`}>{ready ? <CheckCircle2 size={20} /> : <Info size={20} />}</span><div><h2>{title}</h2><div>{children}</div></div>{onEdit && <Button size="sm" variant="outline" onClick={onEdit}>Editar</Button>}</div></article>
}

function TestEmailDialog({ onPrepare, onClose, results, onResult }: TestDialogProps) {
  const [storageError, setStorageError] = useState('')
  const [value, setValue] = useState(() => Object.keys(results).join(', '))
  const [busy, setBusy] = useState(false)
  const emails = value.split(/[;,\n]/).map(email => email.trim().toLowerCase()).filter(Boolean)
  const valid = emails.length > 0 && emails.length <= 30 && emails.every(email => emailPattern.test(email)) && new Set(emails).size === emails.length
  const retryable = emails.filter(email => !results[email] || ['rejected', 'not_sent'].includes(results[email].state))
  const labels = { accepted: 'Aceito pela Buttondown', rejected: 'Não enviado — recusado pelo provedor', not_sent: 'Não enviado — falha na preparação', uncertain: 'Resultado incerto — repetição bloqueada', sending: 'Enviando…' }
  const submit = async () => {
    if (!valid || busy || !retryable.length) return
    setBusy(true); setStorageError('')
    try { await sendTestBatch(emails, results, onPrepare, onResult) }
    catch { setStorageError('Não foi possível registrar o resultado neste navegador. Consulte o histórico antes de repetir.') }
    finally { setBusy(false) }
  }
  return <div className="send-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="send-dialog" role="dialog" aria-modal="true" aria-labelledby="send-test-title"><button className="send-dialog-close" type="button" aria-label="Fechar" onClick={onClose} disabled={busy}><X size={22} /></button><p className="eyebrow">HOMOLOGAÇÃO INDIVIDUAL</p><h2 id="send-test-title">Envio de email de teste</h2><Field label="E-mail para envio do teste" hint="Insira até 30 endereços diferentes separados por vírgula."><textarea aria-label="E-mail para envio do teste" autoFocus disabled={busy} value={value} onChange={event => setValue(event.target.value)} placeholder="email@email.com.br" rows={3} /></Field>{value && !valid && <p className="send-dialog-error" role="alert">Informe até 30 e-mails válidos e sem repetição.</p>}{storageError && <p role="alert">{storageError}</p>}{Object.keys(results).length > 0 && <div aria-live="polite"><p>Resultado por destinatário. Aceitos e resultados incertos não serão repetidos.</p>{(['accepted', 'not_sent', 'rejected', 'uncertain', 'sending'] as const).map(state => { const entries = Object.entries(results).filter(([, result]) => result.state === state); return entries.length ? <section key={state}><h3>{({ accepted: 'Aceitos', not_sent: 'Não enviados', rejected: 'Recusados', uncertain: 'Resultados incertos', sending: 'Em andamento' })[state]}</h3><ul>{entries.map(([email, result]) => <li key={email}><strong>{email}</strong>: {labels[result.state]}{result.message && <small> · {result.message}</small>}</li>)}</ul></section> : null })}</div>}<div className="send-dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button icon={<Send size={15} />} onClick={() => void submit()} disabled={!valid || busy || !retryable.length}>{busy ? 'Enviando…' : Object.keys(results).length ? 'Repetir somente não enviados' : 'Enviar o teste'}</Button></div></section></div>
}

