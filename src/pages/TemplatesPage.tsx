import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, BookOpen, Coffee, Sparkles } from 'lucide-react'
import { templates } from '../data/templates'
import { Button, PageTitle } from '../components/ui'

const motifs = [BookOpen, Sparkles, Coffee]

export function TemplatesPage() {
  return <>
    <PageTitle eyebrow="BIBLIOTECA DE EDIÇÕES" title="Templates" description="Três pontos de partida. O resto é seu." />
    <div className="template-intro"><span className="intro-index">01—03</span><p>Estruturas editoriais para dar ritmo à edição e deixar o assunto principal respirar. Todo bloco continua editável.</p></div>
    <section className="template-grid">
      {templates.map((template, index) => {
        const Motif = motifs[index]
        return <article className={`template-card template-${template.id}`} key={template.id}>
          <div className="template-card-top"><span className="template-number">{template.number}</span><span className="template-category">{template.category}</span></div>
          <div className="template-art"><div className="template-art-paper"><span>MAIS UM CAFEZINHO</span><b>{template.name}</b><i />{Array.from({ length: index === 1 ? 4 : 3 }, (_, n) => <em key={n} />)}</div><Motif size={24} strokeWidth={1.3} className="template-motif" /></div>
          <div className="template-card-copy"><h2>{template.name}</h2><p>{template.summary}</p><Link to={`/editor/new?template=${template.id}`}><Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>Usar template</Button></Link></div>
        </article>
      })}
    </section>
    <div className="template-footer-note"><span>+</span><p>Os templates guardam sua estrutura neste navegador. O conteúdo só vai para a Buttondown quando você escolher <strong>Salvar rascunho lá</strong>.</p><a href="https://react.email/docs/editor" target="_blank" rel="noreferrer">Sobre o editor <ArrowUpRight size={13} /></a></div>
  </>
}
