# Editor GrapesJS + MJML

## Documento e migração
O único canvas usa GrapesJS OSS e grapesjs-mjml. Documentos novos e migrados
persistem como schemaVersion 3, componentes nativos e estilos inline por componente.
Os seis templates abrem nesse formato.

O adaptador lê Tiptap v2 (JSON canônico antes do HTML), HTML legado e rascunhos
Classic/Modern da Buttondown. A versão estruturada local/D1 tem prioridade.
Parágrafos, títulos, marcas, listas, citações, links, imagens, botões e tabelas
mantêm seus conteúdos editáveis. Listas, tabelas e contêineres estilizados usam
subárvores HTML editáveis em mj-text; imagens simples usam mj-image.
O mapeamento explícito fica em legacyNodeMap. Não se converte para texto puro.

A conversão verifica texto, ordem, hierarquia, formatação semântica, links e
imagens antes de persistir e novamente após normalização no canvas. Revisão,
identificadores, assunto, preheader, datas e metadados são mantidos.
Abrir/migrar sozinho não atualiza a Buttondown. Uma edição posterior ou a ação
explícita de sincronizar atualiza apenas o rascunho.

Antes de gravar uma migração, o original local é copiado uma única vez.
A migração aditiva 0005_editorial_originals.sql também protege a versão legada
que já está no D1, usando cópia do banco (não conteúdo original alegado pelo
cliente). O endpoint GET /api/drafts/:id?original=1 recupera esse original.
Originais exclusivamente locais permanecem disponíveis naquele navegador.
Falhas não substituem o documento por vazio; a tela oferece exportação.
CAS e a fila existente protegem revisões e respostas de rede atrasadas.

## Exportação
MJML 4.18 compila o documento inteiro com validação estrita. O corpo resultante
é centralizado em uma tabela externa. O fragmento enviado em modo plaintext
mantém estilos inline, tabelas, URLs e assinatura; nenhum rodapé de descadastro
é adicionado pelo CRM. A Buttondown continua responsável por esse rodapé.

CSS de larguras percentuais de colunas, normalmente colocado no head pelo MJML,
é aplicado inline antes da extração. Assim, as colunas são fluidas e permanecem
lado a lado também no mobile. Colunas de largura fixa em pixels são bloqueadas.
Não há dependência de fontes externas, CSS de cabeçalho ou widgets ativos.
Limites mantidos: HTML abaixo de 200 KB, documento nativo até 300 KB,
requisição D1 até 450 KB.

## Limitações explícitas
- HTML com folhas CSS no head/externas, tema global Tiptap personalizado e nós/
  atributos desconhecidos exigem recuperação assistida, sem descartar originais.
- Fancy e Markdown remoto sem HTML não são tratados como fonte HTML canônica.
- Apenas os componentes MJML compatíveis listados em shared/grapes-document.ts
  são admitidos. Scripts, formulários, raw HTML ativo e background URL são bloqueados.
- Meus blocos é uma biblioteca local do navegador (até 30 composições).
- O editor carregado sob demanda inclui o compilador MJML, gerando bundle maior.
- Testes validam o compilador e Chromium; não certificam todos os clientes de
  e-mail. Nenhum e-mail foi enviado para testar esta migração.

## Operação e validação
Aplicar a migração aditiva D1 antes da publicação. Não alterar Access, secrets
ou plano Buttondown. O editor guia edição, prévia, destinatários e resumo em
etapas distintas. O botão de teste usa somente o endpoint protegido de teste;
ele aceita endereços digitados quando `EDITORIAL_TEST_ENABLED=true`, ou respeita
a allowlist `EDITORIAL_TEST_RECIPIENTS` quando ela estiver configurada. O envio
de campanha continua condicionado à flag explícita `CAMPAIGN_SENDING_ENABLED`.

Executar pnpm test, pnpm lint, pnpm build e pnpm test:e2e.
A suíte usa o canvas e compilador reais, D1 local, recuperação em outro contexto,
arrastar e soltar, edição WYSIWYG, upload com falha, controles de revisão,
migração de JSON real legado e os seis templates. Apenas integrações externas
de teste são simuladas; nenhum endpoint real de envio é chamado durante a suíte.

Validação em 29/10/2026: 126 testes unitários, 27 testes E2E, lint, build e compilação das Pages Functions aprovados.
