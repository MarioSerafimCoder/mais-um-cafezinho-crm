import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { demoCampaigns } from '../data/templates'
import { downloadDraftBackup, readDrafts, writeDraft, removeDraft } from '../lib/storage'
import { normalizeCampaigns, type DraftSummary, type EditorialCampaign } from '../lib/campaigns'
import type { Campaign, DraftRecord } from '../types'
import { Button, DemoNotice, EmptyState, ErrorState, PageTitle, StatusPill } from '../components/ui'

const timestampNow = () => new Date().toISOString()

export function CampaignsPage() {
  const [local, setLocal] = useState<DraftRecord[]>([])
  const [cloud, setCloud] = useState<DraftSummary[]>([])
  const [remote, setRemote] = useState<Campaign[]>([])
  const [demo, setDemo] = useState(false)
  const [error, setError] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [remoteError, setRemoteError] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [deleting, setDeleting] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const generation = useRef(0)
  const cloudLock = useRef(false)
  const remoteLock = useRef(false)
  const merge = <T extends { id: string }>(current: T[], incoming: T[]) => [...new Map([...current, ...incoming].map(item => [item.id, item])).values()]

  useEffect(() => {
    const request = ++generation.current
    const active = () => request === generation.current
    const locals = () => { try { setLocal(readDrafts()) } catch (cause) { setError(String(cause)) } }
    void Promise.resolve().then(locals)
    window.addEventListener('storage', locals)
    void Promise.resolve().then(() => { setCloudBusy(true); setRemoteBusy(true); setCloudError(''); setRemoteError('') })
    // Each source completes independently, including when status discovery fails.
    void api.cloudDrafts().then(data => { if (active()) { setCloud(data.results); setCursor(data.next) } })
      .catch(() => { if (active()) setCloudError('Não foi possível atualizar os rascunhos entre dispositivos.') })
      .finally(() => { if (active()) setCloudBusy(false) })
    void api.status().then(async status => {
      if (!active()) return
      setDemo(status.demo)
      if (status.demo && !status.connected) { setRemote(demoCampaigns); setHasNext(false); return }
      if (!status.connected) throw new Error('A consulta à plataforma está indisponível. As edições recuperadas continuam acessíveis.')
      const data = await api.campaigns()
      if (active()) { setRemote(data.results); setPage(1); setHasNext(Boolean(data.next)) }
    }).catch(cause => { if (active()) setRemoteError(String(cause instanceof Error ? cause.message : cause)) })
      .finally(() => { if (active()) setRemoteBusy(false) })
    return () => { generation.current = request + 1; window.removeEventListener('storage', locals) }
  }, [reload])

  const more = async () => {
    const request = generation.current
    const tasks: Promise<void>[] = []
    if (cursor && !cloudLock.current) {
      cloudLock.current = true; setCloudBusy(true); setCloudError('')
      tasks.push(api.cloudDrafts(cursor).then(data => { if (request === generation.current) { setCloud(current => merge(current, data.results)); setCursor(data.next) } }).catch(() => setCloudError('Não foi possível carregar mais edições. Tente novamente.')).finally(() => { cloudLock.current = false; setCloudBusy(false) }))
    }
    if (hasNext && !remoteLock.current) {
      remoteLock.current = true; setRemoteBusy(true); setRemoteError('')
      tasks.push(api.campaigns(page + 1).then(data => { if (request === generation.current) { setRemote(current => merge(current, data.results)); setPage(page + 1); setHasNext(Boolean(data.next)) } }).catch(() => setRemoteError('Não foi possível carregar mais campanhas. Tente novamente.')).finally(() => { remoteLock.current = false; setRemoteBusy(false) }))
    }
    await Promise.allSettled(tasks)
  }
  const duplicate = async (campaign: EditorialCampaign) => {
    try {
      const source = campaign.draft || (cloud.some(d => d.id === campaign.editorId) ? await api.cloudDraft(campaign.editorId!) : undefined)
      const external = source ? undefined : await api.campaign(campaign.editorId!)
      writeDraft({ id: 'local-' + crypto.randomUUID(), subject: campaign.subject + ' — cópia', content: source?.content || external?.body || '', document: source?.document, schemaVersion: source?.schemaVersion, description: source?.description || external?.description, buttondownTemplate: source?.buttondownTemplate, editionDate: source?.editionDate, templateId: source?.templateId || null, status: 'draft', revision: 0, updatedAt: timestampNow() })
      setLocal(readDrafts())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível duplicar a edição.') }
  }
  const deleteEdition = async (campaign: EditorialCampaign) => {
    if (deleting) return
    setDeleting(campaign.id); setError(''); setNotice('')
    try {
      const remoteId = campaign.id.startsWith('bd:') ? campaign.id.slice(3) : undefined
      const draftId = campaign.id.startsWith('doc:') ? campaign.id.slice(4) : campaign.editorId !== remoteId ? campaign.editorId : undefined
      const onlyLocal = !remoteId && !campaign.draft?.buttondownId && !campaign.draft?.cloudRevision && !cloud.some(item => item.id === draftId) && Boolean(campaign.draft)
      const result = onlyLocal ? { campaignId: null } : await api.deleteCampaign(draftId, remoteId)
      for (const draft of readDrafts()) if (draft.id === draftId || (result.campaignId && draft.buttondownId === result.campaignId)) removeDraft(draft.id)
      setLocal(readDrafts()); setCloud(items => items.filter(item => item.id !== draftId && (!result.campaignId || item.buttondownId !== result.campaignId))); setRemote(items => items.filter(item => item.id !== result.campaignId))
      setNotice('Campanha excluída.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a campanha.') }
    finally { setDeleting('') }
  }
  const campaigns = normalizeCampaigns(local, cloud, remote).filter(campaign => campaign.subject.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const loading = cloudBusy || remoteBusy
  return <>
    <PageTitle eyebrow="ARQUIVO DE EDIÇÕES" title="Edições" description="Suas edições, da primeira ideia à publicação." action={<Link to="/editor/new"><Button>Nova edição</Button></Link>} />
    <details className="recovery-import"><summary>Recuperar um backup</summary><p>Importe JSON do editor ou de um backup local. Os rascunhos entram como cópias novas, sem substituir edições ou vínculos da Buttondown.</p><input aria-label="Importar cópias de recuperação" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5_000_000) { setError('O backup excede o limite de 5 MB.'); return } void file.text().then(async (text) => { const { importRecoveryCopies } = await import('../lib/recovery'); importRecoveryCopies(text); setError(''); setReload((value) => value + 1) }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao importar backup.')) }} /></details>

    <label className="search-box"><input type="search" placeholder="Buscar edição pelo assunto" aria-label="Buscar edição" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {notice && <p role="status">{notice}</p>}
    {demo && <DemoNotice />}
    {[error, cloudError, remoteError].filter(Boolean).map(message => <ErrorState key={message} message={message} onRetry={() => { setError(''); setReload(value => value + 1) }} />)}
    {error && <Button variant="outline" onClick={downloadDraftBackup}>Exportar backup dos rascunhos locais</Button>}
    {loading && <p role="status">Atualizando edições…</p>}
    {!loading && !campaigns.length && <EmptyState title="Ainda não há campanhas." description="Comece uma nova edição para escrever." />}
    <div className="campaign-list">{campaigns.map((campaign, index) => <article className={`campaign-row${index === 0 ? ' is-recent' : ''}`} key={campaign.id}>
      <div className="campaign-info">{campaign.status === 'draft' && !campaign.demo ? <Link className="campaign-primary-link" to={'/editor/' + encodeURIComponent(campaign.editorId!)}><strong>{campaign.subject}</strong></Link> : campaign.absolute_url ? <a className="campaign-primary-link" href={campaign.absolute_url} target="_blank" rel="noreferrer"><strong>{campaign.subject}</strong></a> : <strong>{campaign.subject}</strong>}<span>Última atualização: {campaign.updatedAt ? new Date(campaign.updatedAt).toLocaleString('pt-BR') : 'não informada'}</span></div>
      <StatusPill tone={campaign.status === 'sent' ? 'success' : 'neutral'}>{campaign.editorialState}</StatusPill>
      <div className="campaign-actions">
        {campaign.status === 'draft' && !campaign.demo && <Link to={'/editor/' + encodeURIComponent(campaign.editorId!)}>{campaign.editorialState === 'Preparada para revisão' ? 'Revisar edição' : 'Continuar edição'}</Link>}
        {campaign.status !== 'draft' && campaign.absolute_url && <a href={campaign.absolute_url} target="_blank" rel="noreferrer">Visualizar publicação</a>}
        {!campaign.demo && <Button variant="quiet" size="sm" disabled={Boolean(deleting)} onClick={() => void deleteEdition(campaign)} aria-label={`Excluir campanha ${campaign.subject}`}>{deleting === campaign.id ? 'Excluindo…' : 'Excluir campanha'}</Button>}
        {!campaign.demo && <details className="campaign-more"><summary aria-label={`Mais ações para ${campaign.subject}`}>Mais</summary><Button size="sm" variant="quiet" onClick={() => void duplicate(campaign)}>Duplicar edição</Button></details>}
      </div>
    </article>)}</div>
    {(cursor || hasNext) && <Button variant="outline" disabled={loading} onClick={() => void more()}>Carregar mais edições</Button>}
  </>
}
