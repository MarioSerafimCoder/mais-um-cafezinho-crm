# Correção de audiência e acompanhamento — 13/11/2026

## Evidência do incidente

A campanha `em_2nb4rm4myp8k1twdq15hr59c6h` foi aceita pela API com estado `scheduled` às 17:11:09 UTC (14:11:09 de São Paulo). O CRM registrou `accepted`, mas não consultou a evolução nem a entrega. A interface do provedor depois mostrou `Sent`; o histórico do assinante autorizado não mostrou recebimento dessa edição e a busca no Gmail, incluindo spam e lixeira, não a encontrou.

Isso comprova a lacuna de acompanhamento, não comprova a causa interna da não entrega. A audiência personalizada por nove valores de status era um ponto de divergência: a contagem vinha da API de assinantes, mas a publicação usava outro mecanismo de filtros.

## Comportamento corrigido

- Todos os ativos usa a audiência nativa Everyone (grupo AND vazio). A Buttondown aplica elegibilidade e supressões. A contagem continua estimativa.
- Seleção individual mantém apenas o OR de endereços exatos revalidados; nunca cai em audiência vazia. A elegibilidade é conferida no servidor antes de publicar e novamente pelo provedor no envio.
- A confirmação retorna o estado efetivo do provedor. A tela consulta a tentativa de forma sequencial a cada dez segundos, por até doze consultas, sem republicar. Há atualização manual depois desse período ou de uma falha de consulta.
- Reconciliação retorna métricas disponíveis: destinatários, entregas e falhas. Ausência de tracking, falta de permissão e resposta inválida não viram zeros inventados nem apagam o estado observado.
- Zero destinatários, falhas, agendamento, processamento e entrega registrada têm mensagens distintas. Entrega registrada não garante pasta de entrada nem leitura.
- O histórico de tentativas e o bloqueio contra repetição permanecem. Nenhuma tentativa antiga é liberada para reenvio automático.

Não há migração nova nem alteração de permissões. A publicação usa o deploy GitHub/Cloudflare Pages já existente.

## Contratos consultados

- https://docs.buttondown.com/api-emails-publish
- https://docs.buttondown.com/api-emails-filters
- https://docs.buttondown.com/api-emails-analytics
- https://docs.buttondown.com/retrieving-analytics-data

## Validação

209 testes Vitest, TypeScript/build, lint e compilação Pages Functions passaram. Homologação real deve distinguir envio de prévia e publicação segmentada; somente uma mensagem técnica ao endereço autorizado pelo proprietário pode ser enviada nesta sessão. A newsletter original não deve ser republicada automaticamente.
