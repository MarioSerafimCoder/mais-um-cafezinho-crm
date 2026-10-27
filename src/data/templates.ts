import type { Campaign, DashboardSummary, NewsletterSettings, NewsletterTemplateId, Subscriber } from '../types'
import { escapeHtml, safeUrl } from '../../shared/urls'

export type NewsletterTemplate = {
  id: NewsletterTemplateId
  number: string
  name: string
  summary: string
  category: string
  subject: string
  content: string
}

const signature = `
<hr />
<p><strong>Mais um Cafezinho</strong><br />Uma conversa sem pressa sobre o que merece atenção.</p>
<p><a href="https://marioserafim.com.br">Portfólio</a> &nbsp;·&nbsp; <a href="https://marioserafim.com.br/blog">Blog</a></p>
<p><a href="{{ unsubscribe_url }}">Descadastrar desta newsletter</a></p>`

export const templates: NewsletterTemplate[] = [
  {
    id: 'blog',
    number: '01',
    name: 'Novidades do blog',
    summary: 'Um artigo novo, contexto suficiente e um convite para continuar a conversa.',
    category: 'ARTIGO',
    subject: 'Saiu do forno: um texto novo no blog',
    content: `<p>EDIÇÃO · MAIS UM CAFEZINHO</p>
<h1>Uma ideia que merecia sair da gaveta</h1>
<p>Um texto novo, uma implicância antiga e a chance de conversar sem o algoritmo interrompendo.</p>
<h2>O que tem por trás deste texto?</h2>
<p>Conte o que te fez escrever. Abra uma janela para a ideia — a visita guiada fica para o artigo.</p>
<blockquote><p>Um comentário seu, uma provocação ou a frase que ficou depois de fechar o arquivo.</p></blockquote>
<p><a href="https://marioserafim.com.br/blog">Ler o artigo completo →</a></p>${signature}`,
  },
  {
    id: 'curadoria',
    number: '02',
    name: 'Curadoria editorial',
    summary: 'Referências, projetos e ideias que valem dividir com mais alguém.',
    category: 'REFERÊNCIAS',
    subject: 'Coisas boas que encontrei pelo caminho',
    content: `<p>EDIÇÃO · MAIS UM CAFEZINHO</p>
<h1>Pequenas descobertas, grande vontade de compartilhar</h1>
<p>Algumas coisas me fizeram parar o scroll. Achei justo dividir, já que o café ainda está quente.</p>
<hr />
<h2>01 / Um projeto para visitar com calma</h2>
<p><strong>Nome da referência</strong> · Fonte ou autoria</p>
<p>O que é, por que chamou minha atenção e onde isso toca o nosso trabalho.</p>
<p><a href="https://example.com">Ver a referência →</a></p>
<hr />
<h2>02 / Uma ideia para levar junto</h2>
<p>Inclua outra referência, estudo ou descoberta. O comentário pessoal é o que transforma uma lista em curadoria.</p>
<p><a href="https://example.com">Abrir o link original →</a></p>${signature}`,
  },
  {
    id: 'especial',
    number: '03',
    name: 'Edição especial',
    summary: 'Mais espaço para uma ideia longa, uma imagem marcante ou uma narrativa.',
    category: 'ENSAIO',
    subject: 'Uma edição especial, sem olhar o relógio',
    content: `<p>EDIÇÃO ESPECIAL · MAIS UM CAFEZINHO</p>
<h1>Uma história que pede mais uma xícara</h1>
<p><em>Uma frase de abertura, um detalhe curioso ou aquela imagem que continua na cabeça.</em></p>
<p>Comece por aqui. Edições especiais podem ser mais longas; ainda assim, deixe espaço para o leitor respirar entre uma ideia e outra.</p>
<h2>Uma pausa para olhar de novo</h2>
<p>Traga uma imagem, uma citação ou uma seção curta para mudar o ritmo. Depois, conte o que ela significa para você.</p>
<blockquote><p>Uma frase destacada para marcar o compasso da edição.</p></blockquote>
<h2>Continuando a conversa</h2>
<p>Desenvolva a ideia com o contexto necessário, sem perder a voz de quem está escrevendo para uma pessoa — não para uma planilha.</p>
<p>Obrigado por dividir este café comigo.</p>${signature}`,
  },
]

export function getTemplate(id: NewsletterTemplateId | null | undefined, settings?: NewsletterSettings) {
  const template = templates.find((item) => item.id === id) ?? templates[2]
  if (!settings) return template
  const links = (url: string, fallback: string) => escapeHtml(safeUrl(url) ? url : fallback)
  const author = escapeHtml(settings.senderName)
  const socials = [['Instagram', settings.instagramUrl], ['LinkedIn', settings.linkedinUrl]]
    .filter(([, url]) => url && safeUrl(url))
    .map(([label, url]) => `<a href="${escapeHtml(url)}">${label}</a>`).join(' · ')
  return {
    ...template,
    content: template.content
      .replace(/https:\/\/marioserafim\.com\.br\/blog|https:\/\/marioserafim\.com\.br/g, (url) => links(url.endsWith('/blog') ? settings.blogUrl : settings.portfolioUrl, url))
      .replaceAll('Mais um Cafezinho', escapeHtml(settings.newsletterName))
      .replace('<hr />\n<p><strong>', `<p>Até a próxima xícara,<br /><strong>${author}</strong></p>${socials ? `<p>${socials}</p>` : ''}<hr />\n<p><strong>`),
  }
}

export function templatePreview(content: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#fff;color:#171716;font:16px/1.7 Georgia,serif}.edition{max-width:620px;margin:auto;padding:32px 24px}h1{font-size:32px;line-height:1.2}h2{font-size:23px;line-height:1.3}p:first-child{font:11px monospace;color:#b5362b;letter-spacing:1px}a{color:#b5362b}blockquote{border-left:2px solid #c53a2d;padding-left:16px;margin-left:0}hr{border:0;border-top:1px solid #ddd;margin:28px 0}img{max-width:100%;height:auto}</style></head><body><main class="edition">${content}</main></body></html>`
}

export const demoSubscribers: Subscriber[] = [
  { id: 'demo-01', email_address: 'ana.lima@example.com', type: 'regular', source: 'organic', creation_date: '2026-10-24T13:20:00Z', metadata: { name: 'Ana Lima' } },
  { id: 'demo-02', email_address: 'bruno.matos@example.com', type: 'regular', source: 'embedded_form', creation_date: '2026-10-23T16:45:00Z', metadata: { name: 'Bruno Matos' } },
  { id: 'demo-03', email_address: 'carol.souza@example.com', type: 'unsubscribed', source: 'organic', creation_date: '2026-10-22T09:14:00Z', metadata: { name: 'Carol Souza' } },
  { id: 'demo-04', email_address: 'daniel.costa@example.com', type: 'regular', source: 'form', creation_date: '2026-10-20T11:03:00Z', metadata: { name: 'Daniel Costa' } },
  { id: 'demo-05', email_address: 'elisa.reis@example.com', type: 'regular', source: 'organic', creation_date: '2026-10-18T18:32:00Z', metadata: { name: 'Elisa Reis' } },
  { id: 'demo-06', email_address: 'fabio.nunes@example.com', type: 'unactivated', source: 'api', creation_date: '2026-10-17T08:01:00Z', metadata: { name: 'Fábio Nunes' } },
  { id: 'demo-07', email_address: 'gabi.ferreira@example.com', type: 'regular', source: 'embedded_form', creation_date: '2026-10-14T20:11:00Z', metadata: { name: 'Gabi Ferreira' } },
]

export const demoCampaigns: Campaign[] = [
  { id: 'demo-campaign-1', subject: 'Um caderno, três ideias e um café', status: 'sent', creation_date: '2026-10-24T10:00:00Z', publish_date: '2026-10-24T10:00:00Z', demo: true },
  { id: 'demo-campaign-2', subject: 'O que tenho lido, visto e guardado', status: 'sent', creation_date: '2026-10-10T10:00:00Z', publish_date: '2026-10-10T10:00:00Z', demo: true },
  { id: 'demo-campaign-3', subject: 'Notas sobre prestar atenção', status: 'draft', creation_date: '2026-10-27T10:00:00Z', body: templates[0].content, demo: true },
]

export const demoDashboard: DashboardSummary = {
  subscribers: 1284,
  newSubscribers: 38,
  sentCampaigns: 24,
  drafts: 1,
  scheduled: 0,
  recent: demoCampaigns,
  upcoming: [],
  demo: true,
}
