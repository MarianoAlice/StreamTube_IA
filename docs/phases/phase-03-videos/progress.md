# phase-03-videos — Progress

**Status:** completed
**SIs:** 8/8 completed

### SI-03.1 — Configurar fila Redis e cliente de storage
- **Status:** completed
- **Tests:** 3 passing
- **Observations:**
  - O fixture de `env.validation.integration-spec.ts` passou a incluir `REDIS_HOST`, `VIDEOS_BUCKET` e `THUMBNAILS_BUCKET` para o schema Joi novo não quebrar o teste de default do Swagger.

### SI-03.2 — Criar a entidade Video
- **Status:** completed
- **Tests:** 3 passing
- **Observations:**
  - `migration:run` no banco local falhou porque as tabelas de users/channels já existiam sem registro na tabela `migrations` (schema criado por `synchronize` dos testes). A migration de `videos` foi gerada pela comparação do schema, não por um `migration:run` limpo.

### SI-03.3 — Implementar o adaptador de object storage
- **Status:** completed
- **Tests:** 4 passing
- **Observations:**
  - A imagem oficial do MinIO não pôde ser baixada neste ambiente. O teste de integração sobe um S3 local com `s3rver` em vez de esperar o serviço do Compose, que entra no SI-03.8.

### SI-03.4 — Endpoint POST /videos/uploads
- **Status:** completed
- **Tests:** 8 passing
- **Observations:**
  - O `401` do guard de access token não trazia o campo `error`. `UnauthorizedExceptionFilter` passa a responder `{ statusCode, error: "UNAUTHORIZED", message }` e está registrado em `main.ts`.
  - O E2E sobe `s3rver` na porta 4569 porque o endpoint do `.env` aponta para MinIO, que ainda não está no Compose.

### SI-03.5 — Endpoint POST /videos/:id/complete
- **Status:** completed
- **Tests:** 13 passing
- **Observations:**
  - A fila `video.processing` foi exercida contra um container Valkey com alias `redis`, porque o serviço Redis do Compose entra no SI-03.8.
  - O E2E substitui o `StorageService` para aceitar o `etag` fixo do spec; o contrato do multipart real continua no teste do SI-03.3.

### SI-03.6 — Processar vídeo no worker
- **Status:** completed
- **Tests:** 7 passing
- **Observations:**
  - O processador vive em `WorkerModule` (`src/worker.ts`), fora do `AppModule`, para a API não consumir a fila.
  - A fila do produtor passou a nascer com 3 tentativas. O status `failed` só é gravado quando `attemptsMade` alcança esse total; a linha não é apagada.
  - Os testes stubam o `FfmpegService`. `Dockerfile.dev` ainda não tem o binário do FFmpeg; a imagem do worker fica para o SI-03.8.

### SI-03.7 — Endpoints de leitura, playback e download
- **Status:** completed
- **Tests:** 19 passing
- **Observations:**
  - O E2E usa o presigner real do `StorageService`. A assinatura não fala com o bucket, então este spec não sobe `s3rver`.

### SI-03.8 — Subir Redis, MinIO e o worker no Compose
- **Status:** completed
- **Tests:** no tests
- **Observations:**
  - `minio/minio` e `quay.io/minio/minio` não aceitam pull anônimo. O serviço `minio` usa `cgr.dev/chainguard/minio`, que fala a mesma API. O `minio-init` cria os buckets `videos` e `thumbnails`.
  - O container temporário `streamtube-redis` foi removido para o serviço `redis` do Compose ser o dono do hostname.
  - O FFmpeg entrou em `Dockerfile.worker`. A API continua com `tail -f /dev/null`; o worker sobe com `npm run start:worker`.
