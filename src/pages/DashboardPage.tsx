import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarClock, Copy, Download, FileText, Mail, MoreVertical, PenLine, UsersRound } from 'lucide-react'
import { api, requireConnection } from '../lib/api'
import { readDrafts, writeDraft } from '../lib/storage'
import type { Campaign, DashboardSummary, DraftRecord } from '../types'
import { demoDashboard } from '../data/templates'
import { Button, DemoNotice, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui'

const timestampNow = () => new Date().toISOString()

function dateLabel(date?: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  return Number.isNaN(parsed.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

function dateTimeLabel(date?: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  return Number.isNaN(parsed.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed)
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function closeMenu(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest('details')?.removeAttribute('open')
}

function statusLabel(status: string) {
  if (status === 'sent') return 'Publicado'
  if (status === 'draft') return 'Rascunho'
  if (status === 'scheduled') return 'Agendado'
  return status
}

function DashboardActionMenu({ campaign, onDuplicate, onExport }: { campaign: Campaign; onDuplicate: () => void; onExport: () => void }) {
  const editorPath = `/editor/${encodeURIComponent(campaign.id)}`
  return <details className="dashboard-action-menu">
    <summary role="button" aria-label={`Ações para ${campaign.subject}`}><MoreVertical size={19} /></summary>
    <div className="dashboard-action-menu-panel">
      {campaign.absolute_url ? <a href={campaign.absolute_url} target="_blank" rel="noreferrer" onClick={closeMenu}><span>Visualizar email</span></a> : <Link to={editorPath} onClick={closeMenu}><span>Visualizar email</span></Link>}
      <button type="button" onClick={(event) => { closeMenu(event); onDuplicate() }}><Copy size={15} /><span>Duplicar</span></button>
      <button type="button" onClick={(event) => { closeMenu(event); onExport() }}><Download size={15} /><span>Exportar modelo</span></button>
    </div>
  </details>
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [latest, setLatest] = useState<DraftRecord | null>(null)
  const [localError, setLocalError] = useState('')
  const [actionBusy, setActionBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')

  useEffect(() => {
    let active = true
    const refreshLocal = () => { try { const drafts = readDrafts(); setLatest([...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))[0] || null); setLocalError('') } catch { setLocalError('Não foi possível ler as edições deste navegador.') } }
    refreshLocal(); window.addEventListener('storage', refreshLocal)
    void api.status().then(requireConnection).then((status) => status.demo ? demoDashboard : api.dashboard())
      .then((data) => { if (active) setSummary(data) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a visão geral.') })
    return () => { active = false; window.removeEventListener('storage', refreshLocal) }
  }, [reload])

  const [today] = useState(() => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))
  const retry = () => { setSummary(null); setError(''); setReload((value) => value + 1) }
  const duplicateCampaign = async (campaign: Campaign) => {
    if (actionBusy) return
    setActionBusy(campaign.id); setActionError(''); setActionNotice('')
    try {
      const source = campaign.body !== undefined ? campaign : await api.campaign(campaign.id)
      const copy: DraftRecord = { id: `local-${crypto.randomUUID()}`, subject: `${source.subject || 'Sem assunto'} — cópia`, content: source.body || '', description: source.description, buttondownTemplate: source.template === 'modern' ? 'modern' : 'classic', templateId: null, status: 'draft', revision: 0, updatedAt: timestampNow() }
      writeDraft(copy); setLatest(copy); setActionNotice('Cópia criada nos seus rascunhos.')
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível duplicar a edição.') }
    finally { setActionBusy('') }
  }
  const exportCampaign = async (campaign: Campaign) => {
    if (actionBusy) return
    setActionBusy(campaign.id); setActionError(''); setActionNotice('')
    try {
      const source = campaign.body !== undefined ? campaign : await api.campaign(campaign.id)
      if (!source.body) throw new Error('Esta edição ainda não tem conteúdo para exportar.')
      const safeName = (source.subject || 'newsletter').toLocaleLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'newsletter'
      downloadFile(`${safeName}-modelo.html`, source.body, 'text/html')
      setActionNotice('Modelo exportado em HTML.')
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível exportar o modelo.') }
    finally { setActionBusy('') }
  }

  return <>
    <PageTitle eyebrow={`HOJE · ${today}`} title="Um bom dia para escrever." description="Seu espaço para criar e acompanhar edições." />
    <section className="continue-card" aria-label="Continue de onde parou"><p className="eyebrow">CONTINUE DE ONDE PAROU</p>{latest ? <><h2>{latest.subject || 'Sem assunto'}</h2><p>Atualizada em {dateLabel(latest.updatedAt)} · {latest.cloudSavedRevision !== latest.revision || (latest.buttondownId && latest.syncedRevision !== latest.revision) ? 'Sincronização pendente' : 'Salva neste dispositivo'}</p><div className="continue-actions"><Link to={`/editor/${encodeURIComponent(latest.id)}`}><Button icon={<PenLine size={16} />}>Continuar escrevendo</Button></Link><Link to="/editor/new"><Button variant="outline">Nova edição</Button></Link></div></> : <><h2>Sua próxima edição começa aqui.</h2><p>{localError || 'Abra um rascunho e comece a escrever.'}</p><Link to="/editor/new"><Button>Nova edição</Button></Link></>}</section>
    {summary?.demo && <DemoNotice />}
    {error && <ErrorState message={error} onRetry={retry} />}
    {!summary && !error && <LoadingState label="Buscando dados da newsletter…" />}
    {summary && <>
      {summary.integrationError && <ErrorState message={summary.integrationError} onRetry={retry} />}
      {summary.partial && <p className="dashboard-sync-warning" role="alert">Alguns dados não puderam ser atualizados{summary.stale ? ' · exibindo a última resposta válida.' : '.'}</p>}
      {summary.cached && !summary.partial && <p className="dashboard-cache-note" role="status">Dados recentes em cache de curta duração.</p>}
      <details className="dashboard-metrics"><summary>Indicadores da Buttondown</summary><p>Totais da plataforma; edições salvas apenas neste navegador aparecem em “Continue de onde parou”.</p><section className="metric-strip" aria-label="Resumo da newsletter">
        <div className="metric-item"><span className="metric-label"><UsersRound size={15} /> ASSINANTES</span><strong>{summary.subscribers?.toLocaleString('pt-BR') ?? '—'}</strong><small>inscrições ativas</small></div>
        <div className="metric-item"><span className="metric-label"><ArrowRight size={15} /> NOVOS</span><strong>{summary.newSubscribers?.toLocaleString('pt-BR') ?? '—'}</strong><small>neste mês</small></div>
        <div className="metric-item"><span className="metric-label"><Mail size={15} /> PUBLICADAS</span><strong>{summary.sentCampaigns?.toLocaleString('pt-BR') ?? '—'}</strong><small>edições enviadas</small></div>
        <div className="metric-item"><span className="metric-label"><FileText size={15} /> RASCUNHOS</span><strong>{summary.drafts?.toLocaleString('pt-BR') ?? '—'}</strong><small>em construção</small></div>
        <div className="metric-item"><span className="metric-label"><CalendarClock size={15} /> AGENDADAS</span><strong>{summary.scheduled?.toLocaleString('pt-BR') ?? '—'}</strong><small>próximos envios</small></div>
      </section></details>
      <section className="dashboard-lower">
        <div className="section-heading"><div><p className="eyebrow">CADERNO DE BORDO</p><h2>Movimentações recentes</h2></div><Link className="subtle-link" to="/campaigns">Ver edições <ArrowUpRight size={14} /></Link></div>
        {actionError && <ErrorState message={actionError} />}
        {actionNotice && <p className="dashboard-action-notice" role="status">{actionNotice}</p>}
        {summary.recent.length ? <div className="dashboard-campaign-table-wrap"><table className="dashboard-campaign-table"><thead><tr><th scope="col">EDIÇÃO</th><th scope="col">DATA DE CRIAÇÃO</th><th scope="col">AÇÕES</th></tr></thead><tbody>
          {summary.recent.slice(0, 5).map((campaign) => <tr key={campaign.id}>
            <td><div className="dashboard-campaign-title"><strong title={campaign.subject}>{campaign.subject || 'Sem assunto'}</strong><StatusPill tone={campaign.status === 'sent' ? 'success' : campaign.status === 'draft' ? 'neutral' : 'warning'}>{statusLabel(campaign.status)}</StatusPill></div></td>
            <td><time dateTime={campaign.creation_date || undefined}>{dateTimeLabel(campaign.creation_date)}</time></td>
            <td><DashboardActionMenu campaign={campaign} onDuplicate={() => void duplicateCampaign(campaign)} onExport={() => void exportCampaign(campaign)} /></td>
          </tr>)}
        </tbody></table></div> : summary.unavailable?.includes('recent') ? <div className="quiet-empty"><p>As campanhas recentes não puderam ser atualizadas agora.</p><button className="text-button" type="button" onClick={retry}>Tentar novamente</button></div> : <div className="quiet-empty"><p>Nenhuma campanha por aqui. O lado bom é que ainda não mandamos nenhuma vergonha por e-mail.</p><Link to="/editor/new">Começar uma edição <ArrowRight size={14} /></Link></div>}
      </section>
      {summary.upcoming.length > 0 && <section className="upcoming-section"><div className="section-heading"><div><p className="eyebrow">PRÓXIMOS ENVIOS</p><h2>Já têm hora marcada</h2></div></div><div className="activity-list">{summary.upcoming.map((campaign) => <Link className="activity-row" to={`/editor/${encodeURIComponent(campaign.id)}${campaign.status === 'draft' ? '' : '?copy=1'}`} key={campaign.id}><div className="activity-date">{dateLabel(campaign.publish_date)}</div><div className="activity-main"><strong>{campaign.subject || 'Sem assunto'}</strong><span>Preparada na Buttondown</span></div><StatusPill tone="warning">Agendada</StatusPill></Link>)}</div></section>}
      <section className="quick-create"><div className="quick-glyph">✳</div><div><p className="eyebrow">UMA IDEIA NÃO PRECISA ESPERAR</p><h2>Abra um rascunho e veja no que dá.</h2></div><Link to="/templates" className="subtle-link">Escolher um template <ArrowRight size={15} /></Link></section>
      <p className="data-footnote">{summary.demo ? <StatusPill tone="warning">AMOSTRA FICTÍCIA</StatusPill> : <StatusPill tone="success">DADOS BUTTONDOWN</StatusPill>} <span>{summary.demo ? 'Conecte a API para substituir a demonstração por dados reais.' : summary.cached || summary.stale ? 'Indicadores recentes mantidos em cache privado.' : 'Indicadores carregados diretamente da API Buttondown.'}</span></p>
    </>}
  </>
}
