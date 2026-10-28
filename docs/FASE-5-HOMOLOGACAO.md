# Fase 5 — homologação editorial

## Escopo e evidência

Nenhum e-mail real enviado. Flag de envio não configurada; nenhuma alteração de DNS, Access, plano ou permissões. Não há deploy desta fase.

O documento JSON no D1 permanece a fonte editável. Fancy não é importado para sobrescrever documentos estruturados. Os testes existentes verificam recuperação em contexto independente, preservação durante respostas assíncronas e reutilização do identificador remoto. Um contexto independente Chromium não comprova um segundo produto de navegador nem o ciclo na produção real.

Os três templates têm regressões de exportação pelo editor real: título, fragmento sem head/marcadores React/quebras físicas e descadastro. A bateria unitária verifica estilos inline, links, imagens/alt, whitespace e segurança. A renderização processada real dos três templates ainda precisa de conferência na conta autenticada; a evidência da fase 4 é de uma edição isolada e não deve ser generalizada.

## Operação controlada

Endpoint dedicado `/api/editorial-test`, protegido pelo middleware Access existente. GET consulta a flag e destinos; POST prepara com ID do documento, revisão D1 e índice de destinatário. Não recebe endereço livre. O servidor lê o documento do D1 e exige revisão sincronizada e campanha remota draft. Grava destino, revisão, conteúdo e assunto remotos para comparar antes da confirmação. A preparação expira após dez minutos.

A confirmação exige `confirm: true`, ID de tentativa e revisão atual. A UI mostra o endereço exato, invalida a confirmação ao editar ou mudar revisão e não envia ao preparar. O servidor reclama atomicamente a tentativa antes da chamada externa, com verificação de versão D1. Cada revisão/destino só admite uma tentativa, inclusive em concorrência ou timeout. Não há retry automático; resultados incertos precisam de inspeção manual. O registro não contém tokens, mas contém conteúdo editorial e endereço autorizado: deve permanecer privado no D1. Não serve como log geral de auditoria.

A API externa não oferece neste contrato uma operação atômica com D1: alterações externas entre verificação e envio ainda são possíveis. Não editar o mesmo rascunho na Buttondown durante uma homologação. Nenhum endpoint de publicação ou status de envio em massa foi adicionado.

Antes de ativar, aplicar a migração `0002_editorial_tests.sql`, autorizar os destinos exatos e configurar `EDITORIAL_TEST_RECIPIENTS` (separados por vírgula) e `EDITORIAL_TEST_ENABLED=true`. Não configurar agora. As permissões mínimas de send-draft deverão ser confirmadas sem liberar publicação em massa. Fonte: https://docs.buttondown.com/api-emails-send-draft.

## Checklist de mensagens recebidas — pendente

Registrar para cada template: ID do documento, revisão, ID Buttondown, cliente/versão, sistema, data e captura da mensagem recebida. Usar assuntos HOMOLOGAÇÃO NÃO ENVIAR antes da autorização e HOMOLOGAÇÃO TESTE após ela.

| Cliente | Claro / escuro | Imagens permitidas / bloqueadas | Desktop / mobile | Evidência |
| --- | --- | --- | --- | --- |
| Gmail web | pendente | pendente | desktop | nenhuma mensagem |
| Gmail Android/iOS | pendente | pendente | mobile | nenhuma mensagem |
| Outlook web e Windows | pendente | pendente | desktop | nenhuma mensagem |
| Apple Mail macOS/iOS | pendente | pendente | ambos | nenhuma mensagem |

Em cada combinação conferir títulos, parágrafos, citações, assinatura, alt legível quando imagem bloqueada, fontes substitutas, ausência de rolagem horizontal, contraste, botão clicável, links e destino final, rodapé e URL de descadastro resolvida. Não descadastrar contatos reais durante o teste. Verificar tamanho/corte de mensagem e moldura adicionada pela Buttondown. Comparar HTML original, fragmento e mensagem efetivamente recebida.

No Free, a moldura externa e os estilos adicionados pela Buttondown permanecem fora do controle do fragmento. Media queries e CSS do head não são enviados no fragmento. A aparência do navegador não comprova Outlook, dark mode ou entrega. Sem ativação autorizada, essas verificações permanecem pendentes.

## Resultados desta execução

- `pnpm test`: 52 testes passaram (incluem flag desativada, destinatário arbitrário, revisão antiga, draft remoto, confirmação, repetição e resultado incerto com fetch mockado).
- `pnpm lint`: passou sem avisos.
- `pnpm build`: passou; permanece o aviso conhecido do tamanho do chunk do editor.
- `pnpm test:e2e`: 16 testes passaram em Chromium, incluindo os três templates e recuperação em contexto independente pelo D1 local. O Chromium exigido foi instalado após a primeira execução apontar a ausência do binário.
- Migrações 0001 e 0002 aplicadas apenas ao D1 de testes local. Nenhuma chamada real a send-draft; testes do endpoint interceptam fetch integralmente.
- Prévia identifica revisões local, sincronizada e D1, além da data já existente. Indicadores objetivos: título ausente, imagem sem alt, link sem descrição, descadastro ausente e HTML acima de 100 KB. Não são notas de compatibilidade.

| Template | Exportação pelo editor / fragmento local | Processador real Buttondown nesta fase |
| --- | --- | --- |
| Novidades do blog | passou | pendente |
| Curadoria editorial | passou | pendente |
| Edição especial | passou | pendente |

Portanto, a preparação técnica local está validada por mocks e navegador, mas a homologação editorial remota não está concluída. O ciclo completo D1 → Buttondown → outro navegador → atualização do mesmo ID deve ser registrado em produção com rascunhos de teste antes de autorizar mensagens reais.
