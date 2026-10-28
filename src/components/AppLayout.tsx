import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Coffee, LayoutDashboard, Mail, PenLine, UsersRound, Settings2, Menu, X, Sun, Moon, ArrowUpRight } from 'lucide-react'
import { api } from '../lib/api'
import { readSettings, writeSettings } from '../lib/storage'
import type { IntegrationStatus } from '../types'
import { StatusPill } from './ui'

const navigation = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/campaigns', label: 'Edições', icon: Mail },
  { to: '/editor/new', label: 'Nova edição', icon: PenLine },
  { to: '/subscribers', label: 'Assinantes', icon: UsersRound },
  { to: '/settings', label: 'Configurações', icon: Settings2 },
]

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [theme, setTheme] = useState(readSettings().theme)
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const syncTheme = () => setTheme(readSettings().theme)
    window.addEventListener('settings-changed', syncTheme)
    return () => window.removeEventListener('settings-changed', syncTheme)
  }, [theme])

  useEffect(() => {
    let active = true
    void api.status().then((value) => { if (active) setIntegration(value) }).catch(() => { if (active) setIntegration({ configured: false, connected: false, demo: false }) })
    return () => { active = false }
  }, [location.pathname])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    const settings = readSettings()
    try { writeSettings({ ...settings, theme: next }) } catch { setTheme(theme); return }
    window.dispatchEvent(new Event('settings-changed'))
  }

  const sidebar = <>
    <div className="brand-lockup">
      <div className="brand-symbol"><Coffee size={20} strokeWidth={1.7} /></div>
      <div className="brand-copy"><span>MAIS UM</span><strong>cafezinho</strong><small>NEWSLETTER STUDIO</small></div>
      <button className="icon-button drawer-close" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
    </div>
    <div className="workspace-label">ESTÚDIO EDITORIAL</div>
    <nav className="main-nav" aria-label="Navegação principal">
      {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setDrawerOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        <Icon size={17} strokeWidth={1.75} /><span>{label}</span>{to === '/editor/new' && <span className="nav-plus">+</span>}
      </NavLink>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-integration"><span>INTEGRAÇÃO</span><StatusPill tone={integration?.connected ? 'success' : 'warning'}>{!integration ? 'Verificando' : integration.demo ? 'Demonstração' : integration.connected ? 'Buttondown conectada' : 'Desconectada'}</StatusPill></div>
      <a className="portfolio-link" href="https://marioserafim.com.br" target="_blank" rel="noreferrer">marioserafim.com.br <ArrowUpRight size={13} /></a>
      <div className="sidebar-author"><div className="author-monogram">MS</div><div><strong>Mário Serafim</strong><span>Direção de arte</span></div><button className="icon-button theme-toggle" aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'} onClick={toggleTheme}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button></div>
    </div>
  </>

  return <div className="app-shell">
    <aside className="sidebar">{sidebar}</aside>
    {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
    <aside className={`mobile-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>{sidebar}</aside>
    <div className="main-column">
      <header className="mobile-header"><button className="icon-button" aria-label="Abrir menu" onClick={() => setDrawerOpen(true)}><Menu size={20} /></button><span>MAIS UM <strong>cafezinho</strong></span><button className="icon-button" aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'} onClick={toggleTheme}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button></header>
      <main className="main-content"><Outlet /></main>
      <footer className="app-footer"><span>Feito para escrever melhor, não para medir tudo.</span><span>MAIS UM CAFEZINHO <span className="footer-mark">✳</span> 2026</span></footer>
    </div>
  </div>
}
