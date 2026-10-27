import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { getTemplate, templatePreview, templates } from '../data/templates'
import { readSettings } from '../lib/storage'
import { Button, PageTitle } from '../components/ui'

export function TemplatesPage() {
  return <>
    <PageTitle eyebrow="BIBLIOTECA DE EDIÇÕES" title="Templates" description="Três pontos de partida. O resto é seu." />
    <div className="template-intro"><span className="intro-index">01—03</span><p>Estruturas editoriais para dar ritmo à edição e deixar o assunto principal respirar. Todo bloco continua editável.</p></div>
    <section className="template-grid">
      {templates.map((template) => {
        return <article className={`template-card template-${template.id}`} key={template.id}>
          <div className="template-card-top"><span className="template-number">{template.number}</span><span className="template-category">{template.category}</span></div>
          <div className="template-art template-real-preview"><iframe title={`Prévia real: ${template.name}`} sandbox="" tabIndex={-1} referrerPolicy="no-referrer" srcDoc={templatePreview(getTemplate(template.id, readSettings()).content)} /></div>
          <div className="template-card-copy"><h2>{template.name}</h2><p>{template.summary}</p><Link to={`/editor/new?template=${template.id}`}><Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>Usar template</Button></Link></div>
        </article>
      })}
    </section>
    <div className="template-footer-note"><span>+</span><p>Miniaturas do conteúdo real, com sua identidade editorial. O editor gera a prévia final do e-mail. Escolher um template começa um novo rascunho; as edições existentes ficam preservadas.</p><a href="https://react.email/editor" target="_blank" rel="noreferrer">Sobre o editor <ArrowUpRight size={13} /></a></div>
  </>
}
