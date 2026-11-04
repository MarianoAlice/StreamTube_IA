---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-11-04T10:59:20.8835321-03:00"
  docs/project-plan.md: "2026-11-03T09:20:57.1684102-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-04T09:34:07.1647386-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-11-03T09:20:57.1589583-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-11-03T09:20:57.1589583-03:00"
  docs/phases/phase-02-auth/context.md: "2026-11-03T09:20:57.1684102-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-11-03T09:20:57.1684102-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-11-03T09:20:56.9750526-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar o upload de até 10GB funcional, o processamento automático do vídeo, o streaming e as URLs únicas: armazenamento de vídeos e thumbnails, filas, pré-cadastro do rascunho ao iniciar o upload, extração de duração e metadados, thumbnail a partir de um frame, URL única sem conflito, reprodução via streaming sem download completo e download pelo usuário.

---

## Step Implementations

### SI-03.1 — Configurar fila Redis e cliente de storage

**Description:** Registrar a configuração namespaced da fila e do object storage para o worker e a API usarem o mesmo módulo sem carregar bytes no processo HTTP.

**Technical actions:**

1. Estender o schema Joi em `src/config/env.validation.ts` com as variáveis de Redis e dos buckets `videos` e `thumbnails` (per `phase-01-configuracao-base/TD-02`, `phase-03-videos/TD-01`, `phase-03-videos/TD-07`).
2. Criar `src/config/queue.config.ts` e `src/config/storage.config.ts` com `registerAs`, um arquivo por domínio (per `phase-01-configuracao-base/TD-03`).
3. Registrar `BullModule.forRootAsync` lendo o factory de fila — Redis é o broker, pacote `@nestjs/bullmq` (per `phase-03-videos/TD-01`).
4. Registrar um provider do cliente AWS SDK v3 apontando para os dois buckets, MinIO local e S3 em produção (per `phase-03-videos/TD-07`).
5. Importar os dois configs no `AppModule` via `ConfigModule` e injetar com `ConfigType` (per `phase-01-configuracao-base/TD-01`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `QueueModule` + `StorageModule` | Unit: compilation test | `src/videos/videos-infra.module.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- A API sobe quando as variáveis de Redis e dos buckets `videos` e `thumbnails` estão presentes.
- Subir a API sem `REDIS_HOST` falha na validação Joi no bootstrap e o processo não permanece no ar.
- Subir a API sem o nome do bucket `videos` falha na validação Joi no bootstrap e o processo não permanece no ar.

---

### SI-03.2 — Criar a entidade Video

**Description:** Persistir o rascunho do vídeo com UUID público e o ciclo `draft` → `processing` → `ready` ou `failed`.

**Technical actions:**

1. Criar `src/videos/video.entity.ts` com os campos de `### Data Model` → `#### Video`: `id`, `channel_id`, `status`, `duration_seconds`, `metadata`, `multipart_upload_id`, `created_at`, `updated_at` (per `phase-03-videos/TD-04`, `phase-03-videos/TD-06`, `phase-03-videos/TD-02`).
2. Gerar a migration TypeORM com `synchronize: false` (per `phase-01-configuracao-base/TD-04`).
3. Registrar `Video` no módulo de vídeos com `autoLoadEntities` já ligado no `TypeOrmModule.forRootAsync`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: constraints, defaults | `src/videos/video.entity.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- Inserir um `Video` sem `channel_id` viola a FK e a linha não é gravada.
- Inserir um `Video` só com `channel_id` grava `status` = `draft` e `duration_seconds` nulo.
- Dois `Video` do mesmo `channel_id` recebem `id` uuid distintos.

---

### SI-03.3 — Implementar o adaptador de object storage

**Description:** Emitir URLs pré-assinadas de multipart e de GET sem a API transportar o arquivo.

**Technical actions:**

1. Criar `src/storage/storage.service.ts` com `createMultipartUpload` e presign de cada parte, devolvendo `uploadId` e `{ partNumber, url }` (per `phase-03-videos/TD-02`).
2. Completar o multipart no bucket `videos` com a lista `{ partNumber, etag }` recebida do cliente (per `phase-03-videos/TD-02`, `phase-03-videos/TD-07`).
3. Emitir presigned GET no bucket `videos` e, no download, o mesmo call com override de `Content-Disposition` (per `phase-03-videos/TD-05`).
4. Gravar a thumbnail no bucket `thumbnails` sob a chave derivada de `id` (per `phase-03-videos/TD-07`, `phase-03-videos/TD-03`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StorageService` | Integration: local adapter | `src/storage/storage.service.integration-spec.ts` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- `createMultipartUpload` com `partCount` = 2 devolve `uploadId` e duas URLs, sem receber o corpo do arquivo.
- `completeMultipartUpload` com `parts` válidos deixa o objeto no bucket `videos`.
- O presigned GET de download inclui `Content-Disposition`; o de playback não.
- O upload da thumbnail grava o objeto no bucket `thumbnails` sob a chave do `id`.

---

### SI-03.4 — Endpoint POST /videos/uploads

**Route:** POST /videos/uploads
**Test Specs:** see `nestjs-project/specs/videos-uploads.plan.md`
**Authorization:** Authenticated

**Description:** Abrir o upload multipart e gravar o vídeo como `draft` no momento do initiate.

**Technical actions:**

1. Criar o DTO com `contentType`, `sizeBytes` e `partCount` conforme `### API Contracts` → `POST /videos/uploads`, validado com class-validator (per `phase-02-auth/TD-06`).
2. Em `VideosService.initiate`, resolver o `channel_id` do usuário autenticado, rejeitar `sizeBytes` acima de 10GB com `UPLOAD_TOO_LARGE`, criar a linha `draft` e guardar `multipart_upload_id` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-04`).
3. Expor `POST /videos/uploads` no controller, protegido pelo guard de access token, respondendo `201` com `id`, `status`, `uploadId` e `parts`.
4. Documentar a operação, o `201` e os erros com os decoradores explícitos do Swagger, envelope `{ statusCode, error, message }` (per `openapi-docs-nestjs/TD-01`, `phase-02-auth/TD-07`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.initiate` | Unit: branch logic (mock repo) | `src/videos/videos.service.spec.ts` |
| `VideosService.initiate` | Integration: DB contract | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.2 + SI-03.3

**Acceptance criteria:**

- `POST /videos/uploads` autenticado com `contentType`, `sizeBytes` e `partCount` válidos retorna `201` com `status: "draft"`, `id` uuid e `parts` de tamanho `partCount`.
- A linha em `videos` com esse `id` existe, `status` = `draft` e `channel_id` é o canal do usuário autenticado.
- `POST /videos/uploads` sem access token retorna `401`.
- `POST /videos/uploads` com `sizeBytes` acima de 10GB retorna `413` com `error: "UPLOAD_TOO_LARGE"`.
- `POST /videos/uploads` sem `partCount` retorna `400` com `error: "VALIDATION_ERROR"`.

---

### SI-03.5 — Endpoint POST /videos/:id/complete

**Route:** POST /videos/:id/complete
**Test Specs:** see `nestjs-project/specs/videos-complete.plan.md`
**Authorization:** Owner

**Description:** Concluir o multipart, enfileirar `video.processing` e mover o vídeo de `draft` para `processing`.

**Technical actions:**

1. Criar o DTO com `parts: { partNumber, etag }[]` conforme `### API Contracts` → `POST /videos/:id/complete` (per `phase-02-auth/TD-06`).
2. Em `VideosService.complete`, exigir o dono do `channel_id`; se `status` não for `draft`, lançar `UPLOAD_NOT_COMPLETABLE`; se o `id` não existir, `VIDEO_NOT_FOUND` (per `phase-03-videos/TD-06`).
3. Chamar `completeMultipartUpload`, enfileirar `video.processing` com payload `{ "videoId": "uuid" }` e gravar `status` = `processing` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`).
4. Expor `POST /videos/:id/complete` respondendo `202` com `id` e `status`, e documentar a operação no Swagger (per `openapi-docs-nestjs/TD-01`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.complete` | Unit: branch logic (mock repo) | `src/videos/videos.service.spec.ts` |
| `VideosService.complete` | Integration: DB contract | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.1 + SI-03.4

**Acceptance criteria:**

- `POST /videos/:id/complete` pelo dono, com `status` = `draft` e `parts` válidos, retorna `202` com `status: "processing"`.
- A linha passa a `status` = `processing` e a fila contém um job `video.processing` cujo payload é `{ "videoId": "<id>" }`.
- `POST /videos/:id/complete` sem access token retorna `401`.
- `POST /videos/:id/complete` autenticado por quem não é o dono do canal retorna `403`.
- `POST /videos/:id/complete` com `id` inexistente retorna `404` com `error: "VIDEO_NOT_FOUND"`.
- `POST /videos/:id/complete` com `status` diferente de `draft` retorna `409` com `error: "UPLOAD_NOT_COMPLETABLE"`.

---

### SI-03.6 — Processar vídeo no worker

**Description:** Consumir `video.processing` fora do processo da API, extrair duração e metadados, gerar a thumbnail e fechar o ciclo em `ready` ou `failed`.

**Technical actions:**

1. Criar o bootstrap do worker no mesmo codebase e no mesmo módulo de config, com processo separado do `main.ts` da API (per `phase-03-videos/TD-03`).
2. Criar o processor de `video.processing` que lê `{ "videoId" }` conforme `### Events/Messages`.
3. Baixar o objeto do bucket `videos`, extrair `duration_seconds` e `metadata`, e um frame para thumbnail via binário FFmpeg (per `phase-03-videos/TD-03`).
4. Gravar a thumbnail no bucket `thumbnails` e atualizar `duration_seconds`, `metadata` e `status` = `ready`.
5. Configurar o retry da fila; só depois do esgotamento gravar `status` = `failed`, sem apagar a linha (per `phase-03-videos/TD-01`, `phase-03-videos/TD-06`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoProcessor` | Unit: branch logic (mock repo) | `src/videos/video.processor.spec.ts` |
| `VideoProcessor` | Integration: DB contract | `src/videos/video.processor.integration-spec.ts` |

**Dependencies:** SI-03.1 + SI-03.2 + SI-03.3

**Acceptance criteria:**

- Um job `video.processing` com `videoId` de um vídeo `processing` termina com `status` = `ready`, `duration_seconds` preenchido e `metadata` não nulo.
- O bucket `thumbnails` contém o objeto do frame sob a chave desse `id`.
- Depois que os retries da fila se esgotam, a linha permanece e `status` = `failed`.
- Uma segunda entrega do mesmo job com `status` já `ready` não volta o vídeo para `processing` nem para `failed`.

---

### SI-03.7 — Endpoints de leitura, playback e download

**Route:** GET /videos/:id, GET /videos/:id/playback, GET /videos/:id/download
**Test Specs:** see `nestjs-project/specs/videos-read.plan.md`
**Authorization:** Anonymous

**Description:** Expor a URL única do vídeo e emitir o presigned GET de streaming ou de download sem a API carregar o arquivo.

**Technical actions:**

1. Em `VideosService.findOne`, devolver `id`, `status` e `duration_seconds`, ou `VIDEO_NOT_FOUND` (per `phase-03-videos/TD-04`).
2. Em `VideosService.playbackUrl`, se `status` não for `ready` lançar `VIDEO_NOT_READY`; senão devolver `{ url }` do presigned GET (per `phase-03-videos/TD-05`, `phase-03-videos/TD-06`).
3. Em `VideosService.downloadUrl`, usar o mesmo presign com override de `Content-Disposition` (per `phase-03-videos/TD-05`).
4. Expor `GET /videos/:id`, `GET /videos/:id/playback` e `GET /videos/:id/download` sem guard, e documentá-los no Swagger (per `openapi-docs-nestjs/TD-01`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.findOne` | Unit: branch logic (mock repo) | `src/videos/videos.service.spec.ts` |
| `VideosService.playbackUrl` | Integration: DB contract | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.2 + SI-03.3

**Acceptance criteria:**

- `GET /videos/:id` sem access token, para um vídeo existente, retorna `200` com `id`, `status` e `duration_seconds`.
- `GET /videos/:id` com `id` inexistente retorna `404` com `error: "VIDEO_NOT_FOUND"`.
- `GET /videos/:id/playback` com `status` = `ready` retorna `200` com `url`.
- `GET /videos/:id/playback` com `status` diferente de `ready` retorna `409` com `error: "VIDEO_NOT_READY"`.
- `GET /videos/:id/download` com `status` = `ready` retorna `200` com `url`.
- `GET /videos/:id/download` com `status` = `processing` retorna `409` com `error: "VIDEO_NOT_READY"`.

---

### SI-03.8 — Subir Redis, MinIO e o worker no Compose

**Description:** Isolar FFmpeg num serviço próprio e disponibilizar Redis e os buckets no mesmo network do Compose.

**Technical actions:**

1. Adicionar o serviço `redis` ao Compose e apontar `REDIS_HOST=redis` na API e no worker (per `phase-03-videos/TD-01`).
2. Adicionar o serviço MinIO com os buckets `videos` e `thumbnails`, endereço pelo nome do serviço (per `phase-03-videos/TD-07`).
3. Adicionar o serviço do worker com FFmpeg na imagem, mesmo codebase, comando de bootstrap distinto do `nestjs-api` (per `phase-03-videos/TD-03`).
4. Fazer `nestjs-api` e o worker dependerem de `redis` e do MinIO estarem de pé antes do start.

**Tests:** _(empty — Infra)_

**Dependencies:** SI-03.1 + SI-03.6

**Acceptance criteria:**

- `docker compose config` lista os serviços `redis`, MinIO e o worker de vídeo, além de `nestjs-api`.
- O comando do worker é diferente do comando de `nestjs-api`.
- `REDIS_HOST` e o endpoint de storage usados pela API e pelo worker são os nomes dos serviços do Compose, não `localhost`.

---

## Technical Specifications

### Data Model

#### Video

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated — public URL segment (`phase-03-videos/TD-04`) |
| channel_id | uuid | FK → channels.id, not null |
| status | enum | not null, default `draft`; values `draft`, `processing`, `ready`, `failed` — four states (`phase-03-videos/TD-06`); row is created as `draft` at initiate (`phase-03-videos/TD-02`); `failed` only after queue retries end |
| duration_seconds | integer | nullable — set when the worker finishes duration extraction |
| metadata | jsonb | nullable — set when the worker finishes metadata extraction (`phase-03-videos/TD-03`) |
| multipart_upload_id | varchar | nullable — multipart upload id returned at initiate (`phase-03-videos/TD-02`) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Relations:** `Channel` has many `Video` (many-to-one via `channel_id`; `Channel` is the phase 02 one-to-one with `User`)
**Indexes:** unique on `id` (PK); index on `channel_id`
**Storage:** two buckets, `videos` and `thumbnails`; object keys live under `id` (`phase-03-videos/TD-07`). The API does not store the object bytes.

### API Contracts

#### POST /videos/uploads (SI-03.4)

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer access token

**Request body:**
- contentType: string, required
- sizeBytes: number, required — integer ≥ 1, max 10GB
- partCount: number, required — integer ≥ 1

**Response 201:**
- id: string (uuid) — public URL segment (`phase-03-videos/TD-04`); row created as `draft` at this call (`phase-03-videos/TD-02`)
- status: `draft`
- uploadId: string — multipart upload id
- parts: array of `{ partNumber: number, url: string }` — presigned part URLs; the API does not carry the bytes (`phase-03-videos/TD-02`)

**Error responses:**
- 401: when the access token is missing or invalid
- 400 validation error: when the request body fails schema validation (`phase-02-auth/TD-06`)
- 413 UPLOAD_TOO_LARGE: when `sizeBytes` is above 10GB

---

#### POST /videos/:id/complete (SI-03.5)

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer access token

**Request body:**
- parts: array of `{ partNumber: number, etag: string }`, required — parts the client uploaded to storage

**Response 202:**
- id: string (uuid)
- status: `processing` — set after the multipart upload is completed and the job is enqueued (`phase-03-videos/TD-06`, `phase-03-videos/TD-01`)

**Error responses:**
- 401: when the access token is missing or invalid
- 403: when the authenticated user is not the channel owner
- 404 VIDEO_NOT_FOUND: when `id` does not match a video
- 409 UPLOAD_NOT_COMPLETABLE: when `status` is not `draft`
- 400 validation error: when the request body fails schema validation (`phase-02-auth/TD-06`)

---

#### GET /videos/:id (SI-03.7)

**Request headers:**
- None required

**Response 200:**
- id: string (uuid)
- status: `draft` | `processing` | `ready` | `failed`
- duration_seconds: number | null

**Error responses:**
- 404 VIDEO_NOT_FOUND: when `id` does not match a video

---

#### GET /videos/:id/playback (SI-03.7)

**Request headers:**
- None required

**Response 200:**
- url: string — presigned GET; the client sends `Range` to storage and reads `206` from storage (`phase-03-videos/TD-05`)

**Error responses:**
- 404 VIDEO_NOT_FOUND: when `id` does not match a video
- 409 VIDEO_NOT_READY: when `status` is not `ready`

---

#### GET /videos/:id/download (SI-03.7)

**Request headers:**
- None required

**Response 200:**
- url: string — the same presigned GET as playback, with a `Content-Disposition` override (`phase-03-videos/TD-05`)

**Error responses:**
- 404 VIDEO_NOT_FOUND: when `id` does not match a video
- 409 VIDEO_NOT_READY: when `status` is not `ready`

---

#### Validation Rules — Upload initiate

- `contentType`: required string
- `sizeBytes`: required integer, ≥ 1, max 10GB
- `partCount`: required integer, ≥ 1
- `POST /videos/:id/complete` `parts`: required array; each item has `partNumber` (integer ≥ 1) and `etag` (non-empty string)

### Authorization Matrix

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| POST /videos/uploads | ✗ | ✓ | ✓ |
| POST /videos/:id/complete | ✗ | ✗ | ✓ |
| GET /videos/:id | ✓ | ✓ | ✓ |
| GET /videos/:id/playback | ✓ | ✓ | ✓ |
| GET /videos/:id/download | ✓ | ✓ | ✓ |

Playback and download still return `VIDEO_NOT_READY` unless `status` is `ready`, including for the owner. The object stays private; anonymous access is only the presigned URL issued by the API (`phase-03-videos/TD-05`).

### Error Catalog

**Error response format:** inherited from `phase-02-auth/TD-07` for every nestjs-project HTTP endpoint:

```
{ statusCode: number, error: string, message: string }
```

The `error` field carries the domain code. Validation failures keep `error` = `VALIDATION_ERROR` and `message` as the field-error array (`phase-02-auth/TD-06`).

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| UPLOAD_TOO_LARGE | 413 | `POST /videos/uploads` with `sizeBytes` above 10GB |
| UPLOAD_NOT_COMPLETABLE | 409 | `POST /videos/:id/complete` when `status` is not `draft` |
| VIDEO_NOT_FOUND | 404 | `id` does not match a video |
| VIDEO_NOT_READY | 409 | `GET /videos/:id/playback` or `GET /videos/:id/download` when `status` is not `ready` |
| VALIDATION_ERROR | 400 | Request body fails schema validation |

### Events/Messages

#### video.processing

**Payload:**

```json
{ "videoId": "uuid" }
```

**Producer:** `VideosService` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-06`) — enqueued when `POST /videos/:id/complete` moves `status` from `draft` to `processing`
**Consumer:** video worker in its own Compose service (per `phase-03-videos/TD-03`) — extracts `duration_seconds` and `metadata`, writes a thumbnail frame into the `thumbnails` bucket, then sets `status` to `ready` or `failed`
**Trigger:** the multipart upload has been completed and the source object is in the `videos` bucket (`phase-03-videos/TD-07`)
**Delivery semantics:** at-least-once (per `phase-03-videos/TD-01`) — `@nestjs/bullmq` on Redis owns retries; `failed` is set only after those retries end (per `phase-03-videos/TD-06`)

---

## Dependency Map

```
SI-03.1 (root)
└── SI-03.3 — depends on SI-03.1 (config before the storage adapter)
    ├── SI-03.4 — depends on SI-03.2 + SI-03.3
    ├── SI-03.6 — depends on SI-03.1 + SI-03.2 + SI-03.3
    └── SI-03.7 — depends on SI-03.2 + SI-03.3

SI-03.2 (root)
├── SI-03.4
├── SI-03.6
└── SI-03.7

SI-03.1 + SI-03.4
└── SI-03.5 — depends on SI-03.1 + SI-03.4 (queue and draft before complete)

SI-03.1 + SI-03.6
└── SI-03.8 — depends on SI-03.1 + SI-03.6 (worker entry before its Compose service)
```

Linearized implementation order: SI-03.1, SI-03.2 (parallel) → SI-03.3 → SI-03.4, SI-03.6, SI-03.7 (parallel) → SI-03.5 → SI-03.8

---

## Deliverables

- [ ] SI-03.1 — Configurar fila Redis e cliente de storage
- [ ] SI-03.2 — Criar a entidade Video
- [ ] SI-03.3 — Implementar o adaptador de object storage
- [ ] SI-03.4 — Endpoint POST /videos/uploads
- [ ] SI-03.5 — Endpoint POST /videos/:id/complete
- [ ] SI-03.6 — Processar vídeo no worker
- [ ] SI-03.7 — Endpoints de leitura, playback e download
- [ ] SI-03.8 — Subir Redis, MinIO e o worker no Compose

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && npm test`)
- [ ] E2E tests pass (`cd nestjs-project && npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && npx tsc --noEmit`)
- [ ] Project builds successfully (`cd nestjs-project && npm run build`)

