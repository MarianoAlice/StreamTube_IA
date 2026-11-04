---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.7
target_file: test/videos-read.e2e-spec.ts
---

# GET /videos/:id Test Plan

## Application Overview

`GET /videos/:id` devolve o identificador público, o `status` e `duration_seconds` sem access token. `GET /videos/:id/playback` e `GET /videos/:id/download` devolvem a URL pré-assinada só quando `status` é `ready`; nos demais estados respondem `VIDEO_NOT_READY`. A API não envia os bytes do arquivo.

## Test Scenarios

### 1. GET /videos/:id

**Setup:** `beforeEach` trunca o banco de teste e sobe o módulo Nest com `Test.createTestingModule`. Um vídeo existe com `id` conhecido, `status` = `ready` e `duration_seconds` preenchido.

#### 1.1. anonymous-reads-video

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. GET /videos/:id sem header Authorization
    - expect: HTTP 200
    - expect: body tem `id`, `status` e `duration_seconds` iguais à linha gravada

#### 1.2. unknown-video

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. GET /videos/:id sem Authorization, com um uuid que não existe
    - expect: HTTP 404
    - expect: `error` = `VIDEO_NOT_FOUND`

### 2. GET /videos/:id/playback

**Setup:** o mesmo módulo. Um vídeo `ready` e outro com `status` = `processing` existem.

#### 2.1. playback-when-ready

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. GET /videos/:id/playback sem Authorization, para o vídeo `ready`
    - expect: HTTP 200
    - expect: body tem `url` string não vazia
    - expect: o body não contém os bytes do vídeo

#### 2.2. playback-when-not-ready

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. GET /videos/:id/playback sem Authorization, para o vídeo `processing`
    - expect: HTTP 409
    - expect: `error` = `VIDEO_NOT_READY`

### 3. GET /videos/:id/download

**Setup:** o mesmo módulo. Um vídeo `ready` e outro com `status` = `processing` existem.

#### 3.1. download-when-ready

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. GET /videos/:id/download sem Authorization, para o vídeo `ready`
    - expect: HTTP 200
    - expect: body tem `url` string não vazia

#### 3.2. download-while-processing

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-04T14:41:47Z

**Steps:**
  1. GET /videos/:id/download sem Authorization, para o vídeo `processing`
    - expect: HTTP 409
    - expect: `error` = `VIDEO_NOT_READY`
