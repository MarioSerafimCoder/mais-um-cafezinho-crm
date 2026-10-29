import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Info, Mail, Send, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import type { ApiPage, DraftRecord, NewsletterSettings, Subscriber } from '../types'
import { Button, ErrorState, Field } from './ui'

type Audience = { mode: 'all_active' } | { mode: 'selected'; subscriberIds: string[] }
type Props = {
  draft: DraftRecord
  settings: NewsletterSettings
  onPrepare: () => Promise<DraftRecord>
  onEdit: (target: 'subject' | 'content' | 'audience') => void
  onAdvance: (audience: Audience, count: number, recipients: Subscriber[]) => void
}
type TestDialogProps = { onPrepare: () => Promise<DraftRecord>; onClose: () => void }

const pageSize = 25
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SendStage({ draft, settings, onPrepare, onEdit, onAdvance }: Props) {
  const [mode, setMode] = useState<Audience['mode']>('all_active')
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [selected, setSelected] = useState<Record<string, Subscriber>>({})
  const [pages, setPages] = useState<{ regular: ApiPage<Subscriber>; premium: ApiPage<Subscriber> } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [testOpen, setTestOpen] = useState(false)
  const [checked, setChecked] = useState({ audience: false, subject: false, sender: false, content: false })

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let active = true
    // Loading state belongs to the external subscriber request.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true)
    void Promise.all([api.subscribers(1, '', 'regular'), api.subscribers(1, '', 'premium')])
      .then(([regular, premium]) => { if (active) setActiveCount((regular.count || 0) + (premium.count || 0)) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os assinantes.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (mode !== 'selected') return
    let active = true
    // Loading state belongs to the external subscriber request.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true)
    void Promise.all([api.subscribers(page, search, 'regular'), api.subscribers(page, search, 'premium')])
      .then(([regular, premium]) => { if (active) setPages({ regular, premium }) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os contatos ativos.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [mode, page, search])

  const contacts = useMemo(() => {
    const rows = [...(pages?.regular.results || []), ...(pages?.premium.results || [])]
    return rows.filter((contact, index) => rows.findIndex(item => item.id === contact.id) === index)
  }, [pages])
  const selectedRows = useMemo(() => Object.values(selected).sort((a, b) => a.email_address.localeCompare(b.email_address)), [selected])
  const count = mode === 'all_active' ? activeCount || 0 : selectedRows.length
  const totalPages = Math.max(1, Math.ceil(Math.max(pages?.regular.count || 0, pages?.premium.count || 0) / pageSize))
  // A valid audience and a loaded document are already verified by the CRM.
  // Requiring a second click on the audience check left the primary action
  // disabled even when recipients were selected.
  const automaticallyChecked = {
    audience: count > 0,
    subject: draft.subject.trim().length > 0,
    sender: true,
    content: Boolean(draft.document),
  }
  const effectiveChecked = {
    audience: automaticallyChecked.audience || checked.audience,
    subject: automaticallyChecked.subject || checked.subject,
    sender: automaticallyChecked.sender || checked.sender,
    content: automaticallyChecked.content || checked.content,
  }
  const allChecked = count > 0 && automaticallyChecked.subject && automaticallyChecked.content && Object.values(effectiveChecked).every(Boolean)

  const toggle = (contact: Subscriber) => setSelected(current => {
    if (current[contact.id]) { const next = { ...current }; delete next[contact.id]; return next }
    if (selectedRows.length >= 500) return current
    return { ...current, [contact.id]: contact }
  })
  const check = (key: keyof typeof checked) => setChecked(current => ({ ...current, [key]: !current[key] }))

  return <section className="send-stage" aria-label="Etapa 3: envio">
    <div className="send-stage-heading"><div><p className="eyebrow">ETAPA 03 · ENVIO</p><h1>Revise o envio</h1><p>Confira a audiência e os dados da edição antes de avançar para o resumo.</p></div><div className="send-stage-actions send-stage-actions-top"><Button variant="outline" onClick={() => onEdit('content')}>Voltar à prévia</Button><Button variant="outline" icon={<Mail size={16} />} onClick={() => setTestOpen(true)}>Enviar email de teste</Button><Button disabled={!allChecked || loading} onClick={() => onAdvance(mode === 'all_active' ? { mode } : { mode, subscriberIds: selectedRows.map(contact => contact.id) }, count, selectedRows)}>Avançar</Button></div></div>
    <div className="send-checklist">
      <ChecklistCard title="Destinatários" icon={<Users size={20} />} checked={effectiveChecked.audience} onCheck={() => check('audience')} onEdit={() => onEdit('audience')}>
        <fieldset className="send-audience" disabled={loading}>
          <legend>Escolha a audiência</legend>
          <label className={mode === 'all_active' ? 'is-selected' : ''}><input type="radio" name={`send-audience-${draft.id}`} checked={mode === 'all_active'} onChange={() => { setMode('all_active'); setChecked(current => ({ ...current, audience: false })) }} /><span><strong>Todos os assinantes</strong><small>Ativos e elegíveis</small></span><b>{activeCount ?? '—'}</b></label>
          <label className={mode === 'selected' ? 'is-selected' : ''}><input type="radio" name={`send-audience-${draft.id}`} checked={mode === 'selected'} onChange={() => { setMode('selected'); setChecked(current => ({ ...current, audience: false })) }} /><span><strong>Escolher contatos</strong><small>Seleção individual</small></span><b>{selectedRows.length}</b></label>
        </fieldset>
        {mode === 'selected' && <div className="send-contact-picker"><Field label="Buscar contatos ativos"><input type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Nome ou e-mail" /></Field><div className="send-contact-list">{contacts.map(contact => <label key={contact.id}><input type="checkbox" checked={Boolean(selected[contact.id])} onChange={() => toggle(contact)} /><span>{typeof contact.metadata?.name === 'string' ? contact.metadata.name : contact.email_address}<small>{contact.email_address}</small></span></label>)}{!contacts.length && <p>Nenhum contato ativo nesta página.</p>}</div><div className="send-pagination"><span>Página {page} de {totalPages}</span><span><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Próxima</button></span></div>{selectedRows.length > 0 && <div className="send-selected"><strong>Selecionados ({selectedRows.length}/500)</strong>{selectedRows.map(contact => <span key={contact.id}>{contact.email_address}</span>)}</div>}</div>}
      </ChecklistCard>
      <ChecklistCard title="Assunto" checked={effectiveChecked.subject} onCheck={() => check('subject')} onEdit={() => onEdit('subject')}><strong className="send-value">{draft.subject || 'Sem assunto'}</strong></ChecklistCard>
      <ChecklistCard title="Remetente" checked={effectiveChecked.sender} onCheck={() => check('sender')}><span className="send-value">{settings.senderName || 'Mário Serafim'}{settings.senderEmail ? ` · ${settings.senderEmail}` : ' · remetente configurado na Buttondown'}</span></ChecklistCard>
      <ChecklistCard title="Conteúdo" checked={effectiveChecked.content} onCheck={() => check('content')} onEdit={() => onEdit('content')}><span className="send-value">O layout está pronto e será enviado como HTML compatível com a newsletter.</span></ChecklistCard>
    </div>
    {error && <ErrorState message={error} />}
    {testOpen && <TestEmailDialog onPrepare={onPrepare} onClose={() => setTestOpen(false)} />}
  </section>
}

function ChecklistCard({ title, checked, onCheck, onEdit, icon, children }: { title: string; checked: boolean; onCheck: () => void; onEdit?: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return <article className={`send-check-card${checked ? ' is-checked' : ''}`}><div className="send-check-card-heading"><button type="button" className="send-check-toggle" aria-label={`Verificar ${title}`} aria-pressed={checked} onClick={onCheck}>{checked ? <CheckCircle2 size={20} /> : icon || <span className="send-empty-check" />}</button><div><h2>{title}</h2><div>{children}</div></div>{onEdit && <Button size="sm" variant="outline" onClick={onEdit}>Editar</Button>}</div></article>
}

function TestEmailDialog({ onPrepare, onClose }: TestDialogProps) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const emails = value.split(/[;,\n]/).map(email => email.trim().toLowerCase()).filter(Boolean)
  const valid = emails.length > 0 && emails.length <= 30 && emails.every(email => emailPattern.test(email)) && new Set(emails).size === emails.length
  const submit = async () => {
    if (!valid || busy) return
    setBusy(true); setMessage('')
    try {
      const latest = await onPrepare()
      if (!latest.buttondownId || !latest.cloudRevision) throw new Error('Sincronize a edição antes de enviar o teste.')
      for (const recipient of emails) {
        const prepared = await api.editorialTest({ draftId: latest.id, cloudRevision: latest.cloudRevision, recipient })
        if (!prepared.attemptId) throw new Error(`Não foi possível preparar o teste para ${recipient}.`)
        await api.editorialTest({ draftId: latest.id, cloudRevision: latest.cloudRevision, recipient, attemptId: prepared.attemptId, confirm: true })
      }
      setSent(true); setMessage(`Teste enviado para ${emails.length} ${emails.length === 1 ? 'endereço' : 'endereços'}.`)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível enviar o teste.') }
    finally { setBusy(false) }
  }
  return <div className="send-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="send-dialog" role="dialog" aria-modal="true" aria-labelledby="send-test-title"><button className="send-dialog-close" type="button" aria-label="Fechar" onClick={onClose} disabled={busy}><X size={22} /></button><p className="eyebrow">HOMOLOGAÇÃO INDIVIDUAL</p><h2 id="send-test-title">Envio de email de teste</h2><Field label="E-mail para envio do teste" hint="Insira até 30 endereços diferentes separados por vírgula."><textarea autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder="email@email.com.br" rows={3} /></Field>{value && !valid && <p className="send-dialog-error" role="alert">Informe até 30 e-mails válidos e sem repetição.</p>}{message && <p className={`send-dialog-message${sent ? ' is-success' : ''}`} role="status">{sent ? <Check size={16} /> : <Info size={16} />}{message}</p>}<div className="send-dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button icon={<Send size={15} />} onClick={() => void submit()} disabled={!valid || busy}>{busy ? 'Enviando…' : 'Enviar o teste'}</Button></div></section></div>
}

