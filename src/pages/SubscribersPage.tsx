import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Search, ChevronLeft, ChevronRight, ShieldCheck, UserRound, UserPlus, Mail, CircleCheck } from 'lucide-react'
import { api, requireConnection } from '../lib/api'
import { demoSubscribers } from '../data/templates'
import type { ApiPage, IntegrationStatus, Subscriber } from '../types'
import { Button, DemoNotice, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui'

const pageSize = 25

function statusTone(type: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (type === 'regular' || type === 'premium') return 'success'
  if (type === 'unsubscribed' || type === 'removed' || type === 'complained') return 'danger'
  if (type === 'unactivated' || type === 'blocked') return 'warning'
  return 'neutral'
}

function displayStatus(type: string) {
  const names: Record<string, string> = { regular: 'Inscrito', premium: 'Premium', unsubscribed: 'Descadastrado', removed: 'Removido', unactivated: 'Pendente', blocked: 'Bloqueado', complained: 'Reclamação', undeliverable: 'Não entregue' }
  return names[type] || type.replaceAll('_', ' ')
}

function subscriberDateLabel(date: string) {
  const value = new Date(date)
  return Number.isNaN(value.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(value)
}

export function SubscribersPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [pageData, setPageData] = useState<ApiPage<Subscriber> | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [newEmail, setNewEmail] = useState('')
  const [processingEmail, setProcessingEmail] = useState('')
  const [createError, setCreateError] = useState('')
  const [createMessage, setCreateMessage] = useState('')

  useEffect(() => {
    const handle = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(handle)
  }, [search])

  const requestKey = `${page}:${query}:${reload}`

  useEffect(() => {
    let active = true
    void api.status().then(requireConnection).then(async (integration) => {
      if (!active) return
      setStatus(integration)
      if (integration.configured) {
        const result = await api.subscribers(page, query)
        if (active) setPageData(result)
      } else {
        const filtered = demoSubscribers.filter((subscriber) => subscriber.email_address.toLowerCase().includes(query.toLowerCase()))
        const results = filtered.slice((page - 1) * pageSize, page * pageSize)
        if (active) setPageData({ results, count: filtered.length, next: page * pageSize < filtered.length ? 'next' : null, previous: page > 1 ? 'previous' : null })
      }
      if (active) setError('')
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os assinantes.') })
      .finally(() => { if (active) setLoadedKey(requestKey) })
    return () => { active = false }
  }, [page, query, reload, requestKey])

  const loading = loadedKey !== requestKey
  const visibleError = loading ? '' : error
  const activeRows = useMemo(() => pageData?.results || [], [pageData])

  const addSubscriber = async (emailAddress: string) => {
    if (!status?.configured || processingEmail) return
    setProcessingEmail(emailAddress); setCreateError(''); setCreateMessage('')
    try {
      const subscriber = await api.addSubscriber(emailAddress)
      if (!subscriber.alreadyActive) setNewEmail('')
      setPage(1)
      setSearch(subscriber.email_address)
      setReload((value) => value + 1)
      setCreateMessage(subscriber.activatedExisting
        ? `Assinante ativado sem confirmação por e-mail: ${subscriber.email_address}.`
        : subscriber.alreadyActive
          ? `Este endereço já estava ativo: ${subscriber.email_address}.`
          : `Assinante cadastrado e ativo, sem confirmação por e-mail: ${subscriber.email_address}.`)
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar este assinante.')
    } finally { setProcessingEmail('') }
  }

  const createSubscriber = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newEmail.trim()) return
    await addSubscriber(newEmail)
  }

  return <>
    <PageTitle eyebrow="LISTA DE LEITORES" title="Assinantes" description="Uma boa lista cresce com consentimento — e sem atalhos esquisitos." />
    {status?.demo && <DemoNotice />}
    {status?.configured && <section className="subscriber-create-panel" aria-labelledby="subscriber-create-title">
      <div className="subscriber-create-heading">
        <span className="subscriber-create-icon"><UserPlus size={18} /></span>
        <div><h2 id="subscriber-create-title">Cadastro manual</h2><p>Cadastros novos e pendentes são ativados diretamente, sem confirmação por e-mail.</p></div>
      </div>
      <form className="subscriber-create-form" onSubmit={(event) => void createSubscriber(event)}>
        <label className="field"><span className="field-label">E-mail do assinante</span><span className="subscriber-email-input"><Mail size={15} /><input type="email" autoComplete="email" required maxLength={254} value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="nome@exemplo.com" disabled={Boolean(processingEmail)} /></span></label>
        <Button type="submit" size="sm" icon={processingEmail ? undefined : <UserPlus size={15} />} disabled={Boolean(processingEmail) || !newEmail.trim()}>{processingEmail ? 'Ativando…' : 'Cadastrar e ativar'}</Button>
      </form>
      {createError && <p className="subscriber-create-feedback subscriber-create-error" role="alert">{createError}</p>}
      {createMessage && <p className="subscriber-create-feedback subscriber-create-success" role="status"><CircleCheck size={15} />{createMessage}</p>}
    </section>}
    {status && !status.configured && <p className="subscriber-create-demo-note" role="status">O cadastro manual fica disponível quando a integração Buttondown está conectada.</p>}
    <section className="subscriber-toolbar">
      <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por e-mail" aria-label="Buscar por e-mail" /><kbd>⌘ K</kbd></label>
      <span className="subscriber-count">{pageData ? `${pageData.count?.toLocaleString('pt-BR') ?? '—'} registros` : '—'}</span>
    </section>
    {visibleError && <ErrorState message={visibleError} onRetry={() => { setError(''); setReload((value) => value + 1) }} />}
    {loading && <LoadingState label="Buscando assinantes…" />}
    {!loading && !error && <>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>LEITOR</th><th>STATUS</th><th>ORIGEM</th><th>DESDE</th></tr></thead><tbody>
        {activeRows.map((subscriber) => { const name = typeof subscriber.metadata?.name === 'string' ? subscriber.metadata.name : ''; return <tr key={subscriber.id}>
          <td><div className="subscriber-cell"><span className="subscriber-avatar"><UserRound size={15} /></span><div><strong>{name || subscriber.email_address}</strong>{name && <small>{subscriber.email_address}</small>}</div></div></td>
          <td><div className="subscriber-status-cell"><StatusPill tone={statusTone(subscriber.type)}>{displayStatus(subscriber.type)}</StatusPill>{subscriber.type === 'unactivated' && <Button className="subscriber-activate-button" size="sm" variant="outline" disabled={Boolean(processingEmail)} onClick={() => void addSubscriber(subscriber.email_address)}>{processingEmail === subscriber.email_address ? 'Ativando…' : 'Ativar'}</Button>}</div></td>
          <td>{subscriber.source ? subscriber.source.replaceAll('_', ' ') : '—'}</td>
          <td>{subscriber.creation_date ? subscriberDateLabel(subscriber.creation_date) : '—'}</td>
        </tr>})}
      </tbody></table></div>
      {activeRows.length === 0 && <div className="table-empty">{query ? `Nenhum assinante encontrado para “${query}”.` : 'Nenhum assinante nesta página.'}</div>}
      <div className="table-pagination"><span>{activeRows.length} registros nesta página · {pageData?.count?.toLocaleString('pt-BR') ?? '—'} no total</span><div><button className="icon-button" aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button><span className="page-indicator">Página {page}</span><button className="icon-button" aria-label="Próxima página" disabled={!pageData?.next || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div></div>
      <p className="privacy-note"><ShieldCheck size={14} /> Descadastrados, bloqueados, reclamações e endereços não entregáveis não são reativados pelo formulário.</p>
    </>}
  </>
}
