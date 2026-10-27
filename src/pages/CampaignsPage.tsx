import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink, FilePlus2, PenLine, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { demoCampaigns } from '../data/templates'
import { downloadDraftBackup, readDrafts, writeDraft } from '../lib/storage'
import type { Campaign } from '../types'
import { Button, DemoNotice, EmptyState, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui'

function localCampaigns(): Campaign[] {
  return readDrafts().map((draft) => ({ id: draft.id, subject: draft.subject || 'Sem assunto', status: 'draft', creation_date: draft.updatedAt, body: draft.content, buttondownId: draft.buttondownId, demo: false, origin: 'local' }))
}

function campaignDateLabel(date?: string | null, includeTime = false) {
  if (!date) return 'data não informada'
  const value = new Date(date)
  if (Number.isNaN(value.valueOf())) return 'data não informada'
  return new Intl.DateTimeFormat('pt-BR', includeTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' }).format(value)
}

function timestampNow() {
  return new Date().toISOString()
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [demo, setDemo] = useState(false)
  const [page, setPage] = useState(1)
  const [remoteCount, setRemoteCount] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [cloudNext, setCloudNext] = useState<number | null>(null)

  const merge = (first: Campaign[], second: Campaign[]) => [...first, ...second.filter((item) => !first.some((draft) => draft.id === item.id || draft.buttondownId === item.id || (item.buttondownId && draft.buttondownId === item.buttondownId)))]
  const cloudCampaigns = (items: Awaited<ReturnType<typeof api.cloudDrafts>>['results']): Campaign[] => items.map((item) => ({ ...item, status: 'draft', creation_date: item.updatedAt, origin: 'cloud' }))

  useEffect(() => {
    let active = true
    const requestKey = `${page}:${reload}`
    let locals: Campaign[] = []
    void Promise.resolve().then(async () => {
      locals = localCampaigns()
      if (!active) return
      setCampaigns(locals)
      const status = await api.status()
      if (status.cloud) {
        try {
          const cloud = await api.cloudDrafts()
          if (!active) return
          locals = merge(locals, cloudCampaigns(cloud.results)); setCampaigns(locals); setCloudNext(cloud.next)
        } catch { if (active) setError('Não foi possível listar a nuvem. Os rascunhos deste navegador continuam disponíveis.') }
      }
      if (status.connected) {
        const remote = await api.campaigns(page)
        if (!active) return
        setCampaigns(merge(locals, remote.results))
        setRemoteCount(remote.count)
        setHasNext(Boolean(remote.next))
        setDemo(false)
      } else if (status.demo) {
        if (!active) return
        setCampaigns([...locals, ...demoCampaigns])
        setRemoteCount(0)
        setHasNext(false)
        setDemo(true)
      } else throw new Error(status.reason || 'A Buttondown está desconectada. Seus rascunhos locais continuam disponíveis.')
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as campanhas.')
    }).finally(() => {
      if (active) setLoadedKey(requestKey)
    })
    return () => { active = false }
  }, [page, reload])

  const loading = loadedKey !== `${page}:${reload}`
  const visibleError = loading ? '' : error

  const duplicate = (campaign: Campaign) => {
    if (!campaign.body) return
    try {
      const original = readDrafts().find((item) => item.id === campaign.id)
      writeDraft({ id: `local-${crypto.randomUUID()}`, subject: `${campaign.subject} — cópia`, content: campaign.body, document: original?.document ? structuredClone(original.document) : undefined, schemaVersion: original?.document ? 2 : undefined, templateId: original?.templateId || null, status: 'draft', revision: 0, updatedAt: timestampNow() })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível duplicar sem perder conteúdo.'); return }
    setReload((value) => value + 1)
  }

  const sent = campaigns.filter((item) => item.status === 'sent')
  const drafts = campaigns.filter((item) => item.status === 'draft')
  const scheduled = campaigns.filter((item) => item.status === 'scheduled' || item.status === 'about_to_send' || item.status === 'in_flight')

  return <>
    <PageTitle eyebrow="ARQUIVO DE EDIÇÕES" title="Campanhas" description="Rascunhos, envios e histórias que já foram para a rua." action={<Link to="/editor/new"><Button icon={<FilePlus2 size={16} />}>Nova campanha</Button></Link>} />
    <details className="recovery-import"><summary>Recuperar um backup</summary><p>Importe JSON do editor ou de um backup local. Os rascunhos entram como cópias novas, sem substituir edições ou vínculos da Buttondown.</p><input aria-label="Importar cópias de recuperação" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5_000_000) { setError('O backup excede o limite de 5 MB.'); return } void file.text().then(async (text) => { const { importRecoveryCopies } = await import('../lib/recovery'); importRecoveryCopies(text); setError(''); setReload((value) => value + 1) }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao importar backup.')) }} /></details>
    {demo && <DemoNotice />}
    {visibleError && <><ErrorState message={visibleError} onRetry={() => { setError(''); setReload((value) => value + 1) }} /><Button variant="outline" size="sm" onClick={downloadDraftBackup}>Exportar backup dos rascunhos locais</Button></>}
    {loading && <LoadingState label="Carregando campanhas…" />}
    {!loading && !error && campaigns.length === 0 && <EmptyState title="Ainda não há campanhas." description="Todo arquivo começa com uma primeira página. Escolha um template e comece a escrever." action={<Link to="/templates"><Button>Escolher template</Button></Link>} />}
    {!loading && campaigns.length > 0 && <div className="campaigns-wrap">
      <div className="campaign-summary"><span>Nesta página e neste navegador:</span><span><strong>{drafts.length}</strong> rascunhos</span><span><strong>{scheduled.length}</strong> agendadas</span><span><strong>{sent.length}</strong> publicadas</span></div>
      <div className="campaign-list">
        {campaigns.map((campaign) => {
          const editable = campaign.status === 'draft'
          const destination = editable && !campaign.demo ? `/editor/${encodeURIComponent(campaign.id)}` : undefined
          return <article className="campaign-row" key={campaign.id}>
            <div className="campaign-stamp">{campaign.status === 'sent' ? '↗' : campaign.status === 'scheduled' ? '◷' : '✎'}</div>
            <div className="campaign-info"><div className="campaign-title-line"><strong>{campaign.subject || 'Sem assunto'}</strong>{campaign.demo && <span className="faint-label">AMOSTRA</span>}</div><span>{campaign.status === 'sent' ? `Enviada em ${campaignDateLabel(campaign.publish_date)}` : campaign.status === 'scheduled' ? `Agendada para ${campaignDateLabel(campaign.publish_date, true)}` : `Salva em ${campaign.creation_date ? campaignDateLabel(campaign.creation_date) : 'rascunho local'}`}</span></div>
            <StatusPill tone={campaign.status === 'sent' ? 'success' : campaign.status === 'draft' ? 'neutral' : 'warning'}>{campaign.origin === 'local' ? 'Neste navegador' : campaign.origin === 'cloud' ? 'Nuvem editorial' : campaign.status === 'sent' ? 'Publicada' : campaign.status === 'draft' ? 'Rascunho Buttondown' : campaign.status === 'scheduled' ? 'Agendada' : campaign.status}</StatusPill>
            <div className="campaign-actions">{editable && destination && <Link className="icon-button" to={destination} aria-label={`Editar ${campaign.subject}`}><PenLine size={16} /></Link>}{campaign.body && <button className="icon-button" aria-label={`Duplicar ${campaign.subject}`} title="Duplicar para rascunho local" onClick={() => duplicate(campaign)}><Copy size={15} /></button>}{campaign.absolute_url && <a className="icon-button" href={campaign.absolute_url} target="_blank" rel="noreferrer" aria-label="Abrir edição publicada"><ExternalLink size={15} /></a>}</div>
          </article>
        })}
      </div>
      {!demo && ((remoteCount || 0) > 0 || hasNext || page > 1) && <div className="table-pagination campaign-pagination"><span>Página {page} · {remoteCount?.toLocaleString('pt-BR') ?? 'total não informado'} campanhas na Buttondown</span><div><button className="icon-button" aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button><span className="page-indicator">{page}</span><button className="icon-button" aria-label="Próxima página" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div></div>}
      {cloudNext && <Button variant="outline" size="sm" onClick={() => { void api.cloudDrafts(cloudNext).then((data) => { setCampaigns((current) => merge(current, cloudCampaigns(data.results))); setCloudNext(data.next) }).catch(() => setError('Não foi possível carregar a próxima página da nuvem.')) }}>Mais rascunhos da nuvem</Button>}
      <div className="production-note"><span className="note-mark">i</span><p>Este painel prepara e salva rascunhos. Publicação e envio para assinantes reais ficam desativados nesta versão.</p></div>
    </div>}
  </>
}
