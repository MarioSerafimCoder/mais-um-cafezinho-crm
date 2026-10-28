import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Save, ShieldCheck, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { readSettings, writeSettings } from '../lib/storage'
import type { IntegrationStatus, NewsletterSettings } from '../types'
import { Button, Field, PageTitle, StatusPill, SuccessMessage } from '../components/ui'

export function SettingsPage() {
  const [settings, setSettings] = useState<NewsletterSettings>(readSettings())
  const latest = useRef(settings)
  const [status, setStatus] = useState<IntegrationStatus>({ configured: false, connected: false, demo: false })
  const [error, setError] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [remote, setRemote] = useState<NewsletterSettings | null>(null)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { let active = true; void api.status().then((value) => { if (active) setStatus(value) }).catch(() => { if (active) setError('Não foi possível verificar a conexão. As configurações deste navegador continuam disponíveis.') }); return () => { active = false } }, [])

  const update = (key: keyof NewsletterSettings, value: string) => { const next = { ...latest.current, [key]: value }; latest.current = next; setSettings(next); setSaved(false) }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try { writeSettings(settings) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); return }
    window.dispatchEvent(new Event('settings-changed'))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2800)
  }

  return <>
    <PageTitle eyebrow="AJUSTES DO ESTÚDIO" title="Configurações" description="A identidade do Cafezinho, com os detalhes que fazem a casa funcionar." />
    {error && <p className="editor-inline-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <form className="settings-form" onSubmit={save}>
      <section className="settings-section">
        <div className="settings-section-title"><span>01</span><div><h2>Identidade</h2><p>Informações que aparecem nas edições e na interface.</p></div></div>
        <div className="settings-fields two-columns">
          <Field label="Nome da newsletter"><input value={settings.newsletterName} onChange={(event) => update('newsletterName', event.target.value)} /></Field>
          <Field label="Nome do remetente"><input value={settings.senderName} onChange={(event) => update('senderName', event.target.value)} /></Field>
          <Field label="E-mail de referência no CRM" hint="Este campo não altera o remetente na Buttondown. Configure o endereço de envio na plataforma."><input type="email" value={settings.senderEmail} onChange={(event) => update('senderEmail', event.target.value)} placeholder="oi@seudominio.com.br" /></Field>
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
        <div className="integration-card-icon"><KeyRound size={19} /></div><div className="integration-card-copy"><strong>{status.connected ? 'Conexão confirmada' : status.configured ? 'Chave configurada, conexão indisponível' : 'Chave ainda não configurada'}</strong><span>{status.reason || 'A chave fica exclusivamente no servidor. A verificação consulta a lista de assinantes sem alterá-la.'}</span></div><StatusPill tone={status.connected ? 'success' : 'warning'}>{status.demo ? 'Demonstração' : status.connected ? 'Conectada' : 'Desconectada'}</StatusPill>
      </div>
      <div className="security-copy"><ShieldCheck size={16} /><p>As rotas são protegidas por Cloudflare Access e validam o token JWT em cada solicitação. O painel nunca recebe a chave da API.</p></div>
      <a className="subtle-link external-doc" href="https://docs.buttondown.com/api-authentication" target="_blank" rel="noreferrer">Documentação de autenticação <ExternalLink size={13} /></a>
    </section>
    <details className="integration-section"><summary>Recuperação entre dispositivos · avançado</summary><section><h2>Recuperação entre dispositivos</h2><p>{status.cloud ? 'Banco editorial disponível. Só documentos e configurações são armazenados; assinantes continuam exclusivamente na Buttondown.' : 'O banco editorial não está configurado neste ambiente. As configurações continuam neste navegador.'}</p><div className="settings-cloud-actions"><Button variant="outline" disabled={!status.cloud || cloudBusy} onClick={() => { setCloudBusy(true); setError(''); const snapshot = { ...latest.current }; void api.saveCloudSettings(snapshot).then((result) => { const next = { ...latest.current, cloudRevision: result.cloudRevision }; writeSettings(next); latest.current = next; setSettings(next); setMessage('Configurações enviadas à nuvem. Alterações feitas durante a gravação continuam nesta cópia local.') }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha na nuvem.')).finally(() => setCloudBusy(false)) }}>Salvar configurações na nuvem</Button><Button variant="outline" disabled={!status.cloud || cloudBusy} onClick={() => { setCloudBusy(true); setError(''); void api.cloudSettings().then(setRemote).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao recuperar.')).finally(() => setCloudBusy(false)) }}>Consultar cópia da nuvem</Button></div>{remote && <div className="editor-inline-success"><span>Cópia remota: {remote.newsletterName} · {remote.senderName}</span><Button size="sm" onClick={() => { try { writeSettings(remote); latest.current = remote; setSettings(remote); setRemote(null); window.dispatchEvent(new Event('settings-changed')) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao aplicar.') } }}>Usar estas configurações</Button><Button size="sm" variant="quiet" onClick={() => setRemote(null)}>Manter minha cópia</Button></div>}</section></details>
  </>
}
