# Fase 4 — fidelidade visual, 28/10/2026

## Decisão e plano conectado

O painel Billing da conta Mário Serafim mostrou **Plan Free**, zero assinantes faturáveis. Nenhum upgrade, alteração global de template, DNS, Access, D1 ou permissão de API foi realizado.

| Alternativa | Resultado e decisão |
| --- | --- |
| Fancy | Aceita HTML pela API, mas sua conversão para documento visual pode perder partes. O rascunho da fase 3 mostrou esse aviso. Evitar essa conversão mantendo CRM como editor. |
| Markdown (`plaintext` no marcador do corpo) | Disponível e exercitado na conta Free com HTML real. Recomendado: fragmento HTML com tabelas e estilos inline, mantendo o template externo existente da newsletter. Não é uma conversão do documento JSON para Markdown. |
| Template `plaintext` | É texto sem HTML e diferente do modo de composição acima. Não serve para preservar imagens, botões e cores; não foi escolhido. |
| Custom Template | Controla a moldura da newsletter, não substitui o documento estruturado. A documentação de personalização indica Basic; acesso específico ao editor Custom não foi homologado no Free. Não foi usado nem configurado. |
| Naked | Documentado como Professional. Remove a moldura externa e dá controle do HTML completo, inclusive cabeçalho, rodapé e estilos do documento. Não foi ativado nem contratado. Mesmo assim, não garante equivalência entre clientes de e-mail. |

Fontes oficiais: [modos de edição](https://docs.buttondown.com/editor-modes), [formato de criação pela API](https://docs.buttondown.com/api-emails-create), [design e limitações](https://docs.buttondown.com/designing-your-email), [Naked e Professional](https://docs.buttondown.com/naked-mode).

## Implementação

- `DraftSession` e JSON/D1 continuam intactos. Não há conversão de retorno do corpo Buttondown para o documento estruturado existente.
- O corpo de sincronização agora é um fragmento do `body`, com marcador explícito `buttondown-editor-mode: plaintext`. Não encaminha `doctype`, `head` ou um segundo documento HTML dentro da moldura da Buttondown. Não remove espaços de texto ou de blocos pré-formatados.
- O fragmento conserva tabelas de apresentação centralizadas, largura fluida/max-width, estilos inline existentes, imagens/alt, links/botões, assinatura e links sociais. Acrescenta descadastro apenas quando ausente. Não injeta fontes remotas, scripts, grid, flex ou CSS novo. Regras de `head`, como media queries, não fazem parte do fragmento; a alternativa depende dos estilos inline e do layout fluido.
- A prévia distingue HTML original e fragmento de compatibilidade. O resultado processado é acessado por link para a Buttondown, claramente referente à última sincronização. Não há simulação da moldura remota nem iframe com conteúdo remoto não verificado. Mensagem explícita explica as diferenças em Gmail/Outlook.
- Não foram liberados `template`, `publish_date`, audiências ou campos extras no proxy de escrita. Status continua obrigatoriamente `draft`; campanhas publicadas continuam protegidas.
- Criações de resultado incerto conservam payload/chave de idempotência antigos até a confirmação; a nova composição vale para novas sincronizações, sem mudar um pedido pendente durante a retomada.

## Comparação real e preservação

Rascunho original preservado: `em_538w0qf45z89wvk0tc0s3stp02`. Não foram aceitas conversões nem feitas edições nele.

Um rascunho separado foi criado para comparação: [Fase 4 — não enviar](https://buttondown.com/emails/em_2pf2apswbx8csb8aswnwpfky1b). Nele foi selecionado Markdown e inserido o fragmento derivado do HTML da homologação, sem alterar a configuração global.

A prévia processada mostrou títulos, citação, imagem com alt, assinatura, Portfólio/Blog e descadastro resolvido, sem o aviso de conversão Fancy. O cabeçalho, rodapé e parâmetros de rastreamento da Buttondown continuaram presentes. A mudança evita a reedição destrutiva por Fancy; **não elimina a moldura externa nem promete fidelidade pixel a pixel**. Evidência local ignorada no Git: `logs/phase4-markdown.jpg`.

## Upload independente da extensão

Upload real pelo navegador interno autenticado em produção, usando o seletor normal de arquivos e a rota `/api/images`, sem a extensão Chrome:

- PNG local válido aceito; URL retornada `https://assets.buttondown.email/images/55f68d84-50b4-46c8-a172-1531d7bf4201.png`.
- Inserção explícita após upload, alt “Imagem PNG enviada diretamente para a Buttondown”; imagem carregou com largura natural 600.
- Arquivo `.png` com conteúdo SVG foi recusado com “O conteúdo do arquivo não corresponde ao formato informado”.
- Arquivo de 8.000.001 bytes foi recusado com “A imagem deve ter até 8 MB”. O teste de backend também verifica a recusa por tamanho antes de encaminhar à Buttondown.
- Mantidos MIME, assinatura, limite de arquivo de 8 MB e limite de leitura multipart; sem relaxar segurança. Evidência: `logs/phase4-upload.jpg`.

## Preparação para testes de envio

A seção de homologação exige endereço e checkbox de autorização, mostra o destino e invalida a confirmação quando o endereço muda. A ação é explicitamente **preparar sem enviar**, não faz chamadas de rede e não é uma autorização armazenada no servidor. Nenhum endpoint de envio foi adicionado.

Contrato para a futura ativação: allowlist exata de destinatários no servidor (nunca confiada ao cliente), flag desativada por padrão, conferência de status draft e revisão do documento, apresentação do destinatário e confirmação final por tentativa, idempotência e auditoria sem secrets. O backend deverá recusar revisão desatualizada, destinatário fora da lista e qualquer envio sem confirmação. Somente depois de autorização do proprietário poderão ser conferidas as permissões mínimas do endpoint dedicado `send-draft`; o teste de conteúdo não justifica liberar publicação ou envio em massa.

## Validação e pendências

44 testes unitários/de componente e 13 Playwright passaram, além de lint, TypeScript, build e compilação das Functions. Regressões cobrem estrutura/estilos/links/alt/descadastro, espaços significativos, tamanho de upload e preparação sem rede. Não foram realizadas chamadas de envio.

Continuam pendentes: reabertura no modo Markdown após sincronização real de todos os tipos de bloco, teste de cada template no processador remoto e homologação em Gmail/Outlook/Apple Mail com destinatários autorizados, incluindo dark mode, imagens bloqueadas, fontes substitutas, quebra de linhas, botões e descadastro em mensagem entregue. Sem Professional, o CRM não controla a moldura completa; sem testes de entrega, nem Naked permite garantir resultados idênticos.
