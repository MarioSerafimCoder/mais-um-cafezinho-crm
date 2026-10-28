# Homologação real de produção — 28/10/2026

## Publicação e infraestrutura

- A fase 2 foi enviada à branch `phase-2-editor-stability`, integrada à `main` (`ea4ac01`) e publicada com sucesso no Cloudflare Pages, deploy `777bb8c5-30a7-416c-82bc-a34fee6bc16d`, associado a `crm.marioserafim.com.br`.
- D1 dedicado criado: `mais-um-cafezinho-editorial`, id `4460ef9d-fb2b-4756-aa00-37fb0b80d056`, região WEUR. O banco preexistente LASTRO não foi alterado.
- Migração `0001_editorial_documents.sql` aplicada remotamente; schema consultado e lista de migrações sem pendências. Apenas documentos/configurações editoriais, sem assinantes.
- Binding `DB` configurado exclusivamente em `env.production`, commit `c5f336c`. O status autenticado confirmou `cloud:true` e uma gravação real foi conferida diretamente no D1.
- A consulta real à Buttondown revelou que Workers não implementa `redirect: error`. O commit `1c3e08a` usa `manual` e rejeita respostas 3xx sem seguir o destino. Cloudflare Pages e GitHub Actions `verify` concluíram com sucesso nesse commit; a interface confirmou conexão real depois do deploy.
- Cloudflare Access continuou exigindo login. Não houve alteração de DNS, política de acesso, permissão de envio ou exposição de secrets.

## Recuperação entre navegadores

1. No navegador do ChatGPT, pelo domínio oficial autenticado, foi criado o documento `local-35b7634d-02eb-4916-bc95-5bd0e218a33b`, assunto “Homologação privada — recuperação e HTML — 28/10/2026”, com o template Edição especial.
2. A ação Salvar cópia na nuvem foi executada. Consulta remota confirmou schemaVersion 2, versão 1 e assunto correto.
3. No Chrome, com armazenamento de navegador separado, o mesmo endereço abriu o assunto e todo o conteúdo estruturado recuperados do D1.
4. No Chrome foram inseridos imagem/alt e criada a campanha Buttondown. O D1 passou à versão 3 com o vínculo `em_538w0qf45z89wvk0tc0s3stp02`.

O teste comprova recuperação do navegador do ChatGPT para o Chrome. Não caracteriza colaboração simultânea: salvar cópia ou sincronizar continua sendo necessário. Os testes automatizados anteriores também cobrem conflitos de versão.

## Rascunho privado e HTML

Rascunho real: [Homologação privada na Buttondown](https://buttondown.com/emails/em_538w0qf45z89wvk0tc0s3stp02). A listagem da Buttondown e a consulta real pela API confirmaram `draft`; nenhum envio ou publicação foi realizado. O rascunho foi mantido para revisão do proprietário.

- A API devolveu **7653 caracteres** de corpo, exatamente iguais ao HTML exportado pelo CRM acrescido do marcador `<!-- buttondown-editor-mode: fancy -->`. Não houve edição ou confirmação de conversão pelo editor da Buttondown durante a conferência.
- A imagem PNG de demonstração por URL carregou na edição e na prévia processada, com o texto alternativo “Faixa vermelha de homologação do Mais um Cafezinho”. O endereço externo respondeu 200 com tipo image/png.
- Portfólio e Blog preservaram os destinos e responderam 200. Na prévia processada, a Buttondown acrescentou parâmetros UTM.
- `{{ unsubscribe_url }}` foi resolvido para um endereço real de descadastro na prévia, e a Buttondown acrescentou seu próprio rodapé de gerenciamento de assinatura. O link não foi acionado, evitando modificar inscrições.
- Títulos, parágrafos, citação, assinatura e imagem apareceram na prévia processada.

**Limitação observada:** a prévia da Buttondown envolve o HTML com seu próprio cabeçalho/rodapé e estilos externos. Além disso, o editor Fancy exibe aviso de conversão incompleta; o modo de edição à esquerda não representa todo o layout original. Portanto, o corpo armazenado foi preservado, mas a fidelidade visual completa e a reedição no Fancy **não estão homologadas**. Evite editar/aceitar a conversão desse conteúdo no painel da Buttondown até revisar o modo de composição e o template externo. Não foi alterada a configuração global da newsletter.

O upload pelo seletor de arquivo do Chrome ficou impedido pela permissão da extensão para arquivos locais. Não foi ampliada essa permissão; a imagem foi inserida pelo fluxo normal de URL. Upload real de arquivo permanece pendente, embora validação e falhas sejam cobertas por mocks.

## Validação e próximos passos

- 40 testes unitários/de componente passaram após a correção de runtime; TypeScript/build passaram.
- Os 13 cenários Playwright foram repetidos com sucesso antes do vínculo remoto; cobrem recuperação, conflitos, histórico, falhas e desktop/mobile no runtime local.
- O check `verify` no GitHub executou a validação completa e passou em `1c3e08a`; o deploy Cloudflare desse commit também passou.
- Evidência visual local: `logs/buttondown-homologacao.jpg` (ignorada no Git).

Próxima etapa: escolher o modo de composição/template da Buttondown que preserve a apresentação desejada, validar reabertura sem conversão destrutiva e então, com destinatários de teste definidos pelo proprietário e autorização específica, verificar clientes reais de e-mail. Descadastro funcional em mensagem entregue e entregabilidade ainda não foram testados. Envio/publicação continuam indisponíveis no CRM.
