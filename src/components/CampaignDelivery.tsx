import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Info, LockKeyhole, Send, Users } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { ApiPage, DraftRecord, PreparedCampaignDelivery, Subscriber } from '../types'
import { Button } from './ui'

const pageSize = 25
type ActivePages = { regular: ApiPage<Subscriber>; premium: ApiPage<Subscriber> }
type Prepared = PreparedCampaignDelivery & { draftId: string; preparationKey: string }

function preparationKey(draft: DraftRecord, mode: 'all_active' | 'selected', activeCount: number | null, selectedRows: Subscriber[]) {
  return JSON.stringify([
    draft.id, draft.subject, draft.description || '', draft.revision, draft.cloudRevision,
    draft.syncedRevision, draft.cloudSavedRevision, draft.document || draft.content,
    mode, mode === 'all_active' ? activeCount : selectedRows.map((subscriber) => [subscriber.id, subscriber.email_address]).sort(),
  ])
}

function isUncertain(cause: unknown) {
  return cause instanceof ApiError && (cause.status === 0 || cause.status >= 500)
}

function expiryLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'prazo não informado' : date.toLocaleString('pt-BR')
}

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
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'ready' | 'confirming' | 'sent' | 'rejected' | 'uncertain'>('idle')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
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
  const currentKey = preparationKey(draft, mode, activeCount, selectedRows)
  const deliveryAccepted = phase === 'sent'
  const deliveryUncertain = phase === 'uncertain'
  const messageTitle = phase === 'sent' ? 'Campanha aceita pela Buttondown'
    : phase === 'ready' ? 'Preparação pronta'
      : phase === 'uncertain' ? 'Resultado incerto' : 'Atualização'

  useEffect(() => {
    if (!prepared || prepared.preparationKey === currentKey || busy) return
    // A preparation is bound to the exact draft and audience reviewed by the server.
    // oxlint-disable-next-line react/set-state-in-effect
    setPrepared(null)
    setPhase('idle')
    setMessage('Os dados da edição ou da audiência mudaram. Prepare o envio novamente.')
  }, [busy, currentKey, prepared])

  const resetPreparation = () => { setPrepared(null); setPhase('idle'); setMessage(''); setError('') }
  const toggleSubscriber = (subscriber: Subscriber) => {
    resetPreparation()
    setSelected((value) => {
      if (value[subscriber.id]) { const next = { ...value }; delete next[subscriber.id]; return next }
      if (Object.keys(value).length >= selectedLimit) return value
      return { ...value, [subscriber.id]: subscriber }
    })
  }

  const prepare = async () => {
    if (busy || deliveryAccepted || deliveryUncertain) return
    setBusy(true); setPhase('preparing'); setPrepared(null); setError(''); setMessage('')
    try {
      const latest = onPrepare ? await onPrepare() : draft
      if (!latest.buttondownId || !latest.cloudRevision || latest.revision !== latest.syncedRevision || latest.revision !== latest.cloudSavedRevision) throw new Error('Não foi possível sincronizar. Confira sua conexão e tente novamente.')
      const audience = mode === 'all_active' ? { mode: 'all_active' as const } : { mode: 'selected' as const, subscriberIds: selectedRows.map((subscriber) => subscriber.id) }
      if (audience.mode === 'selected' && audience.subscriberIds.length < 1) throw new Error('Selecione pelo menos um contato antes de preparar o envio.')
      const attempt = await api.campaignDelivery({ action: 'prepare', draftId: latest.id, cloudRevision: latest.cloudRevision, audience })
      if (!attempt.attemptId || !attempt.cloudRevision || typeof attempt.recipientCount !== 'number' || !Number.isSafeInteger(attempt.recipientCount) || attempt.recipientCount < 1 || !attempt.audienceMode || !attempt.subject || !attempt.expiresAt) throw new Error('Não foi possível preparar o envio.')
      setPrepared({ ...attempt as PreparedCampaignDelivery, draftId: latest.id, preparationKey: preparationKey(latest, mode, activeCount, selectedRows) })
      setPhase('ready'); setMessage('Preparação concluída. Confira os dados retornados pelo servidor antes de confirmar.')
    } catch (cause) { setPhase('rejected'); setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o envio.') }
    finally { setBusy(false) }
  }

  const confirm = async () => {
    if (!prepared || busy || phase !== 'ready' || prepared.preparationKey !== currentKey) return
    if (Date.parse(prepared.expiresAt) <= Date.now()) {
      setPrepared(null); setPhase('rejected'); setError('A preparação expirou. Prepare o envio novamente antes de confirmar.'); return
    }
    setBusy(true); setPhase('confirming'); setError(''); setMessage('')
    try {
      const result = await api.campaignDelivery({ action: 'confirm', draftId: prepared.draftId, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId, confirm: true })
      if (!result.accepted) throw new Error('A Buttondown recusou o envio. Consulte o estado da campanha antes de tentar novamente.')
      setPhase('sent'); setMessage('Campanha aceita pela Buttondown.')
    } catch (cause) {
      if (isUncertain(cause)) { setPhase('uncertain'); setError('Resultado incerto. Não repita o envio; consulte o histórico da campanha e a Buttondown.') }
      else { setPrepared(null); setPhase('rejected'); setError(cause instanceof Error ? cause.message : 'A Buttondown recusou o envio.') }
    } finally { setBusy(false) }
  }

  const preparedSummary = prepared && phase !== 'idle' && phase !== 'preparing' && phase !== 'rejected' && prepared.preparationKey === currentKey ? prepared : null

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
      <fieldset className="delivery-audience-options" disabled={busy || deliveryAccepted || deliveryUncertain}>
        <legend>Escolha a audiência</legend>
        <label className={`delivery-audience-option${mode === 'all_active' ? ' is-selected' : ''}`}>
          <input type="radio" name={`audience-${draft.id}`} checked={mode === 'all_active'} onChange={() => { resetPreparation(); setMode('all_active') }} />
          <span className="delivery-audience-copy"><strong>Todos os assinantes</strong><small>Ativos e elegíveis</small></span>
          <span className="delivery-audience-count" aria-label={`${activeCount ?? '—'} assinantes ativos`}>{activeCount ?? '—'}</span>
        </label>
        <label className={`delivery-audience-option${mode === 'selected' ? ' is-selected' : ''}`}>
          <input type="radio" name={`audience-${draft.id}`} checked={mode === 'selected'} onChange={() => { resetPreparation(); setMode('selected') }} />
          <span className="delivery-audience-copy"><strong>Escolher contatos</strong><small>Seleção individual</small></span>
          <span className="delivery-audience-count" aria-label={`${selectedRows.length} contatos selecionados`}>{selectedRows.length}</span>
        </label>
      </fieldset>
      {mode === 'selected' && <div className="delivery-contact-picker">
        <label className="field"><span className="field-label">Buscar contatos ativos</span><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome ou e-mail" disabled={busy || deliveryAccepted || deliveryUncertain} /></label>
        {loadingContacts ? <p role="status">Carregando contatos ativos…</p> : <div className="delivery-contact-list">
          {contacts.map((contact) => {
            const name = typeof contact.metadata?.name === 'string' ? contact.metadata.name : ''
            return <label key={contact.id}><input type="checkbox" checked={Boolean(selected[contact.id])} disabled={busy || deliveryAccepted || deliveryUncertain || (!selected[contact.id] && selectedRows.length >= selectedLimit)} onChange={() => toggleSubscriber(contact)} /><span>{name || contact.email_address}<small>{name ? contact.email_address : contact.type === 'premium' ? 'Premium' : 'Ativo'}</small></span></label>
          })}
          {contacts.length === 0 && <p>Nenhum contato ativo nesta página.</p>}
        </div>}
        <div className="delivery-contact-pagination"><span>Página {page} de {totalPages}</span><div><button type="button" disabled={page <= 1 || loadingContacts || deliveryAccepted || deliveryUncertain} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" disabled={page >= totalPages || loadingContacts || deliveryAccepted || deliveryUncertain} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div></div>
        {selectedRows.length > 0 && <div className="delivery-selected-list"><strong>Selecionados ({selectedRows.length}/{selectedLimit})</strong>{selectedRows.map((contact) => <span key={contact.id}>{contact.email_address}</span>)}</div>}
      </div>}
      {preparedSummary ? <div className="campaign-delivery-preview" aria-label="Dados confirmados pelo servidor"><span className="inspector-label">PREPARAÇÃO CONFIRMADA</span><p><strong>{preparedSummary.subject}</strong></p><p>{preparedSummary.recipientCount} {preparedSummary.recipientCount === 1 ? 'destinatário' : 'destinatários'} · {preparedSummary.audienceMode === 'all_active' ? 'Todos os assinantes ativos' : 'Contatos selecionados'}</p>{preparedSummary.selectedRecipients?.length ? <ul>{preparedSummary.selectedRecipients.map((recipient) => <li key={recipient.id}>{recipient.email_address}</li>)}</ul> : null}<p>Preparação válida até {expiryLabel(preparedSummary.expiresAt)}.</p><p>A campanha será enviada imediatamente após a confirmação final.</p></div> : <div className="delivery-summary"><span className="inspector-label">PREPARAR ENVIO</span><p><strong>{draft.subject}</strong></p><p>Confira os dados reais da audiência antes da confirmação final.</p></div>}
      {!deliveryAccepted && !deliveryUncertain && !preparedSummary && <Button className="campaign-prepare-button" icon={<Send size={16} />} disabled={busy || (!current && !onPrepare) || audienceCount < 1} onClick={() => void prepare()}>{busy ? 'Sincronizando e preparando…' : 'Preparar envio'}</Button>}
      {!deliveryAccepted && !deliveryUncertain && preparedSummary && phase === 'ready' && <Button className="campaign-prepare-button" icon={<Send size={16} />} disabled={busy} onClick={() => void confirm()}>Confirmar e enviar campanha</Button>}
      {phase === 'preparing' && <Button className="campaign-prepare-button" disabled>Preparando envio…</Button>}
      {phase === 'confirming' && <Button className="campaign-prepare-button" disabled>Confirmando envio…</Button>}
    </>}
    {error && <div className="campaign-feedback campaign-feedback-error" role="alert"><AlertCircle size={16} /><div><strong>{phase === 'uncertain' ? 'Resultado incerto' : 'Não foi possível concluir'}</strong><span>{error}</span></div></div>}
    {!error && message && <div className={`campaign-feedback${deliveryAccepted ? ' campaign-feedback-success' : ''}`} role="status">
      {deliveryAccepted ? <CheckCircle2 size={16} /> : <Info size={16} />}
      <div><strong>{messageTitle}</strong><span>{message}</span>{deliveryAccepted && <small>A aceitação não confirma a entrega na caixa postal.</small>}</div>
    </div>}
  </details>
}
