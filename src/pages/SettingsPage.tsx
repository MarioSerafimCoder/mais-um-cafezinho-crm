import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, Save, ShieldCheck, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { readSettings, writeSettings } from '../lib/storage'
import type { IntegrationStatus, NewsletterSettings } from '../types'
import { Button, Field, PageTitle, StatusPill, SuccessMessage } from '../components/ui'

export function SettingsPage() {
  const [settings, setSettings] = useState<NewsletterSettings>(readSettings())
  const [status, setStatus] = useState<IntegrationStatus>({ configured: false, demo: true })
  const [saved, setSaved] = useState(false)

  useEffect(() => { void api.status().then(setStatus).catch(() => setStatus({ configured: false, demo: true })) }, [])

  const update = (key: keyof NewsletterSettings, value: string) => setSettings((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    writeSettings(settings)
    window.dispatchEvent(new Event('settings-changed'))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2800)
  }

  return <>
    <PageTitle eyebrow="AJUSTES DO ESTÚDIO" title="Configurações" description="A identidade do Cafezinho, com os detalhes que fazem a casa funcionar." />
    <form className="settings-form" onSubmit={save}>
      <section className="settings-section">
        <div className="settings-section-title"><span>01</span><div><h2>Identidade</h2><p>Informações que aparecem nas edições e na interface.</p></div></div>
        <div className="settings-fields two-columns">
          <Field label="Nome da newsletter"><input value={settings.newsletterName} onChange={(event) => update('newsletterName', event.target.value)} /></Field>
          <Field label="Nome do remetente"><input value={settings.senderName} onChange={(event) => update('senderName', event.target.value)} /></Field>
          <Field label="E-mail do remetente" hint="Informativo; altere também nas configurações da Buttondown."><input type="email" value={settings.senderEmail} onChange={(event) => update('senderEmail', event.target.value)} placeholder="oi@seudominio.com.br" /></Field>
          <Field label="Tema da interface"><select value={settings.theme} onChange={(event) => update('theme', event.target.value)}><option value="light">Claro</option><option value="dark">Escuro</option></select></Field>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title"><span>02</span><div><h2>Links</h2><p>Atalhos usados no rodapé dos templates.</p></div></div>
        <div className="settings-fields two-columns">
          <Field label="Blog"><input type="url" value={settings.blogUrl} onChange={(event) => update('blogUrl', event.target.value)} /></Field>
          <Field label="Portfólio"><input type="url" value={settings.portfolioUrl} onChange={(event) => update('portfolioUrl', event.target.value)} /></Field>
          <Field label="Instagram"><input type="url" value={settings.instagramUrl} onChange={(event) => update('instagramUrl', event.target.value)} placeholder="https://instagram.com/..." /></Field>
          <Field label="LinkedIn"><input type="url" value={settings.linkedinUrl} onChange={(event) => update('linkedinUrl', event.target.value)} placeholder="https://linkedin.com/in/..." /></Field>
        </div>
      </section>
      <div className="settings-actions"><div>{saved && <SuccessMessage>Configurações salvas neste navegador.</SuccessMessage>}</div><Button type="submit" icon={<Save size={15} />}>Salvar alterações</Button></div>
    </form>
    <section className="integration-section">
      <div className="settings-section-title"><span>03</span><div><h2>Buttondown</h2><p>Credenciais protegidas nas Pages Functions do Cloudflare.</p></div></div>
      <div className="integration-card">
        <div className="integration-card-icon"><KeyRound size={19} /></div><div className="integration-card-copy"><strong>{status.configured ? 'Chave configurada' : 'Chave ainda não configurada'}</strong><span>{status.configured ? 'A chave não é exibida neste painel. A conexão será confirmada na próxima consulta.' : 'Configure BUTTONDOWN_API_KEY no ambiente do Cloudflare Pages. Nada de colar segredos aqui.'}</span></div><StatusPill tone={status.configured ? 'success' : 'warning'}>{status.configured ? 'Configurada' : 'Demonstração'}</StatusPill>
      </div>
      <div className="security-copy"><ShieldCheck size={16} /><p>As rotas são protegidas por Cloudflare Access e validam o token JWT em cada solicitação. O painel nunca recebe a chave da API.</p></div>
      <a className="subtle-link external-doc" href="https://docs.buttondown.com/api-authentication" target="_blank" rel="noreferrer">Documentação de autenticação <ExternalLink size={13} /></a>
    </section>
  </>
}
