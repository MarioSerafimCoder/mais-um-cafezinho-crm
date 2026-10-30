# Centralização e contraste — 30/10/2026

A mensagem recebida no Gmail usava o template externo Classic. O HTML entregue continha `.newsletter-container` com `max-width:600px`, sem margens automáticas; centralizar uma tabela interna não centraliza esse ancestral. O CSS externo também impunha azul aos links e cinza claro às citações.

O CRM passa a criar edições com Modern. Preparar campanha, enviar teste ou sincronizar explicitamente um rascunho antigo troca seu template externo para Modern por uma revisão editorial antes da gravação. Apenas abrir/migrar um original não altera a Buttondown. Campanhas já enviadas continuam inalteradas.

A exportação preserva cores autorais nos elementos de texto, resolve cores herdadas e aplica prioridade inline contra as regras globais do provedor. Botões com fundo recebem texto branco também em um span interno; citações recebem texto legível, borda bordô e fundo claro. O quadro tem fundo externo neutro, largura fluida e tabelas centralizadas. O texto editorial continua alinhado para leitura dentro do quadro.

Homologação sem disparo: rascunho `em_56wjj68b2s9wfr25fv17gwqpe8`, “Revisão visual — centralização e contraste — NÃO ENVIAR”, no modo Markdown/Modern. A prévia real confirmou texto do botão `rgb(255,255,255)` e citação `rgb(37,37,37)`. O HTML processado foi renderizado com 1440 e 390 px: centros em 720 e 195 px, respectivamente, sem overflow horizontal. Evidências locais ignoradas em `logs/email-redesign/`.

Não houve envio real nem upgrade de plano. O Modern acrescenta sua própria identificação e rodapé. CSS global personalizado é pago nesta conta; não foi contratado. Uma nova mensagem entregue ainda precisa ser conferida em Gmail/Outlook; a mensagem que já chegou à caixa postal não muda retroativamente.

Referência: https://docs.buttondown.com/designing-your-email
