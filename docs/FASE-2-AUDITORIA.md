# Fase 2 — auditoria, estabilização e refinamento

Trabalho local em 27/10/2026, na branch `phase-2-editor-stability`, a partir de `96eb283`. Não houve push, deploy, alteração de DNS, mudança no Access remoto, criação de D1 remoto ou chamada real de escrita/envio à Buttondown. A versão publicada continua a da fase anterior.

## Problemas comprovados e distinções da auditoria

| Caso | Evidência e resultado |
| --- | --- |
| Prévia desmontava o editor | A correção da fase anterior já mantinha o editor montado. O defeito original não voltou a ser reproduzido; a proteção foi mantida e ampliada com teste real de seleção, prévia, salvamento e refresh. |
| Resposta antiga sobrescrevia edição recente | Reproduzido no teste de componente antes da correção: o assunto voltou de “Escrito durante a sincronização” para “Antes da sincronização” quando a resposta terminou. Agora a resposta só incorpora identificador e dados de sincronização ao documento atual. |
| Rede indisponível virava demonstração | Teste anterior à correção mostrou `api.status()` resolvendo com `demo:true` após `Failed to fetch`. Agora erros de rede continuam erros, sem dados fictícios. |
| HTML ativo aceito | Antes da correção, três testes aceitaram `onerror`, `javascript:` codificado por entidade e SVG com evento. Agora a análise do HTML decodificado recusa esses casos, no cliente e no servidor. |
| Armazenamento corrompido descartado | Antes da correção, gravar outro rascunho sobre JSON inválido não gerava erro e perdia os dados anteriores. Agora a operação falha e permite exportar os bytes originais. |
| Nome editorial injetado em HTML | Um nome com marcação era inserido diretamente no template. O teste falhou antes da correção; a identidade agora é escapada e os links são validados. |
| Desfazer agrupava troca de template à digitação | Reproduzido no navegador: Desfazer recuperava o template inicial, pulando o texto digitado. Foram acrescentadas fronteiras reais ao histórico. |
| Controle atuava no bloco errado | Reproduzido no navegador: o contêiner era tratado como um bloco e o foco no inspector podia mudar a seleção. As ações agora usam o bloco dentro do pai correto e preservam o foco. |
| Editor cortado no celular | Reproduzido com viewport de 390 px: o contêiner de edição mantinha largura fixa. A área de escrita agora se adapta ao espaço disponível, sem alterar o documento armazenado. |
| Dashboard usava só a primeira página? | O backend já usava `count` das consultas filtradas, não `results.length`. Esse comportamento foi preservado e testado com total 123 e apenas um item na página. A listagem de campanhas passou a explicitar que seus subtotais são da página e das cópias locais. |
| Paginação assumia 25 itens | A documentação da Buttondown fornece `page`, `count` e `next`, sem contratar o tamanho fixo presumido pela interface. Foram retirados os intervalos e números de páginas calculados sobre essa suposição. |

## Persistência e sincronização

O `DraftSession` centraliza o documento da sessão. O JSON retornado pelo editor é a fonte de edição; o HTML é derivado para prévia e rascunho Buttondown. O salvamento local não depende de aguardar um render de HTML.

- Alterações incrementam a revisão. A confirmação da Buttondown não restaura assunto, texto ou template de um snapshot antigo.
- Salvamento manual cancela o debounce pendente e grava a versão corrente. Montagem não agenda gravações indefinidamente.
- O estado local informa alterado, salvando, salvo ou erro. Fechamento/refresh e navegação interna avisam quando há alterações não persistidas.
- Falhas de rede não impedem abrir uma cópia local existente. Falhas de armazenamento não produzem mensagem falsa de sucesso.
- Uma criação incerta mantém a mesma chave de idempotência e o mesmo payload ao tentar novamente. Se houve edição depois, a interface informa que a última sincronização contém uma revisão anterior; o próximo salvamento atualiza essa campanha.
- Repetidos salvamentos mantêm o mesmo id. Abrir uma campanha remota reutiliza o vínculo local. Duplicar é uma ação explícita que copia também o documento estruturado e cria um rascunho independente.
- O registro legado mantém o HTML original. Antes da primeira atualização de uma lista legada, os dados brutos são preservados em `mais-um-cafezinho:drafts:v1:legacy-backup`.
- Backups JSON podem ser exportados e importados como **cópias de recuperação**, com novos ids e sem vínculo automático a campanhas existentes. O arquivo inteiro é validado antes de uma única gravação.
- Estruturas de outra versão do editor são recusadas com opção de exportação; não são silenciosamente reduzidas ao que o editor atual reconhece.

## D1: decisão e escopo

Foi escolhido D1 para documentos estruturados e configurações editoriais porque já existe backend no Cloudflare Pages, dispensa um novo serviço e permite controle atômico de versão entre dispositivos. A Buttondown continua a fonte oficial de campanhas e assinantes. Não há tabela de assinantes no D1.

A tabela `editorial_documents` contém `kind`, `id`, payload, versão e data. Uma gravação exige a versão conhecida pelo cliente. Duas sessões com a mesma versão não conseguem sobrescrever uma à outra: a segunda recebe 409 e conserva a cópia local. A confirmação da nuvem retorna a versão que foi efetivamente gravada, sem reler acidentalmente a atualização de outro escritor.

O banco está implementado e validado **apenas localmente**. A gravação de cópia na nuvem é explícita; a sincronização Buttondown também mantém o documento no D1 quando o binding está disponível. Configurações remotas só substituem a cópia local após uma escolha explícita do usuário.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm db:local
pnpm pages:local
```

Revisão: http://127.0.0.1:8788. Dados locais: `.wrangler/editor-local`. Testes: `.wrangler/editor-test`, isolado da revisão. Os ids em `wrangler.local.toml` são identificadores locais fictícios; os comandos de migração usam obrigatoriamente `--local`.

Em uma futura etapa de publicação autorizada será necessário criar um banco editorial próprio, aplicar a migração e adicionar o binding `DB` ao projeto Pages. Nenhuma dessas operações remotas foi executada nesta fase.

## Refinamentos de uso

- Uma única barra de inserção, separada em texto, mídia/links e estrutura.
- Controles redundantes de inserção e salvamento retirados. O rodapé informa o estado, sem repetir os botões principais.
- Inspector com seções recolhíveis, estrutura da edição, bloco selecionado, reordenação, duplicação e exclusão.
- Campos para URL e texto alternativo de imagens; campos de link para texto selecionado e botões. A seleção é preservada ao ir ao inspector.
- Upload e inserção são separados: o arquivo concluído não aparece em uma posição inesperada se o usuário tiver continuado a editar.
- Prévia usa o HTML realmente exportado, com iframe sem scripts e modos desktop/celular. O editor permanece montado.
- Troca de template exige confirmação e exporta um backup. Desfazer recupera o conteúdo anterior; o assunto anterior também permanece no backup.
- Os três pontos de partida mantêm a identidade editorial e receberam abertura/assinatura/links consistentes. A alteração afeta novos templates, sem substituir o texto de edições existentes.
- Miniaturas ilustrativas substituídas por renderizações do conteúdo real dos templates. A prévia final continua sendo a do editor.
- Campanhas locais e do D1 continuam acessíveis mesmo se a Buttondown estiver indisponível. As origens são identificadas.
- Dashboard distingue demonstração, ausência de conexão, falha de carregamento, lista vazia e dados carregados. Não há métricas inventadas.

## Buttondown e segurança

Verificação feita contra o [OpenAPI oficial](https://docs.buttondown.com/openapi.json), [versão da API](https://docs.buttondown.com/api-versioning), [paginação](https://docs.buttondown.com/api-pagination) e [idempotência](https://docs.buttondown.com/api-idempotency-keys). A versão `2026-04-01`, `X-API-Version`, o marcador `buttondown-editor-mode: fancy` e o upload multipart `image` continuam compatíveis com a documentação consultada.

- Configuração de chave é distinta de conexão confirmada. O status realiza uma consulta de leitura e apresenta erros de autenticação/permissões sem retornar o segredo ou o corpo bruto do erro upstream.
- Criação encaminha `X-Idempotency-Key`. Criação e atualização montam um payload novo com apenas assunto, corpo e estado `draft`, descartando campos de publicação enviados por um cliente forjado.
- Atualização verifica que a campanha ainda é rascunho. Não existem chamadas a publish, send, bulk actions ou criação/alteração de assinantes.
- HTML é analisado como árvore, com entidades decodificadas. Eventos, marcação ativa, esquemas perigosos, CSS ativo e documentos muito grandes são rejeitados. O link real de descadastro é preservado/incluído.
- JSON e upload possuem leitura limitada em bytes, inclusive sem `Content-Length`. Imagens exigem MIME permitido, até 8 MB e assinatura de arquivo correspondente; SVG e arquivos disfarçados são recusados.
- JWT continua validado por assinatura RS256, issuer, audience e expiração. Host oficial/HTTPS, bloqueio de aliases e headers privados foram mantidos.
- Escritas de origem externa são recusadas. Bypass exige host de loopback, ambiente `development` e flag explícita; não funciona no domínio oficial.
- Secrets continuam exclusivamente no servidor. Dados dos testes e capturas não entram no Git.

## Validação

- `pnpm test`: **39 testes unitários/de componente** passaram.
- `pnpm lint`: passou, sem avisos de código.
- `pnpm build`: passou; inclui TypeScript da interface e das Functions.
- `pnpm exec wrangler pages functions build --outdir .wrangler/functions-check`: passou.
- Playwright: **13 cenários passaram**, incluindo JSON, preview, seleção, refresh, templates/undo/redo, blocos, imagens/alt, links, falha de upload, quota, rede, sincronização lenta, recuperação em segundo dispositivo, descoberta dos documentos na listagem, conflitos de versão e visualização desktop/mobile.
- Integração com Buttondown testada exclusivamente por mocks; as rotas D1 foram testadas no runtime Pages local real.
- GitHub Actions foi ampliado para repetir validação, instalar Chromium, migrar o D1 de testes e executar os fluxos críticos. O workflow está preparado na branch local; não foi enviado/executado no GitHub nesta fase.

## Limitações e funcionalidades não disponíveis

1. Não houve publicação: a recuperação entre dispositivos no domínio oficial aguarda o binding D1 remoto e uma futura publicação autorizada.
2. Renderização/processamento final do HTML dentro da Buttondown e clientes reais de e-mail não foi comprovada por escrita remota. Foram testados exportação, payload, respostas mockadas e preservação do descadastro. Recomenda-se um rascunho privado de homologação numa próxima etapa, sem envio.
3. Não há colaboração simultânea em tempo real. Conflitos de versões e alterações já persistidas em outra aba são detectados; o conteúdo local é preservado para escolha/recuperação.
4. A migração de HTML legado para JSON depende da importação do editor e pode normalizar formatação. O HTML e o backup originais são preservados para conferência. JSON sintaticamente corrompido precisa de recuperação manual a partir do arquivo exportado; o sistema não adivinha trechos perdidos.
5. A Buttondown não fornece, no contrato utilizado, uma transação distribuída com o D1. Uma falha entre as duas gravações fica visível; o vínculo/idempotência local evita criação duplicada na retomada. Edição concorrente na interface da Buttondown deve ser evitada enquanto este editor sincroniza.
6. Desfazer na troca de template restaura o conteúdo; o assunto anterior é recuperável no backup exportado.
7. O chunk do editor continua grande, carregado sob demanda. Não foi feita troca de editor/stack para contornar esse limite.
8. Envio, publicação, agendamento de campanhas, importação de assinantes e disparos em massa continuam indisponíveis.

Próxima etapa recomendada: revisar o fluxo local, depois homologar D1 e um rascunho privado com a Buttondown numa etapa separada e autorizada. Comparar HTML retornado e renderização em clientes de e-mail antes de considerar qualquer publicação.

## Arquivos por conjunto

- Integridade: `src/lib/draft-session.ts`, `src/lib/storage.ts`, `src/lib/recovery.ts`, `src/lib/editor-blocks.ts`, `src/types.ts`, `src/pages/EditorPage.tsx`, `src/main.tsx`.
- Recuperação remota: `functions/_documents.ts`, `functions/api/drafts/`, `functions/api/settings.ts`, `migrations/0001_editorial_documents.sql`, `wrangler.local.toml`.
- Integração/segurança: `shared/safety.ts`, `shared/urls.ts`, `functions/_utils.ts`, `functions/_middleware.ts`, `functions/[[path]].ts`, `functions/api/status.ts`, `functions/api/dashboard.ts`, `functions/api/subscribers.ts`, `functions/api/images.ts`, `functions/api/emails/`, `src/lib/api.ts`, `src/lib/email.ts`.
- Uso e identidade: `src/components/AppLayout.tsx`, `src/pages/CampaignsPage.tsx`, `src/pages/SubscribersPage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/TemplatesPage.tsx`, `src/data/templates.ts`, `src/index.css`.
- Validação e operação: testes em `src/lib/`, `src/pages/EditorPage.test.tsx`, `functions/_api.test.ts`, `functions/_middleware.test.ts`, `e2e/`, `playwright.config.ts`, `.github/workflows/verify.yml`, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `.dev.vars.example`, `.env.example`, `README.md` e este relatório.
