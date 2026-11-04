---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-11-03
scope_description: "Backend video module: object storage, queue, large upload, background processing, unique URL, streaming, and download."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — API, database, Docker Compose stack, object storage, queue, and video worker. All open choices in this document land here.
- `next-frontend/` — out of this phase. No UI capability is in scope (categorias, edição, publicação, visibilidade e painel are Phase 04). No open decision in this document.

Inherited and not reopened: `@nestjs/config` + Joi for env (`phase-01-configuracao-base`), class-validator, domain exception filter, JWT auth, and the user↔channel 1:1 (`phase-02-auth`). Object storage product is fixed by the architecture: S3-compatible, MinIO in local Docker, S3 in production. The C4 diagram already places a Video Worker (FFmpeg) and a message queue whose technology is TBD. Context7 was not available in this session; sources below are the official pages read for the installed NestJS 11 stack (no queue or S3 client is installed yet).

---

## TD-01: Queue technology

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** After a video upload finishes, duration extraction and thumbnail generation must run off the API process. The root architecture leaves the message queue as TBD. NestJS 11 is the installed framework; PostgreSQL 17 is already in Compose. The worker (TD-03) consumes whatever this TD selects.

**Options:**

### Option A: BullMQ + Redis, via `@nestjs/bullmq`
- NestJS documents `@nestjs/bullmq` as the maintained integration. Bull is maintenance-only. Producers and consumers share a Redis-backed queue and can run in different processes. Jobs survive a process restart.
- **Pros:** Official Nest module, retries and backoff built in, separate worker process is the documented shape. Fits a long FFmpeg job without holding an HTTP request.
- **Cons:** Adds a Redis service to Compose. BullMQ also documents a PostgreSQL backend, but the Nest module's documented `forRoot` connection is Redis, so that backend is not the path this option takes.

### Option B: pg-boss on the existing PostgreSQL
- Jobs live in PostgreSQL and are claimed with row locks. No new datastore. A worker process still runs separately and polls the same database the API uses.
- **Pros:** No Redis. One less service to operate locally. Durability matches the database the project already trusts.
- **Cons:** No official NestJS module. Job throughput and locking share the database with users, channels, and videos. A stuck FFmpeg job competes with request traffic for connections.

### Option C: RabbitMQ
- A dedicated broker. Nest can talk to it through its microservices transport or a client library. The worker consumes from a queue declared for video processing.
- **Pros:** Strong delivery model, independent of Redis and of the application database.
- **Cons:** Heaviest local footprint for a single job type. More concepts (exchanges, acks, vhosts) than this phase uses.

**Recommendation:** Option A — `@nestjs/bullmq` is the queue NestJS 11 documents for a worker that runs in another process, and video processing needs retries without sharing the request path. Redis is one Compose service; RabbitMQ is more broker than this phase needs, and pg-boss would put FFmpeg job locking on the same PostgreSQL the API uses.

**Decision:** A (BullMQ + Redis via `@nestjs/bullmq`)

---

## TD-02: Upload of files up to 10GB

**Scope:** Backend

**Capability:** Transversal — covers: Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance; Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** The API must accept a video of up to 10GB without holding those bytes. S3's own limit is a single `PUT` of 5 GB; multipart is the documented way to upload a larger object (up to thousands of parts, each 5 MiB–5 GiB except the last part). The video row has to exist as a draft at the start of the upload, before bytes are stored. Depends on TD-06 for the draft status and on TD-07 for the bucket and key.

**Options:**

### Option A: S3 multipart with presigned part URLs
- The API creates the draft row and calls `CreateMultipartUpload`. The client uploads each part with a presigned URL straight to MinIO/S3. The API completes the multipart upload and only then enqueues processing. The file never enters the Nest process.
- **Pros:** Matches the 10GB limit (single PUT cannot). A failed part can be retried without restarting the whole file. The API stays a coordinator.
- **Cons:** The client must keep part numbers and ETags and call initiate, part-url, and complete. Abandoned uploads leave parts in the bucket until they are aborted.

### Option B: tus (resumable protocol) in front of S3
- A tus server or embedded tus handler accepts the tus protocol and writes the object to S3. The API still creates the draft when the upload is created.
- **Pros:** Standard resume/pause protocol. Clients and proxies already know tus.
- **Cons:** Extra server or protocol stack beside MinIO, which already speaks multipart. Two upload systems to test for one capability.

### Option C: Pipe the request body through the API into S3
- The client `POST`s the file to Nest. Nest streams it to S3 without buffering the whole object on disk.
- **Pros:** One request, no presign handshake. Simpler client.
- **Cons:** The HTTP connection and a Nest worker stay busy for the whole 10GB transfer. That is the impact the capability says to avoid. A dropped connection restarts the upload.

**Recommendation:** Option A — multipart presigned upload is the S3 mechanism that can hold 10GB, and the initiate call is the moment the draft row is created. The API does not carry the bytes.

**Decision:** A (S3 multipart with presigned part URLs)

---

## TD-03: Worker process, metadata, and thumbnail

**Scope:** Backend

**Capability:** Transversal — covers: Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** The C4 diagram already has a Video Worker container separate from the API. Processing starts only after the upload is complete (TD-02) by consuming the queue from TD-01. Duration and a single thumbnail frame both come from the media file. In-process work inside the HTTP server is not an option: FFmpeg would compete with requests on the same event loop and process.

**Options:**

### Option A: Second Compose service, same Nest image, worker command only
- The image installs the `ffmpeg` and `ffprobe` binaries. The API process only enqueues. A sibling service runs the Nest worker (no HTTP listen) and consumes the queue. The worker downloads the object to a temp file, reads duration with ffprobe, extracts one frame with ffmpeg, uploads the thumbnail, and updates the video row.
- **Pros:** Same config, entities, and DI as the API. Matches the C4 container split. FFmpeg cannot block request handling.
- **Cons:** The API image becomes larger because it contains FFmpeg even though the API process does not run it. Two processes share one codebase, so a worker-only crash must not take the API down (separate service does that).

### Option B: Small standalone worker, not the Nest application
- A separate image or script consumes the same queue, shells out to FFmpeg, and writes status with its own database connection.
- **Pros:** Smaller worker image. The API image does not need FFmpeg.
- **Cons:** Duplicates config, entities, and storage credentials outside the Nest modules the rest of the backend uses. Two places to change when the video row changes.

**Recommendation:** Option A — one codebase and one config module, with the worker isolated in its own Compose service so FFmpeg never runs in the API process. The choice of Node wrapper around the ffmpeg binary is an implementation detail.

**Decision:** A (Nest worker in its own Compose service, FFmpeg in the image)

---

## TD-04: Unique video URL

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Each video needs a stable identifier in its public URL that cannot collide with another video. Users and channels already use UUID primary keys. The URL is an API contract later phases will call; this phase does not build the watch page.

**Options:**

### Option A: UUID primary key is the public path segment
- The video id is a UUID, unique by primary key, and the stream, download, and resource routes use that id. No second identifier.
- **Pros:** Same id style as `users` and `channels`. Uniqueness is the primary key. No extra library or column.
- **Cons:** The public URL exposes the primary key. UUIDs are long.

### Option B: Separate public id, internal UUID stays private
- The row keeps a UUID primary key and a second unique column (for example a nanoid) used only in URLs.
- **Pros:** Public identifier can be shorter. Internal key is not the URL.
- **Cons:** Two ids to keep unique, a new generator dependency, and joins from the URL must use the public column. The capability only requires uniqueness, which the primary key already gives.

### Option C: Slug derived from the title, plus a random suffix
- The URL is a readable slug. Uniqueness is a unique constraint on the slug. Retitling either changes the URL or leaves a stale slug.
- **Pros:** Readable URLs.
- **Cons:** Title edits become a URL-stability problem. Collision handling is extra code this phase does not need. Titles are not unique.

**Recommendation:** Option A — a UUID primary key cannot collide, and it matches the identifiers the backend already exposes. A second public id or a title slug does not add uniqueness.

**Decision:** A (UUID primary key as the public path)

---

## TD-05: Streaming and download

**Scope:** Backend

**Capability:** Transversal — covers: Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** Playback must not require the client to download the whole file. S3 `GetObject` accepts a `Range` header and answers `206 Partial Content` with `Content-Range` (one range per GET). `GetObject` can also set `response-content-disposition` for a download. The C4 diagram says the client streams from object storage, not from the API. Read URLs are issued only when the video is ready (TD-06). Depends on TD-07 for the private object.

**Options:**

### Option A: Short-lived presigned GET to object storage
- The API checks that the video is ready and returns a presigned `GetObject` URL. The player sends `Range` to storage and receives 206. Download is the same URL shape with `ResponseContentDisposition` set to an attachment. Bytes do not pass through Nest.
- **Pros:** Matches the C4 stream path and the 10GB constraint. Objects stay private. One mechanism covers playback and download.
- **Cons:** The presigned host must be reachable by the client (published MinIO port locally, not the Compose DNS name). The URL expires and must be re-requested.

### Option B: API proxies the object and implements 206
- The client sends `Range` to Nest. Nest reads that range from storage and responds `206` or, for download, `Content-Disposition: attachment`.
- **Pros:** The client talks only to the API. Storage can stay on the internal network.
- **Cons:** Playback of a large file holds an API connection and copies bytes through Nest, which the storage and queue split was meant to avoid.

### Option C: Public object URL
- The bucket or prefix is world-readable. The client uses a stable URL and sends `Range` itself.
- **Pros:** No signing step. Simple player URL.
- **Cons:** Anyone with the URL can read the object, including drafts if the key is known. There is no expiry. Downloads and plays cannot be refused when status is not ready.

**Recommendation:** Option A — presigned GET keeps the object private, lets the client stream with `Range`/`206` directly from storage, and uses the same call with a content-disposition override for download.

**Decision:** A (presigned GET)

---

## TD-06: Video status lifecycle and processing failure

**Scope:** Backend

**Capability:** Transversal — covers: Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** The phase example cycle is rascunho → processando → pronto/erro. Codes stay in English, consistent with existing enums (`email_confirmation`). The queue (TD-01) is what retries a failed attempt. The row must show the user-visible outcome when retries are finished. Identifiers below are the state names, not a schema.

**Options:**

### Option A: `draft` → `processing` → `ready` or `failed`, retries inside the queue
- Initiate creates `draft`. Complete moves to `processing` and enqueues the job. The worker sets `ready` on success. On a thrown job, the queue retries with backoff. When attempts are exhausted, the worker sets `failed` and stores the last error. The object is kept.
- **Pros:** Matches the example cycle, including an explicit error. A transient ffprobe failure does not burn a 10GB upload. The client can tell draft, processing, ready, and failed apart.
- **Cons:** A permanently bad file waits through every retry before `failed` is visible. The error string has to be stored on the row.

### Option B: Same states, but the first processing error is final
- No queue retry. The first FFmpeg or storage error sets `failed` immediately.
- **Pros:** Faster feedback. Simpler worker.
- **Cons:** A one-off process crash marks a valid video as failed. The user must upload 10GB again for a transient error.

### Option C: Stay in `processing` until success
- There is no `failed` state. Errors are only logs. The client polls until `ready`.
- **Pros:** Fewer states.
- **Cons:** A broken file looks like it is still processing. The example cycle includes erro, and the client cannot stop waiting.

**Recommendation:** Option A — four states, with retries owned by the queue and `failed` only after those retries end, so a transient worker error does not discard the upload and a permanent error is visible.

**Decision:** A (draft → processing → ready or failed, retries in the queue)

---

## TD-07: Object storage access and layout

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** The product is already S3/MinIO. What is open is the client library and how video objects and thumbnails are separated. The API and the worker (TD-03) both need the same client. Presigned upload (TD-02) and presigned read (TD-05) need a signer that speaks the S3 API against the MinIO endpoint.

**Options:**

### Option A: AWS SDK v3, two buckets
- `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, endpoint pointed at MinIO locally and at S3 in production. Bucket `videos` holds the source object. Bucket `thumbnails` holds the generated image. Keys are prefixed by the video id from TD-04.
- **Pros:** Same API the production bucket will use. Presigner is the official S3 signer. Separate buckets let a thumbnail and a private video follow different access rules later without a second client.
- **Cons:** Two buckets to create on startup. The SDK is a larger dependency than a thin wrapper.

### Option B: Official `minio` JavaScript client, two buckets
- The MinIO client performs multipart and presigned operations against the local server. Production would still be S3-compatible, but the application would be written to the MinIO client's API.
- **Pros:** First-party MinIO examples. Comfortable local defaults.
- **Cons:** The client is MinIO-shaped. Production S3 is the AWS API; a second mental model appears the moment the endpoint is real S3.

### Option C: AWS SDK v3, one bucket, two prefixes
- One bucket. Video objects live under a `videos/` prefix and thumbnails under `thumbnails/`, still keyed by video id.
- **Pros:** One bucket to create. Same SDK as Option A.
- **Cons:** Video and thumbnail share one policy. A public thumbnail prefix is harder to split later than a second bucket.

**Recommendation:** Option A — the AWS SDK is the client that matches "MinIO locally, S3 in production", and two buckets keep the source video and the thumbnail separable. Key layout under the video id is an implementation detail inside that choice.

**Decision:** A (AWS SDK v3, two buckets)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Queue technology | Option A — BullMQ + Redis (`@nestjs/bullmq`) | A |
| TD-02 | Backend | Upload of files up to 10GB | Option A — S3 multipart with presigned part URLs | A |
| TD-03 | Backend | Worker process, metadata, and thumbnail | Option A — Nest worker in its own Compose service, FFmpeg in the image | A |
| TD-04 | Backend | Unique video URL | Option A — UUID primary key as the public path | A |
| TD-05 | Backend | Streaming and download | Option A — presigned GET (Range on storage; content-disposition for download) | A |
| TD-06 | Backend | Video status lifecycle and processing failure | Option A — draft → processing → ready or failed, retries in the queue | A |
| TD-07 | Backend | Object storage access and layout | Option A — AWS SDK v3, two buckets | A |
