# Envio de teste pelo CRM

## Fluxo

Salvar rascunho na Buttondown salva localmente, sincroniza o HTML e persiste no D1 a revisão e o hash retornado. No editor, use **Consultar destinatários e resultado**, selecione um destino autorizado, **Preparar novo teste**, confira o endereço, marque a confirmação e use **Enviar teste**. A consulta recupera o histórico mesmo após fechar o navegador.

O backend usa exclusivamente `POST /emails/{id}/send-draft` com um único endereço da allowlist. Valida conteúdo, assunto, template, descrição, revisão e status draft antes de preparar e confirmar. Access e proteção de origem permanecem no middleware.

## Configuração inicial

- `BUTTONDOWN_API_KEY`: Secret do CRM; exige permissão de envio além de edição. Não registrar seu valor em arquivos ou logs.
- `EDITORIAL_TEST_RECIPIENTS`: endereços autorizados separados por vírgula. Sem lista ou chave, testes permanecem bloqueados.
- `EDITORIAL_TEST_ENABLED=false`: interrupção explícita opcional. Após a configuração inicial, nenhuma alteração de flag/deploy é necessária para cada teste. Um Secret antigo definido como false deve ser alterado uma única vez, após autorização.
- `CAMPAIGN_SENDING_ENABLED` permanece ausente/false. A autorização de teste não habilita campanhas.

## Persistência e resultados

A migração `0004_editorial_test_results.sql` preserva todas as linhas, substitui a unicidade permanente por verificação atômica de preparações/resultados incertos por campanha e destinatário, e acrescenta status HTTP e horário do resultado. Preparações expiram em dez minutos ou podem ser canceladas antes do envio.

Uma confirmação reclama a tentativa atomicamente. Respostas 400/401/403/404/422/429 ficam `rejected`; timeout, falha de rede, 409 e erros 5xx permanecem `attempted` e não são repetidos. Tentativas antigas em `attempted` não são reclassificadas sem evidência do provedor. Uma campanha nova pode ser homologada sem remover esses registros. Após aceitação ou recusa conclusiva, outra preparação explícita gera outro ID e conserva o histórico.

`accepted` comprova aceitação pela API, não recebimento. Este exige conferência da caixa postal.

## Publicação preparada em 28/10/2026

Banco remoto conferido: `mais-um-cafezinho-editorial` (`4460ef9d-fb2b-4756-aa00-37fb0b80d056`). Migrações pendentes: `0003_campaign_send_attempts.sql` e `0004_editorial_test_results.sql`. Uma tentativa antiga `attempted` foi encontrada e permanece intacta.

Antes da homologação real: autorizar migrações e deploy do CRM; configurar uma única vez a allowlist e retirar a interrupção antiga do teste. Confirmar o endereço exato no editor e enviar apenas uma tentativa de uma newsletter nova. Não executar publicação de campanhas.

Validação local: 69 testes Vitest; 18 E2E Chromium (incluindo gravação D1 real local, sincronização/envio simulados e confirmação); lint, TypeScript/build e compilação das Pages Functions. O build mantém o aviso conhecido de chunk grande do editor.

Contratos: [send-draft](https://docs.buttondown.com/api-emails-send-draft), [permissões](https://docs.buttondown.com/api-authentication).
