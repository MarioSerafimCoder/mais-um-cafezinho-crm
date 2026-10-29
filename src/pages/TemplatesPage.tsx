import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { getTemplate, templatePreview, templates } from '../data/templates'
import { readSettings } from '../lib/storage'
import { Button, PageTitle } from '../components/ui'

export function TemplatesPage() {
  const [expanded, setExpanded] = useState<(typeof templates)[number] | null>(null)
  const settings = readSettings()
  const preview = (template: (typeof templates)[number], thumbnail = false) => {
    const html = templatePreview(getTemplate(template.id, settings).content, { newsletterName: settings.newsletterName, editionLabel: template.category })
    return thumbnail ? html.replace('</head>', '<style>html,body{overflow:hidden}::-webkit-scrollbar{display:none}</style></head>') : html
  }
  return <>
    <PageTitle eyebrow="BIBLIOTECA DE EDIÇÕES" title="Escolha o seu template" description="Primeiro, escolha a estrutura. Depois, escreva, revise e envie." />
    <div className="template-intro"><span className="intro-index">01—06</span><p>Estruturas editoriais para dar ritmo à edição e deixar o assunto principal respirar. Todo bloco continua editável.</p></div>
    <section className="template-grid">
      {templates.map((template) => {
        return <article className={`template-card template-${template.id}`} key={template.id}>
          <div className="template-card-top"><span className="template-number">{template.number}</span><span className="template-category">{template.category}</span></div>
          <div className="template-art template-real-preview"><iframe title={`Simulação no navegador: ${template.name}`} sandbox="" tabIndex={-1} referrerPolicy="no-referrer" scrolling="no" srcDoc={preview(template, true)} /></div>
          <div className="template-card-copy"><h2>{template.name}</h2><p>{template.summary}</p><div className="template-actions"><Button variant="quiet" size="sm" onClick={() => setExpanded(template)}>Ver prévia maior</Button><Link to={`/editor/new?template=${template.id}`}><Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>Usar template</Button></Link></div></div>
        </article>
      })}
    </section>
    {expanded && <div className="editor-dialog-backdrop" onClick={() => setExpanded(null)}><section role="dialog" aria-modal="true" aria-label={`Prévia: ${expanded.name}`} className="editor-dialog template-dialog" onClick={event => event.stopPropagation()}><div className="template-dialog-header"><h2>{expanded.name}</h2><Button variant="quiet" onClick={() => setExpanded(null)}>Fechar prévia</Button></div><iframe title={`Prévia ampliada: ${expanded.name}`} sandbox="" referrerPolicy="no-referrer" srcDoc={preview(expanded)} /><Link to={`/editor/new?template=${expanded.id}`}><Button>Começar edição</Button></Link></section></div>}
    <div className="template-footer-note"><span>+</span><p>Seis estruturas com a identidade do Mais um Cafezinho. Cores, assinatura e conteúdo prontos para você editar.</p><a href="https://react.email/editor" target="_blank" rel="noreferrer">Sobre o editor <ArrowUpRight size={13} /></a></div>
  </>
}
