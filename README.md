# Mais um Cafezinho — CRM & Newsletter Studio

Um painel editorial em português para organizar assinantes, preparar campanhas e manter os rascunhos da newsletter. O MVP usa a API da Buttondown quando configurada e oferece dados de demonstração quando executado sem as Pages Functions.

## O que está pronto

- Dashboard com assinantes, campanhas recentes e próximos envios.
- Busca e paginação de assinantes, leitura de campanhas da Buttondown e edição de rascunhos.
- Três templates editáveis, editor visual com prévia desktop/mobile e upload de imagens.
- Salvamento local automático e sincronização de rascunhos com a Buttondown.
- As ações de envio e publicação estão desativadas. A API da aplicação não chama o endpoint de envio.
- Cloudflare Access protege as Pages Functions. A chave da Buttondown permanece no servidor.

## Tecnologias

React, TypeScript, Vite, Tailwind CSS 4, React Email Editor, Cloudflare Pages Functions, Cloudflare D1 e Buttondown API (`2026-04-01`). O D1 guarda documentos estruturados e configurações editoriais; as cópias offline ficam no `localStorage`. A Buttondown continua como fonte oficial de campanhas e assinantes.

## Rodar localmente

Requer Node.js 24.18.0 e pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

O Vite abre o painel em modo de demonstração. Para validar o projeto:

```sh
pnpm test
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Para exercitar as Pages Functions com recuperação de documentos no D1 **local**, use os comandos abaixo. Não é criada infraestrutura remota. O banco de revisão fica em `.wrangler/editor-local`; os testes usam `.wrangler/editor-test`, separado. A demonstração fica identificada. Se desejar consultar a integração localmente, use apenas `.dev.vars` para a chave da Buttondown (nunca variáveis `VITE_*`).

```sh
pnpm build
pnpm db:local
pnpm pages:local
```

O ambiente completo abre em `http://127.0.0.1:8788`. Para desenvolvimento com atualização automática da interface, mantenha esse servidor e execute `pnpm dev:api` em outro terminal. O bypass exige simultaneamente host de loopback, `ENVIRONMENT=development` e `LOCAL_ACCESS_BYPASS=true`; nunca funciona no domínio de produção.

## Fase 2 — auditoria e estabilização

As alterações de `phase-2-editor-stability` foram enviadas ao GitHub, integradas à `main` e publicadas. O D1 remoto está configurado, com migração aplicada e recuperação de um documento comprovada entre o navegador do ChatGPT e o Chrome. O editor mantém JSON como fonte de edição e gera HTML para prévia e Buttondown; os rascunhos legados conservam o original e recebem backup. Veja [a auditoria](docs/FASE-2-AUDITORIA.md) e [a homologação real de produção](docs/HOMOLOGACAO-PRODUCAO.md).

Um rascunho real foi criado na Buttondown sem envio. O HTML retornado pela API correspondeu ao exportado pelo CRM; a prévia da Buttondown acrescenta seu cabeçalho/rodapé e avisa que a conversão para o editor Fancy não é integral. Evite reeditar esse HTML no Fancy até revisar essa limitação.

## Configuração de produção

Destino de produção: `https://crm.marioserafim.com.br`. O projeto usa Cloudflare Pages com integração GitHub na branch `main`. Consulte [o guia de operação](docs/PRODUCAO.md) para ativação, validação e pendências.

1. Use `pnpm build` como comando de build e `dist` como diretório de saída.
2. Configure `BUTTONDOWN_API_KEY` como secret da Pages Function.
3. Configure `CF_ACCESS_TEAM_DOMAIN` (por exemplo, `sua-equipe.cloudflareaccess.com`) e `CF_ACCESS_AUD` para validar os tokens do Cloudflare Access.
4. Proteja todas as rotas da aplicação com uma aplicação self-hosted do Cloudflare Access. Sem um JWT Access válido, as Functions recusam as chamadas.
5. Configure a chave da Buttondown com apenas `subscriber_access: read`, `email_access: write` e `sending_access: none`.
6. O binding `DB`, exclusivo de `env.production` em `wrangler.toml`, aponta para `mais-um-cafezinho-editorial`. Migrações remotas são explícitas: `pnpm db:production`. Confira o banco e as migrações pendentes antes de executar; nunca use esse comando para testes locais.

O middleware bloqueia os aliases `pages.dev` e previews. Sem configuração válida do Access, o painel e as APIs permanecem bloqueados. O bypass local só funciona em endereços de loopback.

## Segurança e limitações conhecidas

- Não coloque credenciais em variáveis `VITE_*`; elas seriam incorporadas ao bundle do navegador. `.dev.vars` e arquivos locais de secrets estão no `.gitignore`.
- `.env.example` e `.dev.vars.example` são modelos sem credenciais.
- A configuração da integração indica que a chave existe; a conexão é confirmada pela resposta da API ao carregar dados.
- O editor visual é carregado sob demanda e aumenta o tamanho desse chunk (React Email Editor e Prism). As telas de painel não carregam esse editor até abrir a rota.
- Envio/publicação de newsletters e monitoramento de entregabilidade ficam fora deste MVP.
- Rascunhos locais pertencem ao navegador e à origem em que foram criados. Publicar em outro domínio não transfere o `localStorage`; os originais continuam no endereço local. Rascunhos sincronizados continuam na Buttondown.

## Estrutura

```text
src/                 Interface React, páginas, templates e integração HTTP
functions/           Proxy seguro das rotas da Buttondown e middleware Access
public/_routes.json  Rotas que passam pelo middleware das Pages Functions
wrangler.toml        Configuração do Cloudflare Pages
```
