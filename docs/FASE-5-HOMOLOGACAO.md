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

## Revisão para integração — 28/10/2026

Branch de revisão: `phase-5-editorial-homologation`, baseada em `origin/main` no commit `32d15d2`. Não integrar automaticamente: a main dispara deploy de produção pelo Pages.

A migração 0002 é aditiva (tabela privada e índice único); não remove nem altera documentos existentes. O índice impede duas preparações para o mesmo documento/revisão D1/destino. A reclamação condicional de estado e revisão impede dois POSTs concorrentes de chamar send-draft. Testes com mocks exercitam concorrência e timeout; não são evidência de envio real. O middleware Access e a recusa de hosts alternativos permanecem aplicáveis à nova rota. Não foi configurada a flag nem alterada a chave. A ausência de flag no código resulta em recusa antes de D1 ou Buttondown.

A revisão acrescentou recusa explícita a corpo JSON nulo/array e a revisões ausentes, negativas ou não inteiras. Também corrigiu a restauração explícita da seleção ao sair da prévia, após a bateria detectar que o foco simples podia perder o intervalo selecionado. O mock do editor acompanha a API de seleção agora usada.

Sequência para futura implantação: revisar PR e evidências remotas; conferir bindings de produção e flag ausente/false; autorizar e aplicar somente a migração aditiva no banco editorial correto; integrar main (isso publica automaticamente); verificar GET do endpoint com sessão e recusa POST sem habilitação. Não habilitar testes, cadastrar destinos ou ampliar permissões como parte do deploy. Uma autorização separada será necessária para qualquer mensagem real.

## Revalidação local e estado remoto — 28/10/2026

Revalidação nesta execução: `pnpm test` passou com 54 testes em 10 arquivos; `pnpm lint` passou; `pnpm build` passou com o aviso existente de chunk maior que 500 KB; `pnpm test:e2e` passou com 16 cenários em Chromium. Os três cenários de template verificam a exportação local, não a API Buttondown. O teste de recuperação usa dois contextos/navegadores Chromium contra o D1 local: comprova documento JSON estruturado e seus metadados nesse ambiente, mas não testa produção ou dois navegadores comerciais independentes.

O E2E identificou que a seleção nativa do navegador podia divergir da seleção interna do editor. A prévia agora traduz âncora e foco do DOM para posições do editor e restaura a seleção ao voltar a escrever. O teste que falhava passou isoladamente e na bateria completa.

| Template | Exportação local / conteúdo | Draft remoto Buttondown | Processado, mídias, links e descadastro | Evidência remota |
| --- | --- | --- | --- | --- |
| Novidades do blog | passou (Playwright, local) | não criado nesta execução | não inspecionado | nenhuma |
| Curadoria editorial | passou (Playwright, local) | não criado nesta execução | não inspecionado | nenhuma |
| Edição especial | passou (Playwright, local) | não criado nesta execução | não inspecionado | nenhuma |

Na revalidação local descrita nesta seção, nenhuma chamada real à API Buttondown ocorreu. Os testes unitários do endpoint usam `fetch` mockado; os E2E usam o servidor e D1 locais. A sessão remota foi recuperada depois; os drafts reais e suas evidências estão na seção “Homologação remota real” abaixo.

Estado remoto lido sem escrita: produção continua no commit `32d15d2`; Cloudflare gera previews da branch `phase-5-editorial-homologation` (o preview mais recente observado após o push de código estava no commit `471d155`). A migration remota ainda lista `0002_editorial_tests.sql` como pendente. Esta execução não aplicou migration, não publicou na produção, não mudou secrets/flag/permissões e não enviou e-mails. O push de branch pode iniciar um novo preview automático; a produção só muda após integração à `main`.

Na etapa de revalidação local, o ciclo remoto de persistência e as prévias processadas estavam pendentes; a seção “Homologação remota real” registra o ciclo feito depois para os três documentos. Ainda não foram testadas mensagens recebidas em clientes de e-mail.

Antes da integração: substituir os dois destinos `example.com` do draft Curadoria por URLs editoriais fornecidas pelo proprietário; se for necessário validar entrega, autorizar e enviar uma mensagem de teste por fluxo separado. Depois, revisar migration aditiva e integração à `main` (que publica automaticamente) com autorização específica. Manter `EDITORIAL_TEST_ENABLED` ausente ou falso.

A criação de um PR draft foi tentada para preparar a revisão, mas o GitHub Connector recusou com HTTP 403 (`Resource not accessible by integration`) e o GitHub CLI não está instalado neste ambiente; nenhum PR foi criado. A branch remota já está enviada e pronta para abrir o PR quando a integração GitHub tiver permissão para criar pull requests.

## Homologação remota real — 28/10/2026

Os três documentos abaixo foram criados pelo CRM de produção como documentos novos, salvos no D1 e sincronizados pela integração Buttondown. A lista `Emails` da Buttondown confirmou `Draft` para cada um; a prévia `Email` foi aberta e comparada com o conteúdo estruturado. Não cliquei em `Publish`, não aceitei conversão Fancy, não enviei e-mail e não editei campanhas anteriores.

| Template | ID local/D1 | ID Buttondown | D1: revisão / versão / sincronizada | Status real | Resultado processado |
| --- | --- | --- | --- | --- | --- |
| Novidades do blog | `local-01d81c4e-7191-4e87-9236-16fac2862b52` | `em_295vr0cc2b9hwa6r45x2pb167w` | 2 / 3 / 2 | Draft | Conteúdo, citação, assinatura, links e descadastro renderizados. Links receberam parâmetros UTM; URL de descadastro resolvida pela Buttondown. |
| Curadoria editorial | `local-e86d778c-340e-4f67-9dfc-844209b6060b` | `em_6a8grhbrk785av26pp1pqz24qh` | 2 / 3 / 2 | Draft | Títulos, seções, assinatura, links e descadastro renderizados. Os dois links editoriais continuam apontando para `https://example.com` e são placeholders; substituir por destinos reais antes de qualquer publicação. |
| Edição especial | `local-b686fb37-6159-4df6-8ef4-0b59339d077f` | `em_3s5etry8ep8bsbbtqzpbgxvmh2` | 2 / 3 / 2 | Draft | Ênfase, citação, assinatura, links e descadastro renderizados. A cópia sugere inserir imagem, mas o documento não contém imagem. |

Os três registros D1 retornaram `schemaVersion: 2`, documento estruturado `type: doc`, com 12, 17 e 15 blocos respectivamente. Em um contexto independente do navegador, a lista de campanhas recuperou os três documentos da “Nuvem editorial”; a leitura GET de cada documento confirmou IDs locais e IDs Buttondown acima, junto das revisões. O editor abriu integralmente o documento Novidades do blog no segundo contexto; os outros dois foram confirmados pela listagem de recuperação e pela leitura D1.

Na prévia visual processada, os três corpos foram exibidos pela moldura Buttondown, com títulos e parágrafos legíveis, hierarquia tipográfica, citação/ênfase conforme o template e links renderizados como âncoras com tracking. Nenhum dos três templates contém elemento `<img>` nem botão visual dedicado; portanto, não há imagem editorial/alt a validar e os CTAs são links textuais. A imagem de marca no rodapé externo da Buttondown tem texto alternativo. A prévia mostrou a moldura de cabeçalho/rodapé da Buttondown e o descadastro resolvido. A inspeção de Curadoria detectou os destinos de exemplo; eles não foram alterados por falta de destinos fornecidos.

Evidência conferível por sessão autenticada: [draft Novidades do blog](https://buttondown.com/emails/em_295vr0cc2b9hwa6r45x2pb167w), [draft Curadoria editorial](https://buttondown.com/emails/em_6a8grhbrk785av26pp1pqz24qh) e [draft Edição especial](https://buttondown.com/emails/em_3s5etry8ep8bsbbtqzpbgxvmh2). A confirmação de status veio da listagem real de Emails da Buttondown em 28/10/2026; o HTML processado e a prévia Email foram conferidos nas páginas individuais. Nenhuma captura de caixa de entrada existe, pois nenhum envio ocorreu.

Separação da evidência: os 54 testes unitários e 16 Playwright são locais; testes do endpoint usam mocks e E2E usa Chromium/D1 local. A sincronização acima usou a API real pela integração autenticada do CRM; a listagem, o HTML processado e a prévia visual são observações reais da Buttondown. Permanecem pendentes testes com mensagens efetivamente recebidas em Gmail, Outlook e Apple Mail, incluindo dark mode, bloqueio de imagens e rendering mobile em clientes reais.

Revisão sem alteração de produção: `0002_editorial_tests.sql` segue aditiva (tabela privada e índice único) e consta como pendente no D1 remoto; não foi aplicada. A branch `phase-5-editorial-homologation` continua separada de `main`. A flag `EDITORIAL_TEST_ENABLED` não foi configurada nem alterada; o endpoint exige valor literal `true` e recusa por padrão, porém esta homologação não o chamou. Não houve mudança de permissões Buttondown, deploy em produção, integração à `main` ou envio real.

O inventário de navegador desta execução retornou bloqueio por configuração local do Work. A homologação remota aguarda liberação e sessões autenticadas; nenhuma credencial foi extraída nem foi contornada essa restrição. O estado atual de bindings/deploy remoto não foi revalidado e não deve ser inferido apenas dos documentos anteriores.
