# Publicação privada do CRM

Destino exclusivo: https://crm.marioserafim.com.br.
Projeto Pages: `mais-um-cafezinho-crm`, conta `7bfc908c25ef636aade196a09572a11c`.
Repositório: `MarioSerafimCoder/mais-um-cafezinho-crm`, produção em `main`.

## Build e deploy

- Integração GitHub nativa do Pages, deploy de produção automático para novos commits em `main`.
- Diretório raiz: raiz do repositório. Comando: `pnpm build`. Saída: `dist`.
- Node `24.18.0` (`.node-version`), pnpm `11.25.0` (`packageManager`). Configure também `PNPM_VERSION=11.25.0` no build do Pages.
- `wrangler.toml` define a data de compatibilidade e o diretório de saída. As Functions estão em `functions/`.
- O workflow `.github/workflows/verify.yml` executa testes, lint, TypeScript, build e compilação das Functions. Erros aparecem no GitHub Actions. O estado e os logs do deploy ficam em Pages → Deployments e nos checks do commit.
- Desative builds de preview em Settings → Builds & deployments → Branch control → Preview deployments → None. O middleware também recusa todos os hosts diferentes do domínio oficial, mesmo com JWT.

O LASTRO foi inspecionado como referência, sem alterações: ele usa Workers com assets, D1 e login por senha. Zero Trust não estava ativado na conta. O CRM mantém a arquitetura Pages e a exigência de Access.

## Ativação do Cloudflare Access

1. Concluir o cadastro do **Zero Trust Free** na conta Cloudflare. Na inspeção de 27/10/2026, a Cloudflare exigiu cartão, endereço de cobrança, aceite de termos e autorização para cobranças de excedentes. Essa etapa é do proprietário.
2. No Zero Trust, escolher o team domain e habilitar um provedor de login (por exemplo, código por e-mail).
3. Em Access → Applications → Add application → Self-hosted, criar uma aplicação `Mais um Cafezinho CRM` para **crm.marioserafim.com.br**, sem limitar o caminho. Isso cobre painel, assets e `/api/*`.
4. Criar política **Allow** com **Include → Emails → endereço exato autorizado pelo proprietário**. Não usar Everyone, domínio de e-mail inteiro nem Bypass. Não reutilizar políticas amplas de outras aplicações.
5. Copiar o Application Audience (AUD) e o team domain para os bindings de runtime do Pages, em produção: `CF_ACCESS_AUD` e `CF_ACCESS_TEAM_DOMAIN`. O team domain tem o formato `equipe.cloudflareaccess.com`, sem caminho.
6. Não configurar `LOCAL_ACCESS_BYPASS` em produção ou preview. Publicar novamente após alterar bindings.

O backend valida assinatura RS256, expiração, emissor e audience com as chaves oficiais do time. Todas as rotas passam pelo middleware (`public/_routes.json`). Ausência de configuração retorna 503; ausência ou invalidade do JWT retorna 401. Hosts alternativos retornam 404. O painel só fica utilizável após concluir o Access; não há fallback público.

## DNS e HTTPS

1. Pages → `mais-um-cafezinho-crm` → Custom domains → Set up a custom domain → `crm.marioserafim.com.br`.
2. Aceitar somente o registro CNAME **crm**, apontando para o hostname real `pages.dev` informado pelo projeto, com proxy da Cloudflare. Não criar apenas o CNAME sem associar o domínio no Pages.
3. Aguardar o domínio ficar Active e a emissão do certificado. Validar HTTPS e redirecionamento HTTP → HTTPS.
4. Não modificar apex, `www`, `lastro`, blog, newsletter pública ou regras globais da zona. O middleware do CRM também força HTTPS no domínio oficial.

## Buttondown

No Pages → Settings → Variables and Secrets, criar **Secret** `BUTTONDOWN_API_KEY`, exclusivamente para este projeto. Usar a chave existente de menor privilégio: `subscriber_access: read`, `email_access: write`, `sending_access: none`. Nunca adicionar o segredo ao Git, ao workflow ou a variáveis `VITE_*`. Não ativar envio.

Depois de publicar, entrar pelo Access e consultar `/api/status` e `/api/subscribers?page=1`. O status só indica que a chave está configurada; uma resposta bem-sucedida de subscribers confirma a comunicação com a Buttondown. Sem chave, a interface pode mostrar demonstração e APIs de dados retornam erro de integração.

## Validação

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
pnpm exec wrangler pages functions build --outdir .wrangler/functions-check
```

Para validar as Functions sem credenciais reais, localmente:

```sh
pnpm pages:dev --ip 127.0.0.1 --port 8788 --binding LOCAL_ACCESS_BYPASS=true
```

Sem o binding, o ambiente local também falha fechado. O Vite (`pnpm dev`) usa demonstração e não exercita o middleware.

Em produção, testar sem sessão: `/`, `/campaigns`, `/editor/new`, `/subscribers`, `/templates`, `/settings`, `/api/status` e `/api/subscribers` devem exigir Access; nunca retornar dados privados. Hosts `pages.dev` e previews devem recusar o CRM. Com sessão autorizada, testar navegação e refresh direto nas páginas, editor e prévia mobile. Testar um usuário fora da allowlist. Validar que não existem secrets no bundle.

## Preservação dos rascunhos

Não há banco próprio. Os rascunhos locais continuam na chave `mais-um-cafezinho:drafts:v1` do navegador e da origem original. Não limpar dados do navegador. A mudança de `http://127.0.0.1:5173` para o domínio de produção não migra esses dados automaticamente. Os rascunhos remotos permanecem na Buttondown e dependem da mesma conta/chave para serem consultados. Não houve envio, exclusão ou migração de rascunhos nesta publicação.

## Estado verificado em 27/10/2026

- Projeto Pages criado e conectado ao GitHub. O commit `f60a1be` foi publicado automaticamente com sucesso, deploy `faf51a19-88ee-442c-8605-5789b0f176dd`. O check de validação do GitHub também passou.
- Domínio `crm.marioserafim.com.br`: **Active**, **SSL enabled** no painel Cloudflare. HTTP retorna 301 para HTTPS.
- Zero Trust Free ativado pelo proprietário. Aplicação `Mais um Cafezinho CRM`, ID `405189ac-5fd0-4f97-a3b6-efa3bd2d7366`, cobre todo o hostname. Política `Somente Mário Serafim`, ID `4fb044ff-a4d2-4485-a8f6-0c8053fc8499`, permite apenas `marioserafim.da@gmail.com`.
- Team domain `wispy-hall-9782.cloudflareaccess.com` e AUD configurados em `wrangler.toml`. São parâmetros públicos de validação, não credenciais. Cookie Access com HttpOnly e sessão de 24 horas; login real com a conta autorizada concluído.
- Produção configurada como **Fail closed**: ao esgotar a quota de Functions, não há fallback para servir o painel estático sem middleware. Builds automáticos de preview desativados; produção em `main` continua automática.
- Sem sessão, `/`, `/campaigns`, `/editor/new`, `/subscribers`, `/templates`, `/settings`, `/api/status` e `/api/subscribers` retornaram 302 para o login Access. O hostname principal `pages.dev` recusou painel e API com 404.
- Com sessão, o painel e as telas de campanhas, assinantes, templates e configurações carregaram no domínio oficial. `/api/status` autenticado confirmou execução das Functions, inicialmente com `configured:false` (sem chave Buttondown).
- Dashboard verificado em desktop e largura mobile de 375 px, sem transbordamento horizontal. Editor e prévias desktop/celular verificados no Pages local com os headers de segurança. Uma falha existente de desmontagem do editor na prévia foi corrigida: conteúdo e referência do editor permanecem ativos, inclusive para salvar durante a prévia. Teste de regressão cobre a preservação e o salvamento do texto.
- Validação local e GitHub: **15 testes**, lint, TypeScript do frontend e backend, build Vite e compilação das Pages Functions passaram. O build mantém o aviso preexistente de chunk grande do editor.
- Não foram alterados LASTRO, portfólio, blog, newsletter pública ou seus registros DNS. Não houve chamadas de envio ou escrita em rascunhos remotos.

O proprietário cadastrou `BUTTONDOWN_API_KEY` diretamente como Secret no Pages. Após configurar ou rotacionar esse Secret, é necessário novo deploy e validação por consulta autenticada real; a confirmação de consulta à Buttondown não pode ser inferida apenas de `/api/status`. A política de e-mail foi conferida, mas não houve login real com uma segunda conta fora da allowlist.
