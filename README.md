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

React, TypeScript, Vite, Tailwind CSS 4, React Email Editor, Cloudflare Pages Functions e Buttondown API (`2026-04-01`). Não há banco de dados: rascunhos offline ficam no `localStorage` do navegador.

## Rodar localmente

Requer Node.js compatível com Vite 8 e pnpm.

```sh
pnpm install
pnpm dev
```

O Vite abre o painel em modo de demonstração. Para validar o projeto:

```sh
pnpm test
pnpm lint
pnpm build
```

Para exercitar as Pages Functions localmente, copie `.dev.vars.example` para `.dev.vars`, defina `LOCAL_ACCESS_BYPASS=true` e, se desejar testar a integração, forneça uma chave da Buttondown. Use esse bypass apenas no servidor local iniciado por `pnpm pages:dev`.

```sh
pnpm build
pnpm pages:dev
```

## Configuração de produção

Este repositório ainda não foi implantado. Para uma futura implantação manual no Cloudflare Pages:

1. Use `pnpm build` como comando de build e `dist` como diretório de saída.
2. Configure `BUTTONDOWN_API_KEY` como secret da Pages Function.
3. Configure `CF_ACCESS_TEAM_DOMAIN` (por exemplo, `sua-equipe.cloudflareaccess.com`) e `CF_ACCESS_AUD` para validar os tokens do Cloudflare Access.
4. Proteja todas as rotas da aplicação com uma aplicação self-hosted do Cloudflare Access. Sem um JWT Access válido, as Functions recusam as chamadas.
5. Configure a chave da Buttondown com apenas `subscriber_access: read`, `email_access: write` e `sending_access: none`.

O nome de domínio `newsletter.marioserafim.com.br`, DNS e implantação não foram alterados nesta etapa.

## Segurança e limitações conhecidas

- Não coloque credenciais em variáveis `VITE_*`; elas seriam incorporadas ao bundle do navegador. `.dev.vars` e arquivos locais de secrets estão no `.gitignore`.
- `.env.example` e `.dev.vars.example` são modelos sem credenciais.
- A configuração da integração indica que a chave existe; a conexão é confirmada pela resposta da API ao carregar dados.
- O editor visual é carregado sob demanda e aumenta o tamanho desse chunk (React Email Editor e Prism). As telas de painel não carregam esse editor até abrir a rota.
- Envio/publicação, deploy em produção, DNS e monitoramento de entregabilidade ficam fora deste MVP.

## Estrutura

```text
src/                 Interface React, páginas, templates e integração HTTP
functions/           Proxy seguro das rotas da Buttondown e middleware Access
public/_routes.json  Rotas que passam pelo middleware das Pages Functions
wrangler.toml        Configuração do Cloudflare Pages
```
