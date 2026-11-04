---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.5
target_file: test/videos-complete.e2e-spec.ts
---

# POST /videos/:id/complete Test Plan

## Application Overview

`POST /videos/:id/complete` conclui o multipart de um vídeo `draft` do dono do canal, enfileira o job `video.processing` e grava `status` = `processing`. Quem não é o dono, quem não autentica, ou um vídeo fora de `draft` não completa.

## Test Scenarios

### 1. POST /videos/:id/complete

**Setup:** `beforeEach` trunca o banco de teste e sobe o módulo Nest com `Test.createTestingModule`. Existem dois usuários confirmados, cada um com o próprio canal. O vídeo alvo está `draft` no canal do dono, com `multipart_upload_id` preenchido.

#### 1.1. owner-completes-draft

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/:id/complete com Authorization Bearer do dono e body `{ "parts": [{ "partNumber": 1, "etag": "etag-1" }] }`
    - expect: HTTP 202
    - expect: body tem o mesmo `id` e `status` = `processing`
  2. Consultar a linha `videos` e a fila `video.processing`
    - expect: `status` = `processing`
    - expect: existe um job cujo payload é `{ "videoId": "<id>" }`

#### 1.2. missing-access-token

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/:id/complete sem header Authorization e com `parts` válidos
    - expect: HTTP 401

#### 1.3. authenticated-non-owner

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/:id/complete com Authorization Bearer do outro usuário e `parts` válidos
    - expect: HTTP 403
    - expect: a linha permanece `status` = `draft`

#### 1.4. unknown-video

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/:id/complete com Authorization Bearer do dono e um uuid que não existe
    - expect: HTTP 404
    - expect: `error` = `VIDEO_NOT_FOUND`

#### 1.5. status-not-draft

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. Gravar o vídeo alvo com `status` = `processing`
  2. POST /videos/:id/complete com Authorization Bearer do dono e `parts` válidos
    - expect: HTTP 409
    - expect: `error` = `UPLOAD_NOT_COMPLETABLE`
    - expect: `status` continua `processing`
