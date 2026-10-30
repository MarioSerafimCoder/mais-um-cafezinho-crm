# Envio de campanhas pelo CRM

## Estado desta implementação

O editor permite escolher contatos ativos específicos ou todos os assinantes ativos. Na etapa 3 (Preparação), o botão “Preparar envio e ver resumo” sincroniza a edição e valida a audiência no servidor. Se houver bloqueio ou falha, a edição permanece nessa etapa com o motivo. A etapa 4 (Resumo e envio) abre apenas após a preparação e mostra o assunto, a contagem e os endereços selecionados. O envio real exige o clique separado em “Confirmar e enviar campanha”. Alterações na edição ou expiração exigem voltar à etapa 3 para preparar novamente.

Em 30/10/2026, o proprietário autorizou habilitar o fluxo de envio de produção. `env.production.vars.CAMPAIGN_SENDING_ENABLED=true` fica versionado no `wrangler.toml`, para persistir nos próximos deploys. Os ambientes sem essa flag continuam bloqueados. A ativação não envia campanhas: o disparo exige a confirmação explícita da etapa 4. As migrações remotas foram conferidas e não há pendências. A conta Buttondown possui uma Primary Key, que tem permissões completas conforme a documentação do provedor.

## Regras do fluxo

- “Todos” considera a política compartilhada de tipos confirmados em `shared/audience.ts`. A campanha precisa estar em draft e sem filtros de audiência; o servidor consulta a contagem antes de preparar e novamente antes de confirmar.
- A seleção individual inclui apenas assinantes da mesma política de tipos confirmados, permite até 500 contatos e valida IDs, status e endereços no servidor. O e-mail confirmado é o mesmo endereço validado antes do envio.
- O servidor exige a revisão atual salva no D1 e sincronizada, consulta a campanha remota e compara assunto, hash do corpo enviado, template, descrição e audiência antes de aceitar a confirmação. Rascunhos antigos sem hash registrado precisam ser sincronizados novamente antes do primeiro envio.
- Ambas as audiências usam `POST /emails/{id}/publish`. Para contatos selecionados, o mesmo pedido de publicação aplica filtros: OR dos endereços exatos revalidados e AND com os nove tipos da política compartilhada em `shared/audience.ts`. Os filtros são construídos no servidor a partir dos IDs confirmados, nunca recebidos do navegador. Não existe fallback para publicação sem filtro. `/send-draft` pertence exclusivamente ao envio de testes, com o prefixo de prévia do provedor.
- Uma tentativa fica registrada no D1 antes da chamada externa. Cada campanha remota admite uma única preparação/envio ativo ou aceito, mesmo se o rascunho for revisado depois. Resultado incerto permanece bloqueado; não há retry automático. Preparações podem ser canceladas ou expiram após dez minutos. Respostas HTTP 4xx conclusivas, exceto conflito 409, são registradas como rejeitadas e não são tratadas como aceitação.
- “Aceito pela Buttondown” não significa entregue nem recebido. O CRM apresenta apenas a aceitação da solicitação; confirmação de recebimento exige observar a mensagem na caixa postal.

## Pré-requisitos operacionais

1. Revisar e integrar a implementação.
2. Aplicar a migração `0003_campaign_send_attempts.sql` ao D1 editorial correto.
3. Obter autorização separada para a permissão de envio na Buttondown; o projeto está configurado/documentado com `sending_access: none` e esta implementação não modifica essa permissão.
4. Somente após a decisão do proprietário, configurar `CAMPAIGN_SENDING_ENABLED=true` na produção.
5. Verificar a contagem, audiência, tentativa e estado da Buttondown sem enviar uma campanha real durante a validação.

## Contrato externo

A Buttondown documenta `send-draft` com arrays de IDs de assinantes ou endereços, e `publish` como operação que publica e envia imediatamente quando não recebe `publish_date`. As permissões de chave são independentes; `sending_access` controla o envio e uma chamada sem permissão retorna 403. Fontes oficiais: [send draft](https://docs.buttondown.com/api-emails-send-draft), [publish email](https://docs.buttondown.com/api-emails-publish), [autenticação e permissões](https://docs.buttondown.com/api-authentication).

## Proteção da sincronização

Novas sincronizações guardam no documento um hash do corpo, assunto, descrição e template retornados pela Buttondown. Atualizações posteriores conferem essa referência antes de gravar; uma resposta perdida pode ser reconciliada quando todos os campos já correspondem ao pedido. Rascunhos antigos sem essa referência mantêm a checagem do corpo e bloqueiam alterações divergentes dos metadados até revisão das cópias local e remota. Espaços nas extremidades do assunto e da descrição são normalizados na validação de envio.

## Correção do envio segmentado

O caminho anterior para seleção individual usava uma prévia (`send-draft`), não publicação. A implementação corrigida publica ambos os modos, aplicando os filtros exatos no próprio pedido de `publish`, sem uma escrita intermediária de audiência no rascunho. Durante a preparação e confirmação, IDs, atividade e endereços são revalidados. Resultado incerto continua bloqueado e uma recusa de filtros nunca causa nova tentativa sem segmentação.

O histórico de tentativas anteriores é preservado. Um `accepted` segmentado anterior a esta correção registra a aceitação de uma prévia, não comprova publicação. Essas campanhas não devem ser reinterpretadas como publicações ou reenviadas automaticamente.

Referências: https://docs.buttondown.com/api-emails-filters e https://docs.buttondown.com/api-emails-publish.

## Escala, política de audiência e resultados de testes — 30/10/2026

A política pública em `shared/audience.ts` inclui regular, premium, gifted, trialed, churning, churned, paused, past_due e upcoming. São excluídos estados de bloqueio, reclamação, desativação, não confirmação e falta de assinatura. O mesmo filtro de tipos é usado no dashboard, nas consultas de contatos, na contagem e no pedido atômico de publicação. Isso define a política do CRM; não promete contagem exata de entrega. Contagens são estimativas porque o provedor pode aplicar supressões adicionais.

A revalidação individual usa `GET /subscribers` com `ids` repetidos, em lotes de 50, duas consultas simultâneas no máximo e paginação por lote. IDs extras, duplicados, ausentes ou inativos bloqueiam a operação. Não existe fallback para buscar um contato por requisição. Leituras recebem até duas retentativas de 429 com Retry-After; esperas acima de cinco segundos são devolvidas ao chamador em vez de manter a Function aguardando. Publicação e envio de teste nunca são repetidos automaticamente.

O envio de testes mantém resultado por destino: aceito, recusado, não enviado ou incerto. Resultados persistem no navegador por edição e o servidor mantém a trilha em D1. Interrupção durante envio vira resultado incerto ao reabrir. Somente não enviados/recusados podem ser repetidos; é possível acrescentar outros destinos sem repetir aceitos ou incertos.

Fontes: https://docs.buttondown.com/api-subscribers-list e https://docs.buttondown.com/api-filtering.

## Revisões e reconciliação

O histórico local de testes utiliza edição + revisão. As chaves antigas por edição permanecem intactas, mas não são atribuídas a uma revisão desconhecida nem bloqueiam novos testes. Respostas de um teste em andamento são registradas na revisão efetivamente sincronizada, preservando revisões anteriores.

A migração 0006 acrescenta o estado remoto observado, data de consulta e hash da publicação esperada às tentativas de campanha. HTTP 2xx só vira aceitação quando a resposta traz o ID exato e um estado de publicação reconhecido. Respostas inesperadas permanecem attempted, com repetição bloqueada.

O histórico na tela Edições e no resumo de um envio incerto permite consultar a Buttondown sem republicar. A reconciliação promove attempted para accepted somente se ID, estado, conteúdo e filtros corresponderem à publicação esperada. Rascunho, ausência de campanha, divergência ou erro de consulta não autorizam reenvio. Tentativas antigas sem hash de publicação exigem revisão manual; seu histórico não é reclassificado automaticamente.
