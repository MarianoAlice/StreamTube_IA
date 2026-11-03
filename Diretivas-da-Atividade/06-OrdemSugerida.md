# 06 — Ordem de execução

Origem: `OrdemSugerida.txt`. Cada linha "rodar a skill" significa ler o `SKILL.md` citado e executar com [00-Ponte-Cursor.md](00-Ponte-Cursor.md). Não antecipar código de produção neste setup.

## 1. Setup

- Confirmar se o remote deste workspace já é o fork público do `mba-ia-greenfield-project`. Se for, seguir nele. Se não for, o enunciado pede o fork antes do resto.
- Branch de trabalho: `feature/*` criada a partir de `dev`. Não commitar em `main`.
- Subir o backend a partir de `nestjs-project`:

```powershell
docker compose up -d
docker compose ps
docker compose exec db pg_isready -U streamtube
docker compose exec nestjs-api npm install
```

Migrations: o comando já usado pelo projeto está no `CLAUDE.md` / scripts do `nestjs-project` (não inventar um runner novo). Rodar dentro de `nestjs-api`.

- Confirmar a suíte atual verde (Fases 01 e 02), dentro do container: `npm test -- --runInBand` e `npm run test:e2e`.
- A fundação já está portada por esta pasta. Não há passo extra de copiar skills. Ler a ponte uma vez nesta sessão.

Não subir `npm run start:dev` como parte do setup.

## 2. Research

Abrir `.claude/skills/research/SKILL.md` e fechar as decisões em aberto de [04-Escopo-Fase3.md](04-Escopo-Fase3.md): fila, estratégia de upload, streaming, processamento/thumbnail, ciclo de status. Object storage já é dado (S3/MinIO). Artefato: `docs/decisions/technical-decisions-phase-03-videos.md`.

Entrada da skill, em phase mode: Fase 03, escopo = capabilities em `docs/project-plan.md`. O agente despacha `plan-reader` (Task) se for seguir o caminho da skill para não carregar o plano inteiro; o arquivo de decisões sai com um TD por decisão estratégica, cada um ligado a um bullet de capacidade.

## 3. Planejamento

Uma etapa por vez. A skill aborta com o próximo comando se o artefato anterior não existir; obedecer o abort.

1. `.claude/skills/plan-pipeline/SKILL.md` (convenções compartilhadas) e `.claude/skills/plan-context/SKILL.md` → `docs/phases/phase-03-videos/context.md`.
   Despachar em paralelo, via Task, os leitores que a skill listar para phase mode (`plan-reader`, `decisions-reader`, `decisions-detail-reader`, `decisions-correlator`, `phases-reader`, e `inventory-digest-reader` só se o arquivo de inventário existir). Passar `slug` `phase-03-videos` e `mode=phase` no prompt.
2. `.claude/skills/plan-validate/SKILL.md` → `validation.md`.
3. Se `status: dirty`: `.claude/skills/plan-resolve/SKILL.md`. AskQuestion para cada issue que a skill manda perguntar. Libs novas pelo procedimento da ponte, seção 7 → `library-refs.md`.
4. `plan-validate` de novo. Repetir 3 e 4 até `status: clean`.
5. `.claude/skills/plan-build/SKILL.md` (e `phase-a.md` / `phase-b.md` quando a skill chegar neles) → `phase-03-videos.md`. A pausa AskQuestion entre a parte A e a parte B é a da skill; não pular.
6. `.claude/skills/plan-test-specs/SKILL.md` somente se o preflight dela aceitar o plano.

Revisar o plano contra [02-Requisitos.md](02-Requisitos.md) (SIs `SI-03.x`, as cinco Technical Specifications, Dependency Map, Deliverables) antes de implementar.

## 4. Implementação

Abrir `.claude/skills/implement/SKILL.md`. Argumento: fase 03 / slug `phase-03-videos` → `docs/phases/phase-03-videos/phase-03-videos.md`.

- Carregar `testing-guide-nestjs-project`.
- TodoWrite com um item por SI.
- Criar ou retomar `progress.md` no formato da skill.
- Por SI: carregar `nestjs-best-practices` e/ou `typeorm` conforme o artefato; implementar; rodar só os testes do SI dentro de `nestjs-api`; Task `generalPurpose` para o relatório da suíte do SI, como a skill pede; atualizar `progress.md` e o todo.
- Modo padrão da skill: pausa entre SIs. Modo contínuo só se o usuário pedir para executar tudo sem pausa.

Infra no Compose, migration e módulo entram nos SIs que o plano definir, não numa ordem paralela inventada aqui.

## 5. Fechamento

- Definition of Done em [03-DefinitionOfDone.md](03-DefinitionOfDone.md): suíte completa, `tsc`, lint, todos dentro do container.
- Atualizar `CLAUDE.md` (raiz) e `nestjs-project/CLAUDE.md` com o que o código passou a ter: módulo, endpoints, fila, worker, storage, nomes de serviço no Compose.
- Conferir os critérios de [02-Requisitos.md](02-Requisitos.md) e a lista de reprova de [05-Implementacao.md](05-Implementacao.md), item a item, antes de qualquer push. Push só se o usuário pedir.
