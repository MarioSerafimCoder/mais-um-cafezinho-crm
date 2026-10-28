import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, LockKeyhole, Users } from 'lucide-react'
import { api } from '../lib/api'
import type { ApiPage, DraftRecord, PreparedCampaignDelivery, Subscriber } from '../types'
import { Button } from './ui'

const pageSize = 25
type ActivePages = { regular: ApiPage<Subscriber>; premium: ApiPage<Subscriber> }

export function CampaignDelivery({ draft }: { draft: DraftRecord }) {
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
  const [prepared, setPrepared] = useState<PreparedCampaignDelivery | null>(null)
  const [confirmed, setConfirmed] = useState(false)
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

  const toggleSubscriber = (subscriber: Subscriber) => {
    setSelected((value) => {
      if (value[subscriber.id]) {
        const next = { ...value }; delete next[subscriber.id]; return next
      }
      if (Object.keys(value).length >= selectedLimit) return value
      return { ...value, [subscriber.id]: subscriber }
    })
  }

  const prepare = async () => {
    if (!draft.buttondownId || !draft.cloudRevision) return
    setBusy(true); setError(''); setMessage(''); setConfirmed(false)
    try {
      const audience = mode === 'all_active'
        ? { mode: 'all_active' }
        : { mode: 'selected', subscriberIds: selectedRows.map((subscriber) => subscriber.id) }
      const result = await api.campaignDelivery({ action: 'prepare', draftId: draft.id, cloudRevision: draft.cloudRevision, audience })
      if (!result.attemptId || !result.audienceMode || !result.recipientCount || !result.cloudRevision || !result.subject || !result.expiresAt) throw new Error('A Buttondown não retornou uma preparação válida.')
      setPrepared(result as PreparedCampaignDelivery)
      setMessage('Prévia pronta. Confira a audiência e confirme somente se estiver correta.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o envio.') }
    finally { setBusy(false) }
  }

  const cancel = async () => {
    if (!prepared) return
    setBusy(true); setError(''); setConfirmed(false)
    try {
      await api.campaignDelivery({ action: 'cancel', draftId: draft.id, cloudRevision: prepared.cloudRevision, attemptId: prepared.attemptId })
      setPrepared(null); setMessage('Preparação cancelada. Nenhum e-mail foi enviado.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a preparação.') }
    finally { setBusy(false) }
  }

  const send = async () => {
    if (!prepared) return
    const attempt = prepared
    setPrepared(null); setBusy(true); setError(''); setMessage('')
    try {
      const result = await api.campaignDelivery({ action: 'confirm', draftId: draft.id, cloudRevision: attempt.cloudRevision, attemptId: attempt.attemptId, confirm: true })
      if (!result.accepted) throw new Error('A Buttondown não confirmou a aceitação. Consulte o histórico antes de qualquer outra tentativa.')
      setMessage(`A Buttondown aceitou o envio para ${attempt.recipientCount} ${attempt.recipientCount === 1 ? 'contato' : 'contatos'}. Isso não confirma entrega ou recebimento na caixa postal.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Resultado incerto. Consulte a Buttondown antes de qualquer outra tentativa.') }
    finally { setBusy(false); setConfirmed(false) }
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
      <p className="campaign-delivery-intro">Escolha a audiência, revise a prévia e confirme o envio.</p>
      <ol className="campaign-flow" aria-label="Etapas do envio de campanha"><li><span>1</span>Audiência</li><li><span>2</span>Prévia</li><li><span>3</span>Confirmação</li></ol>
    </>}
    {enabled && <>
      <fieldset className="delivery-audience-options" disabled={busy || Boolean(prepared)}>
        <legend>Audiência</legend>
        <label><input type="radio" name={`audience-${draft.id}`} checked={mode === 'all_active'} onChange={() => setMode('all_active')} />Todos os assinantes ativos {activeCount !== null && <span>({activeCount})</span>}</label>
        <label><input type="radio" name={`audience-${draft.id}`} checked={mode === 'selected'} onChange={() => setMode('selected')} />Escolher contatos ({selectedRows.length})</label>
      </fieldset>
      {mode === 'selected' && <div className="delivery-contact-picker">
        <label className="field"><span className="field-label">Buscar contatos ativos</span><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome ou e-mail" disabled={busy || Boolean(prepared)} /></label>
        {loadingContacts ? <p role="status">Carregando contatos ativos…</p> : <div className="delivery-contact-list">
          {contacts.map((contact) => {
            const name = typeof contact.metadata?.name === 'string' ? contact.metadata.name : ''
            return <label key={contact.id}><input type="checkbox" checked={Boolean(selected[contact.id])} disabled={busy || Boolean(prepared) || (!selected[contact.id] && selectedRows.length >= selectedLimit)} onChange={() => toggleSubscriber(contact)} /><span>{name || contact.email_address}<small>{name ? contact.email_address : contact.type === 'premium' ? 'Premium' : 'Ativo'}</small></span></label>
          })}
          {contacts.length === 0 && <p>Nenhum contato ativo nesta página.</p>}
        </div>}
        <div className="delivery-contact-pagination"><span>Página {page} de {totalPages}</span><div><button type="button" disabled={page <= 1 || loadingContacts || Boolean(prepared)} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" disabled={page >= totalPages || loadingContacts || Boolean(prepared)} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div></div>
        {selectedRows.length > 0 && <div className="delivery-selected-list"><strong>Selecionados ({selectedRows.length}/{selectedLimit})</strong>{selectedRows.map((contact) => <span key={contact.id}>{contact.email_address}</span>)}</div>}
      </div>}
      {!prepared && <Button size="sm" variant="outline" disabled={busy || !current || audienceCount < 1 || (mode === 'selected' && !selectedRows.length)} onClick={() => void prepare()}>{busy ? 'Preparando…' : 'Prévia e contagem'}</Button>}
      {!current && <p className="inspector-hint">Salve o rascunho no D1 e sincronize a revisão atual na Buttondown antes de preparar o envio.</p>}
      {prepared && <div className="campaign-delivery-preview">
        <span className="inspector-label">PRÉVIA · REVISÃO D1 {prepared.cloudRevision}</span>
        <p><strong>Assunto:</strong> {prepared.subject}</p>
        <p><strong>Destinatários:</strong> {prepared.audienceMode === 'all_active' ? 'todos os assinantes ativos' : 'contatos selecionados'} · {prepared.recipientCount}</p>
        {prepared.audienceMode === 'selected' && <ul>{(prepared.selectedRecipients || []).map((contact) => <li key={contact.id}>{contact.email_address}</li>)}</ul>}
        <iframe title="Prévia segura da campanha" sandbox="" referrerPolicy="no-referrer" srcDoc={draft.content} />
        <label className="delivery-final-confirm"><input type="checkbox" checked={confirmed} disabled={busy || !current} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo o envio imediato deste assunto para {prepared.recipientCount} {prepared.recipientCount === 1 ? 'contato ativo' : 'contatos ativos'}.</label>
        <div className="delivery-final-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>Cancelar</Button><Button size="sm" variant="danger" disabled={busy || !confirmed || !current} onClick={() => void send()}>{busy ? 'Enviando…' : 'Confirmar e enviar agora'}</Button></div>
        {!current && <p role="alert">A revisão mudou. Esta prévia não pode ser enviada; prepare novamente após sincronizar.</p>}
      </div>}
    </>}
    {error ? <p role="alert">{error}</p> : message && <p role="status">{message}</p>}
  </details>
}
