---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.4
target_file: test/videos-uploads.e2e-spec.ts
---

# POST /videos/uploads Test Plan

## Application Overview

`POST /videos/uploads` abre o upload multipart para um usuário autenticado. A API grava o vídeo como `draft` no canal desse usuário e devolve as URLs pré-assinadas das partes, sem receber o arquivo.

## Test Scenarios

### 1. POST /videos/uploads

**Setup:** `beforeEach` trunca o banco de teste e sobe o módulo Nest com `Test.createTestingModule`. Um usuário confirmado com canal existe; o access token dele é o token válido dos cenários autenticados.

#### 1.1. initiate-returns-draft

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/uploads com Authorization Bearer do usuário, body `{ "contentType": "video/mp4", "sizeBytes": 1048576, "partCount": 2 }`
    - expect: HTTP 201
    - expect: body tem `status` = `draft`, `id` uuid, `uploadId` string e `parts` com 2 itens `{ partNumber, url }`
  2. Consultar a linha `videos` com esse `id`
    - expect: a linha existe
    - expect: `status` = `draft`
    - expect: `channel_id` é o canal do usuário autenticado

#### 1.2. missing-access-token

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/uploads sem header Authorization, body `{ "contentType": "video/mp4", "sizeBytes": 1048576, "partCount": 1 }`
    - expect: HTTP 401
    - expect: body tem `statusCode`, `error` e `message`

#### 1.3. upload-too-large

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/uploads autenticado com `sizeBytes` acima de 10GB e `partCount` = 1
    - expect: HTTP 413
    - expect: `error` = `UPLOAD_TOO_LARGE`

#### 1.4. missing-part-count

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. POST /videos/uploads autenticado com body `{ "contentType": "video/mp4", "sizeBytes": 1048576 }` sem `partCount`
    - expect: HTTP 400
    - expect: `error` = `VALIDATION_ERROR`
