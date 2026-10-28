import type { Campaign, DashboardSummary, NewsletterSettings, NewsletterTemplateId, Subscriber } from '../types'
import { escapeHtml, safeUrl } from '../../shared/urls'
import { emailPreviewDocument, type EmailLayoutOptions } from '../lib/email-layout'

export type NewsletterTemplate = {
  id: NewsletterTemplateId
  number: string
  name: string
  summary: string
  category: string
  subject: string
  preheader: string
  buttondownTemplate: 'classic' | 'modern'
  content: string
}

const signature = `<hr />
<p>Até a próxima,<br /><strong>Mário Serafim</strong> · Diretor de arte.</p>
<p><a href="https://marioserafim.com.br">Portfólio</a> &nbsp;·&nbsp; <a href="https://marioserafim.com.br/blog">Blog</a>[[OPTIONAL_EDITORIAL_LINKS]]</p>
<p>Se uma ideia ficar na cabeça, responda este e-mail. Eu leio.</p>`

export const templates: NewsletterTemplate[] = [
  {
    id: 'blog',
    number: '01',
    name: 'Novidades do blog',
    summary: 'Uma ideia do blog, com contexto para a conversa começar antes do clique.',
    category: 'ARTIGO',
    subject: 'O que vem antes do logo',
    preheader: 'Uma conversa sobre as decisões que aparecem antes da primeira tela.',
    buttondownTemplate: 'classic',
    content: `<h1>Um bom projeto começa antes do logo</h1>
<p>O logo costuma chegar no fim da conversa — embora seja a primeira coisa que todo mundo pergunta. Antes dele vêm as perguntas menos fotogênicas: o que precisa mudar, para quem, e por que alguém deveria se importar?</p>
<h2>A parte que não cabe numa prancha</h2>
<p>Identidade visual não é uma coleção de peças bonitas. É um jeito de organizar percepção e tomar decisões com alguma coerência, inclusive quando ninguém está olhando para a apresentação.</p>
<blockquote><p>Se a estratégia só aparece no slide de estratégia, talvez ela ainda não tenha chegado ao projeto.</p></blockquote>
<p>Escrevi mais sobre esse começo — e sobre a tentação de pular direto para a forma — no blog.</p>
<p><a href="https://marioserafim.com.br/blog" style="display:inline-block;background-color:#b52930;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 19px">Continuar a leitura&nbsp;→</a></p>${signature}`,
  },
  {
    id: 'curadoria',
    number: '02',
    name: 'Curadoria editorial',
    summary: 'Links comentados e pequenas descobertas, sem transformar favoritos numa lista automática.',
    category: 'REFERÊNCIAS',
    subject: 'Notas de repertório: três ideias da semana',
    preheader: 'Uma referência visual, uma ideia incômoda e uma leitura para guardar.',
    buttondownTemplate: 'classic',
    content: `<h1>Três coisas que mereciam sair dos favoritos</h1>
<p>Minha pasta de links salvos é um arquivo arqueológico: muita intenção, pouca visita. Separei três coisas que sobreviveram à escavação desta semana.</p>
<h2>01 / Uma referência visual</h2>
<p><strong>Projeto e autoria</strong><br />Adicione o endereço real da referência junto ao nome. O que me fez parar: uma decisão de forma que parece simples depois que alguém a toma.</p>
<hr />
<h2>02 / Uma ideia para discordar</h2>
<p><strong>Texto ou argumento</strong><br />Adicione o endereço real da leitura junto ao título. Não precisa concordar comigo. O ponto é que esta ideia muda a pergunta que eu vinha fazendo.</p>
<hr />
<h2>03 / Uma coisa fora da tela</h2>
<p>Um objeto, conversa ou detalhe cotidiano que também merece entrar no repertório. A internet não precisa ganhar todas.</p>
<p>O comentário pessoal é o que transforma uma lista de links numa curadoria. Corte qualquer item que esteja aqui só para fechar a conta.</p>${signature}`,
  },
  {
    id: 'especial',
    number: '03',
    name: 'Edição especial',
    summary: 'Um ensaio com mais respiro, citação destacada e espaço opcional para imagem.',
    category: 'ENSAIO',
    subject: 'O enquadramento também conta uma história',
    preheader: 'Um ensaio sobre contexto, autoria e o que muda quando a gente olha de novo.',
    buttondownTemplate: 'classic',
    content: `<h1>Uma imagem, três leituras possíveis</h1>
<p><em>Às vezes a gente olha para uma imagem procurando a resposta. Ela devolve uma pergunta — o que é menos conveniente e bem mais interessante.</em></p>
<p>Este espaço aceita uma imagem editorial, mas também funciona sem ela. Se entrar uma, que seja porque muda a leitura do texto; a caixa de entrada já tem imagens decorativas suficientes para uma vida inteira.</p>
<h2>O contexto também faz parte da imagem</h2>
<p>A primeira leitura costuma ser rápida: reconhecemos uma forma, encaixamos numa categoria e seguimos. A segunda exige um pouco mais de tempo. Quem escolheu esse enquadramento? O que ficou do lado de fora? Que detalhe parecia pequeno até alguém apontá-lo?</p>
<blockquote><p>Uma imagem nunca chega sozinha. Vem com o lugar de onde olhamos — e com tudo o que aprendemos a não ver.</p></blockquote>
<h2>O que muda quando voltamos</h2>
<p>Talvez nada. Ainda assim, olhar de novo é uma forma modesta de não deixar a primeira impressão decidir tudo. Se você tiver outra leitura, responda esta mensagem. A conversa continua melhor quando não termina numa conclusão redonda.</p>${signature}`,
  },
]

export function getTemplate(id: NewsletterTemplateId | null | undefined, settings?: NewsletterSettings) {
  const template = templates.find((item) => item.id === id) ?? templates[2]
  const links = (url: string | undefined, fallback: string) => escapeHtml(url && safeUrl(url) ? url : fallback)
  const author = escapeHtml(settings?.senderName || 'Mário Serafim')
  const socials = ([['Instagram', settings?.instagramUrl], ['LinkedIn', settings?.linkedinUrl]] as Array<[string, string | undefined]>)
    .flatMap(([label, url]) => url && safeUrl(url) ? [`<a href="${escapeHtml(url)}">${label}</a>`] : []).join(' · ')
  const contact = settings?.senderEmail && safeUrl(`mailto:${settings.senderEmail}`) ? `<a href="mailto:${escapeHtml(settings.senderEmail)}">E-mail</a>` : ''
  const optional = [socials, contact].filter(Boolean).join(' · ')
  return {
    ...template,
    content: template.content
      .replace(/https:\/\/marioserafim\.com\.br\/blog|https:\/\/marioserafim\.com\.br/g, (url) => links(url.endsWith('/blog') ? settings?.blogUrl : settings?.portfolioUrl, url))
      .replaceAll('Mais um Cafezinho', escapeHtml(settings?.newsletterName || 'Mais um Cafezinho'))
      .replaceAll('Mário Serafim', author)
      .replace('[[OPTIONAL_EDITORIAL_LINKS]]', optional ? ` &nbsp;·&nbsp; ${optional}` : ''),
  }
}

export function templatePreview(content: string, options?: Partial<EmailLayoutOptions>) {
  return emailPreviewDocument(content, {
    newsletterName: options?.newsletterName || 'Mais um Cafezinho',
    editionLabel: options?.editionLabel || 'EDIÇÃO DE ESTÚDIO',
    editionDate: options?.editionDate || '',
  })
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
  { id: 'demo-campaign-3', subject: 'Notas sobre prestar atenção', description: templates[0].preheader, template: templates[0].buttondownTemplate, status: 'draft', creation_date: '2026-10-27T10:00:00Z', body: getTemplate('blog').content, demo: true },
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
