# 01 — Contexto

Origem: `Contexto.txt`. A execução de cada skill segue [00-Ponte-Cursor.md](00-Ponte-Cursor.md).

## O que já existe

- Backend NestJS 11 + TypeORM + PostgreSQL 17 em `nestjs-project/`, com as Fases 01 e 02 fechadas: módulos `auth/`, `users/`, `channels/`, `mail/`, `common/`, `config/`, `database/` e `swagger/` (OpenAPI).
- Cada usuário tem um canal (relação 1:1), criado no cadastro. Os vídeos da Fase 03 pertencem a um canal.
- Guard JWT global, filtro de exceções de domínio, ValidationPipe global, rate limiting, migrations versionadas e seeds.
- Infra atual no `nestjs-project/compose.yaml`: API, PostgreSQL e Mailpit.
- Frontend Next.js em `next-frontend/` (Fases 01–02), fora do escopo desta fase.

## O que esta fase constrói

O módulo de vídeo, a tabela de vídeos, o serviço de object storage, a fila de processamento e o worker de vídeo (FFmpeg). A arquitetura-alvo em `docs/diagrams/software-arch.mermaid` e no `CLAUDE.md` da raiz já prevê esses três componentes como parte da Fase 03.

## Workflow

O planejamento é um pipeline. Cada estágio é uma skill já presente em `.claude/skills/` e produz um artefato. No Cursor, "rodar a skill" = ler o `SKILL.md` e executá-lo com as ferramentas da ponte.

| Estágio | Skill | Artefato |
| --- | --- | --- |
| Pesquisar opções e decidir o caminho técnico | `research` | `docs/decisions/technical-decisions-phase-03-videos.md` |
| Consolidar o contexto da fase | `plan-context` | `docs/phases/phase-03-videos/context.md` |
| Validar inconsistências, decisões faltando e gaps | `plan-validate` | `validation.md` (veredito `clean` ou `dirty`) |
| Resolver pendências e fixar libs | `plan-resolve` | atualiza decisões e contexto; gera `library-refs.md` |
| Gerar o plano executável | `plan-build` | `phase-03-videos.md` (SIs + Technical Specs + Dependency Map + Deliverables) |
| Gerar specs de teste | `plan-test-specs` | specs de teste — só se o preflight da skill disparar |
| Implementar passo a passo | `implement` | código + `progress.md` |

Nome de arquivo exigido pelo enunciado: `technical-decisions-phase-03-videos.md`. Com esse nome, o slug do pipeline é `phase-03-videos` e a pasta da fase é `docs/phases/phase-03-videos/`. O miolo do documento (frontmatter, TD, opções, recomendação) segue `.claude/skills/research/SKILL.md`. Os documentos em `docs/decisions/` são a referência de formato já usada no repo; `technical-decisions-phase-02-auth.md` usa `related_phases` com inteiro sem zero à esquerda (`[2]`).

## Formato que a fase precisa respeitar

- A fase é a pasta `docs/phases/phase-03-videos/` com `context.md`, `validation.md`, o plano `phase-03-videos.md` e o `progress.md`, mais `library-refs.md` quando a fase fixa bibliotecas novas. Storage, fila e FFmpeg tornam esse arquivo esperado. Referência de formato: `docs/phases/phase-02-auth/`.
- O plano é organizado em Step Implementations (`SI-03.1`, `SI-03.2`, …) com Technical Specifications (Data Model, API Contracts, Authorization Matrix, Error Catalog e, por causa da fila, Events/Messages), o Dependency Map e os Deliverables.
- `validation.md` termina com status `clean` antes de implementar.
- Os subagentes em `.claude/agents/` entram quando a skill manda despachá-los (Task, conforme a ponte). Não os chame para substituir uma etapa, e não leia no lugar deles os arquivos que a skill reservou ao subagente.
- O contrato é o formato da pasta da fase. A skill continua sendo quem define o conteúdo; a ponte só troca o nome da ferramenta.

Decisões já tomadas em `docs/decisions/` não são reabertas. A skill `research` trata isso como restrição.
