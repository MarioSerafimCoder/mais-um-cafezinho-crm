# Envio de campanhas pelo CRM

## Estado desta implementação

O editor permite escolher contatos ativos específicos ou todos os assinantes ativos. Na etapa 3 (Preparação), o botão “Preparar envio e ver resumo” sincroniza a edição e valida a audiência no servidor. Se houver bloqueio ou falha, a edição permanece nessa etapa com o motivo. A etapa 4 (Resumo e envio) abre apenas após a preparação e mostra o assunto, a contagem e os endereços selecionados. O envio real exige o clique separado em “Confirmar e enviar campanha”. Alterações na edição ou expiração exigem voltar à etapa 3 para preparar novamente.

O recurso está fechado por padrão no servidor (`CAMPAIGN_SENDING_ENABLED` ausente ou diferente de `true`). Esta alteração de código não aplicou migração, não alterou secrets ou permissões da Buttondown, não publicou o CRM e não enviou e-mails. A configuração de produção continua conforme o guia operacional, com permissão de envio desativada.

## Regras do fluxo

- “Todos” considera assinantes `regular` e `premium`. A campanha precisa estar em draft e sem filtros de audiência; o servidor consulta a contagem antes de preparar e novamente antes de confirmar.
- A seleção individual inclui apenas assinantes `regular` ou `premium`, permite até 500 contatos e valida IDs, status e endereços no servidor. O e-mail confirmado é o mesmo endereço validado antes do envio.
- O servidor exige a revisão atual salva no D1 e sincronizada, consulta a campanha remota e compara assunto, hash do corpo enviado, template, descrição e audiência antes de aceitar a confirmação. Rascunhos antigos sem hash registrado precisam ser sincronizados novamente antes do primeiro envio.
- A confirmação para contatos selecionados usa `POST /emails/{id}/send-draft` com IDs Buttondown. “Todos” usa `POST /emails/{id}/publish`, que publica e envia imediatamente a campanha conforme a audiência sem filtros da Buttondown.
- Uma tentativa fica registrada no D1 antes da chamada externa. Cada campanha remota admite uma única preparação/envio ativo ou aceito, mesmo se o rascunho for revisado depois. Resultado incerto permanece bloqueado; não há retry automático. Preparações podem ser canceladas ou expiram após dez minutos. Respostas HTTP 4xx conclusivas, exceto conflito 409, são registradas como rejeitadas e não são tratadas como aceitação.
- “Aceito pela Buttondown” não significa entregue nem recebido. O CRM apresenta apenas a aceitação da solicitação; confirmação de recebimento exige observar a mensagem na caixa postal.

## Pré-requisitos para ativação futura

1. Revisar e integrar a implementação.
2. Aplicar a migração `0003_campaign_send_attempts.sql` ao D1 editorial correto.
3. Obter autorização separada para a permissão de envio na Buttondown; o projeto está configurado/documentado com `sending_access: none` e esta implementação não modifica essa permissão.
4. Somente após a decisão do proprietário, configurar `CAMPAIGN_SENDING_ENABLED=true` na produção.
5. Verificar a contagem, audiência, tentativa e estado da Buttondown sem enviar uma campanha real durante a validação.

## Contrato externo

A Buttondown documenta `send-draft` com arrays de IDs de assinantes ou endereços, e `publish` como operação que publica e envia imediatamente quando não recebe `publish_date`. As permissões de chave são independentes; `sending_access` controla o envio e uma chamada sem permissão retorna 403. Fontes oficiais: [send draft](https://docs.buttondown.com/api-emails-send-draft), [publish email](https://docs.buttondown.com/api-emails-publish), [autenticação e permissões](https://docs.buttondown.com/api-authentication).

## Proteção da sincronização

Novas sincronizações guardam no documento um hash do corpo, assunto, descrição e template retornados pela Buttondown. Atualizações posteriores conferem essa referência antes de gravar; uma resposta perdida pode ser reconciliada quando todos os campos já correspondem ao pedido. Rascunhos antigos sem essa referência mantêm a checagem do corpo e bloqueiam alterações divergentes dos metadados até revisão das cópias local e remota. Espaços nas extremidades do assunto e da descrição são normalizados na validação de envio.
