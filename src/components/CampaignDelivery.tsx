import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Send, Info, LockKeyhole, Users } from 'lucide-react'
import { api } from '../lib/api'
import type { ApiPage, DraftRecord, Subscriber } from '../types'
import { Button } from './ui'

const pageSize = 25
type ActivePages = { regular: ApiPage<Subscriber>; premium: ApiPage<Subscriber> }

export function CampaignDelivery({ draft, onPrepare }: { draft: DraftRecord; onPrepare?: () => Promise<DraftRecord> }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [selectedLimit, setSelectedLimit] = useState(500)
  const [mode, setMode] = useState<'all_active' | 'selected'>('all_active')
  const [selected, setSelected] = useState<Record<string, Subscriber>>({})
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState<ActivePages | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void api.campaignDeliveryStatus().then((status) => {
      if (!active) return
      setEnabled(status.enabled)
      setActiveCount(Number.isSafeInteger(status.activeCount) ? status.activeCount! : null)
      setSelectedLimit(status.selectedLimit || 500)
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a autorização de envio.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  useEffect(() => {
    if (!enabled || mode !== 'selected') return
    let active = true
    // Loading state belongs to this external request, including dependency changes.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoadingContacts(true)
    setPages(null)
    void Promise.all([api.subscribers(page, search, 'regular'), api.subscribers(page, search, 'premium')])
      .then(([regular, premium]) => { if (active) setPages({ regular, premium }) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os contatos ativos.') })
      .finally(() => { if (active) setLoadingContacts(false) })
    return () => { active = false }
  }, [enabled, mode, page, search])

  const contacts = useMemo(() => {
    const rows = [...(pages?.regular.results || []), ...(pages?.premium.results || [])]
    return rows.filter((contact, index) => rows.findIndex((item) => item.id === contact.id) === index)
  }, [pages])
  const selectedRows = useMemo(() => Object.values(selected).sort((a, b) => a.email_address.localeCompare(b.email_address)), [selected])
  const totalPages = Math.max(1, Math.ceil(Math.max(pages?.regular.count || 0, pages?.premium.count || 0) / pageSize))
  const current = Boolean(draft.buttondownId && draft.cloudRevision
    && Number.isSafeInteger(draft.revision)
    && draft.revision === draft.syncedRevision
    && draft.revision === draft.cloudSavedRevision)
  const audienceCount = mode === 'all_active' ? activeCount || 0 : selectedRows.length
  const deliveryAccepted = message.startsWith('A Buttondown aceitou o envio')
  const messageTitle = deliveryAccepted ? 'Aceito pela Buttondown'
    : message.startsWith('Prévia pronta') ? 'Prévia preparada'
      : message.startsWith('Preparação cancelada') ? 'Envio cancelado' : 'Atualização'

  const toggleSubscriber = (subscriber: Subscriber) => {
    setSelected((value) => {
      if (value[subscriber.id]) {
        const next = { ...value }; delete next[subscriber.id]; return next
      }
      if (Object.keys(value).length >= selectedLimit) return value
      return { ...value, [subscriber.id]: subscriber }
    })
  }

  const send = async () => {
    if (busy || deliveryAccepted) return
    setBusy(true); setError(''); setMessage('')
    try {
      const latest = onPrepare ? await onPrepare() : draft
      if (!latest.buttondownId || !latest.cloudRevision || latest.revision !== latest.syncedRevision || latest.revision !== latest.cloudSavedRevision) throw new Error('Não foi possível sincronizar. Confira sua conexão e tente novamente.')
      const audience = mode === 'all_active' ? { mode: 'all_active' } : { mode: 'selected', subscriberIds: selectedRows.map(subscriber => subscriber.id) }
      const attempt = await api.campaignDelivery({ action: 'prepare', draftId: latest.id, cloudRevision: latest.cloudRevision, audience })
      if (!attempt.attemptId || !attempt.cloudRevision || !attempt.recipientCount) throw new Error('Não foi possível preparar o envio.')
      const result = await api.campaignDelivery({ action: 'confirm', draftId: latest.id, cloudRevision: attempt.cloudRevision, attemptId: attempt.attemptId, confirm: true })
      if (!result.accepted) throw new Error('A Buttondown ainda não confirmou o envio. Consulte o histórico antes de tentar novamente.')
      setMessage(`A Buttondown aceitou o envio para ${attempt.recipientCount} ${attempt.recipientCount === 1 ? 'contato' : 'contatos'}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir o envio.') }
    finally { setBusy(false) }
  }

  return <details className="inspector-section campaign-delivery">
    <summary className="campaign-delivery-summary">
      <ChevronDown size={15} aria-hidden="true" />
      <span className="campaign-summary-title">Enviar campanha</span>
      {enabled === false && <span className="campaign-lock-pill"><LockKeyhole size={11} />Bloqueado</span>}
      {enabled === true && <span className="campaign-ready-pill"><CheckCircle2 size={11} />Disponível</span>}
    </summary>
    {enabled === false && <div className="campaign-locked-panel" role="status">
      <div className="campaign-locked-icon"><LockKeyhole size={18} /></div>
      <div className="campaign-locked-copy">
        <span className="inspector-label">PROTEÇÃO DE ENVIO</span>
        <strong>Campanhas bloqueadas</strong>
        <p>A ativação exige autorização explícita do proprietário e permissão de envio da Buttondown.</p>
      </div>
      <Button className="campaign-locked-button" size="sm" variant="outline" icon={<LockKeyhole size={14} />} disabled>Envio não autorizado</Button>
      <span className="campaign-locked-hint"><Users size={13} />Nenhum assinante será contatado.</span>
    </div>}
    {enabled === null && !error && <div className="campaign-state-panel" role="status"><span className="campaign-spinner" />Verificando autorização de envio…</div>}
    {enabled === true && <>
      <p className="campaign-delivery-intro">Escolha quem vai receber. O salvamento e a sincronização são automáticos.</p>

    </>}
    {enabled && <>
      <fieldset className="delivery-audience-options" disabled={busy || deliveryAccepted}>
        <legend>Escolha a audiência</legend>
        <label className={`delivery-audience-option${mode === 'all_active' ? ' is-selected' : ''}`}>
          <input type="radio" name={`audience-${draft.id}`} checked={mode === 'all_active'} onChange={() => setMode('all_active')} />
          <span className="delivery-audience-copy"><strong>Todos os assinantes</strong><small>Ativos e elegíveis</small></span>
          <span className="delivery-audience-count" aria-label={`${activeCount ?? '—'} assinantes ativos`}>{activeCount ?? '—'}</span>
        </label>
        <label className={`delivery-audience-option${mode === 'selected' ? ' is-selected' : ''}`}>
          <input type="radio" name={`audience-${draft.id}`} checked={mode === 'selected'} onChange={() => setMode('selected')} />
          <span className="delivery-audience-copy"><strong>Escolher contatos</strong><small>Seleção individual</small></span>
          <span className="delivery-audience-count" aria-label={`${selectedRows.length} contatos selecionados`}>{selectedRows.length}</span>
        </label>
      </fieldset>
      {mode === 'selected' && <div className="delivery-contact-picker">
        <label className="field"><span className="field-label">Buscar contatos ativos</span><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome ou e-mail" disabled={busy || deliveryAccepted} /></label>
        {loadingContacts ? <p role="status">Carregando contatos ativos…</p> : <div className="delivery-contact-list">
          {contacts.map((contact) => {
            const name = typeof contact.metadata?.name === 'string' ? contact.metadata.name : ''
            return <label key={contact.id}><input type="checkbox" checked={Boolean(selected[contact.id])} disabled={busy || deliveryAccepted || (!selected[contact.id] && selectedRows.length >= selectedLimit)} onChange={() => toggleSubscriber(contact)} /><span>{name || contact.email_address}<small>{name ? contact.email_address : contact.type === 'premium' ? 'Premium' : 'Ativo'}</small></span></label>
          })}
          {contacts.length === 0 && <p>Nenhum contato ativo nesta página.</p>}
        </div>}
        <div className="delivery-contact-pagination"><span>Página {page} de {totalPages}</span><div><button type="button" disabled={page <= 1 || loadingContacts || deliveryAccepted} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" disabled={page >= totalPages || loadingContacts || deliveryAccepted} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div></div>
        {selectedRows.length > 0 && <div className="delivery-selected-list"><strong>Selecionados ({selectedRows.length}/{selectedLimit})</strong>{selectedRows.map((contact) => <span key={contact.id}>{contact.email_address}</span>)}</div>}
      </div>}
      <div className="delivery-summary"><span className="inspector-label">PRONTO PARA ENVIAR</span><p><strong>{draft.subject}</strong></p><p>{audienceCount} {audienceCount === 1 ? 'destinatário' : 'destinatários'} · {mode === 'all_active' ? 'Todos os assinantes ativos' : 'Contatos selecionados'}</p></div>
      {!deliveryAccepted && <Button className="campaign-prepare-button" icon={<Send size={16} />} disabled={busy || (!current && !onPrepare) || audienceCount < 1} onClick={() => void send()}>{busy ? 'Sincronizando e enviando…' : `Enviar agora para ${audienceCount} ${audienceCount === 1 ? 'contato' : 'contatos'}`}</Button>}

    </>}
    {error && <div className="campaign-feedback campaign-feedback-error" role="alert"><AlertCircle size={16} /><div><strong>Não foi possível concluir</strong><span>{error}</span></div></div>}
    {!error && message && <div className={`campaign-feedback${deliveryAccepted ? ' campaign-feedback-success' : ''}`} role="status">
      {deliveryAccepted ? <CheckCircle2 size={16} /> : <Info size={16} />}
      <div><strong>{messageTitle}</strong><span>{message}</span>{deliveryAccepted && <small>A aceitação não confirma a entrega na caixa postal.</small>}</div>
    </div>}
  </details>
}
