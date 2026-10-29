import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, PenLine, UsersRound, Mail, FileText, CalendarClock } from 'lucide-react'
import { api, requireConnection } from '../lib/api'
import { readDrafts } from '../lib/storage'
import type { DraftRecord } from '../types'
import { demoDashboard } from '../data/templates'
import type { DashboardSummary } from '../types'
import { Button, DemoNotice, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui'

function dateLabel(date?: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  return Number.isNaN(parsed.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [latest, setLatest] = useState<DraftRecord | null>(null)
  const [localError, setLocalError] = useState('')

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

  return <>
    <PageTitle eyebrow={`HOJE · ${today}`} title="Um bom dia para escrever." description="Seu espaço para criar e acompanhar edições." />
    <section className="continue-card" aria-label="Continue de onde parou"><p className="eyebrow">CONTINUE DE ONDE PAROU</p>{latest ? <><h2>{latest.subject || 'Sem assunto'}</h2><p>Atualizada em {dateLabel(latest.updatedAt)} · {latest.cloudSavedRevision !== latest.revision || (latest.buttondownId && latest.syncedRevision !== latest.revision) ? 'Sincronização pendente' : 'Salva neste dispositivo'}</p><div className="continue-actions"><Link to={`/editor/${encodeURIComponent(latest.id)}`}><Button icon={<PenLine size={16} />}>Continuar escrevendo</Button></Link><Link to="/editor/new"><Button variant="outline">Nova edição</Button></Link></div></> : <><h2>Sua próxima edição começa aqui.</h2><p>{localError || 'Abra um rascunho e comece a escrever.'}</p><Link to="/editor/new"><Button>Nova edição</Button></Link></>}</section>
    {summary?.demo && <DemoNotice />}
    {error && <ErrorState message={error} onRetry={retry} />}
    {!summary && !error && <LoadingState label="Buscando dados da newsletter…" />}
    {summary && <>
      <details className="dashboard-metrics"><summary>Indicadores da Buttondown</summary><p>Totais da plataforma; edições salvas apenas neste navegador aparecem em “Continue de onde parou”.</p><section className="metric-strip" aria-label="Resumo da newsletter">
        <div className="metric-item"><span className="metric-label"><UsersRound size={15} /> ASSINANTES</span><strong>{summary.subscribers?.toLocaleString('pt-BR') ?? '—'}</strong><small>inscrições ativas</small></div>
        <div className="metric-item"><span className="metric-label"><ArrowRight size={15} /> NOVOS</span><strong>{summary.newSubscribers?.toLocaleString('pt-BR') ?? '—'}</strong><small>neste mês</small></div>
        <div className="metric-item"><span className="metric-label"><Mail size={15} /> PUBLICADAS</span><strong>{summary.sentCampaigns?.toLocaleString('pt-BR') ?? '—'}</strong><small>edições enviadas</small></div>
        <div className="metric-item"><span className="metric-label"><FileText size={15} /> RASCUNHOS</span><strong>{summary.drafts?.toLocaleString('pt-BR') ?? '—'}</strong><small>em construção</small></div>
        <div className="metric-item"><span className="metric-label"><CalendarClock size={15} /> AGENDADAS</span><strong>{summary.scheduled?.toLocaleString('pt-BR') ?? '—'}</strong><small>próximos envios</small></div>
      </section></details>
      <section className="dashboard-lower">
        <div className="section-heading"><div><p className="eyebrow">CADERNO DE BORDO</p><h2>Movimentações recentes</h2></div><Link className="subtle-link" to="/campaigns">Ver edições <ArrowUpRight size={14} /></Link></div>
        {summary.recent.length ? <div className="activity-list">
          {summary.recent.slice(0, 5).map((campaign) => <Link className="activity-row" to={`/editor/${encodeURIComponent(campaign.id)}${campaign.status === 'draft' ? '' : '?copy=1'}`} key={campaign.id}>
            <div className="activity-date">{dateLabel(campaign.publish_date || campaign.creation_date)}</div>
            <div className="activity-main"><strong>{campaign.subject || 'Sem assunto'}</strong><span>{campaign.status === 'sent' ? 'Edição enviada' : campaign.status === 'draft' ? 'Rascunho em andamento' : campaign.status === 'scheduled' ? 'Envio agendado' : campaign.status}</span></div>
            <StatusPill tone={campaign.status === 'sent' ? 'success' : campaign.status === 'draft' ? 'neutral' : 'warning'}>{campaign.status === 'sent' ? 'Publicado' : campaign.status === 'draft' ? 'Rascunho' : campaign.status === 'scheduled' ? 'Agendado' : campaign.status}</StatusPill>
          </Link>)}
        </div> : <div className="quiet-empty"><p>Nenhuma campanha por aqui. O lado bom é que ainda não mandamos nenhuma vergonha por e-mail.</p><Link to="/editor/new">Começar uma edição <ArrowRight size={14} /></Link></div>}
      </section>
      {summary.upcoming.length > 0 && <section className="upcoming-section"><div className="section-heading"><div><p className="eyebrow">PRÓXIMOS ENVIOS</p><h2>Já têm hora marcada</h2></div></div><div className="activity-list">{summary.upcoming.map((campaign) => <Link className="activity-row" to={`/editor/${encodeURIComponent(campaign.id)}${campaign.status === 'draft' ? '' : '?copy=1'}`} key={campaign.id}><div className="activity-date">{dateLabel(campaign.publish_date)}</div><div className="activity-main"><strong>{campaign.subject || 'Sem assunto'}</strong><span>Preparada na Buttondown</span></div><StatusPill tone="warning">Agendada</StatusPill></Link>)}</div></section>}
      <section className="quick-create"><div className="quick-glyph">✳</div><div><p className="eyebrow">UMA IDEIA NÃO PRECISA ESPERAR</p><h2>Abra um rascunho e veja no que dá.</h2></div><Link to="/templates" className="subtle-link">Escolher um template <ArrowRight size={15} /></Link></section>
      <p className="data-footnote">{summary.demo ? <StatusPill tone="warning">AMOSTRA FICTÍCIA</StatusPill> : <StatusPill tone="success">DADOS BUTTONDOWN</StatusPill>} <span>{summary.demo ? 'Conecte a API para substituir a demonstração por dados reais.' : 'Indicadores carregados diretamente da API Buttondown.'}</span></p>
    </>}
  </>
}
