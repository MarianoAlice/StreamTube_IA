# 04 — Escopo da Fase 03

Origem: `Escopo-Fase3.txt`, que aponta a definição completa para `docs/project-plan.md`, seção "Fase 03 — Upload e Processamento de Vídeos". Os bullets abaixo são os dessa seção. Nada fora deles entra como capacidade.

Depende de: Fase 01 e Fase 02.

Upload de arquivos grandes sem travar o sistema, processamento automático do vídeo e geração de URL única.

- Serviço de armazenamento de arquivos (vídeos e thumbnails).
- Serviço de processamento em segundo plano (filas).
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance.
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload.
- Processamento automático do vídeo após upload (extração de duração e metadados).
- Geração automática de thumbnail a partir de um frame do vídeo.
- URL única por vídeo, sem conflito com outros vídeos.
- Reprodução via streaming (sem necessidade de download completo).
- Download do vídeo pelo usuário.

Entregáveis do plano original: upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando e URLs únicas geradas.

## Persistência

Uma entidade/tabela de vídeos ligada ao canal, com pelo menos: identificação, dono (canal), título, status (exemplo do enunciado: rascunho → processando → pronto/erro), chaves de storage do arquivo e do thumbnail, duração e metadados, e o identificador da URL única. O modelo exato sai do Data Model do plano, não deste arquivo.

## Decisões que a research precisa tomar e justificar

Registrar em `docs/decisions/technical-decisions-phase-03-videos.md`, cada uma com opções, trade-offs e recomendação, no formato da skill `research`:

- Tecnologia de fila. O plano do projeto deixa explícito como "TBD" (`CLAUDE.md` da raiz, Message Queue). É a decisão de stack aberta da fase.
- Estratégia de upload de 10GB sem travar. O enunciado dá o exemplo de upload direto ao storage via URL pré-assinada / multipart, em vez de o arquivo passar pela API. O exemplo é ponto de partida da pesquisa, não a decisão já tomada.
- Como o worker roda (processo/container separado) e como extrai metadados e gera o thumbnail (FFmpeg/ffprobe).
- Estratégia de URL única e a de streaming. O enunciado cita requisições com range / 206 Partial Content como exemplo a pesquisar.
- Ciclo de status do vídeo e o que acontece em falha de processamento.

## Object storage

Não é escolha em aberto. O projeto já aponta para S3 compatível: MinIO local no Docker (mesma API do S3), S3 em produção. O que se decide é o uso (organização de buckets/chaves, upload pré-assinado), não o produto. A decisão de stack genuinamente aberta é a fila.

Essas decisões são o núcleo do `research`. Pesquisar, registrar trade-offs e a escolha no documento de decisões, e só então ir para `plan-context`.

Frontend (`next-frontend/`) não está nesta lista. Categorias, edição, publicação, visibilidade e painel são a Fase 04 em `docs/project-plan.md` e ficam fora.
