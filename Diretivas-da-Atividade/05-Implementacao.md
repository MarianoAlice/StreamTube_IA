# 05 — Implementação e estrutura do entregável

Origem: `Implementacao.txt`. Ordem de execução: [06-OrdemSugerida.md](06-OrdemSugerida.md). Ponte: [00-Ponte-Cursor.md](00-Ponte-Cursor.md).

Tudo fica no fork do `mba-ia-greenfield-project` (este workspace, se o remote já for esse fork; confirmar antes de criar outro). Abaixo, o que o enunciado exige de novo ou alterado.

## Feature

- Upload de vídeo de até 10GB sem travar a API, com pré-cadastro do vídeo como rascunho ao iniciar.
- Processamento automático após o upload: extração de duração/metadados e geração de thumbnail.
- URL única por vídeo, sem conflito.
- Streaming funcionando (sem exigir download completo) e download do vídeo disponível.
- Ciclo de status do vídeo (rascunho → processando → pronto/erro) refletido no banco.

## Infraestrutura e qualidade

- Object storage, fila e worker sobem via Docker Compose junto com o backend.
- Migration cria a tabela de vídeos; entidade ligada ao canal.
- Testes nos níveis adequados, verdes (`npm test` e `npm run test:e2e`, dentro do container — ver [03-DefinitionOfDone.md](03-DefinitionOfDone.md)).
- Definition of Done completa: suíte verde + `npx tsc --noEmit` (código 0) + `npm run lint`.
- Git Flow: trabalho em `feature/*` a partir de `dev`, sem commit direto na `main`. O commit em si espera o pedido do usuário.

## Documentação e ferramenta

- `CLAUDE.md` da raiz e `nestjs-project/CLAUDE.md` atualizados com a seção de vídeos, coerente com o código. No Cursor esses arquivos já são a constituição (regra do workspace + regra ao editar o backend).
- A fundação de IA permanece em `.claude/skills/` e `.claude/agents/`. Esta pasta é o porte: os mesmos artefatos, as mesmas skills, as ferramentas do Cursor no lugar das do Claude Code. Não duplicar a fundação.

## Reprova automática

Itens do enunciado, todos suficientes para reprovar:

- Pular o workflow: implementar sem research, planejamento e implementação, e sem os artefatos.
- Plano sem SIs ou sem as Technical Specifications, ou `validation.md` que não fecha em `clean`.
- Passar o arquivo de 10GB pela API de forma que trave o sistema (sem estratégia de upload assíncrono/direto ao storage).
- Não ter fila, worker e storage reais subindo no Compose.
- `tsc` com erro, lint quebrado ou suíte vermelha.
- Commit direto na `main`.
- `CLAUDE.md` inconsistente com o código.
- Usar o Cursor sem esta ponte: chamar ferramentas que não existem aqui (`Skill`, `AskUserQuestion`, `Agent`, `TaskCreate`, `mcp__context7__*`) ou inventar artefatos fora do formato das skills.

## Árvore do que é novo ou alterado

Os nomes de arquivo do módulo são ilustrativos. A estrutura final é decisão do plano (`phase-03-videos.md`), com o módulo `auth/` como referência de forma.

```text
mba-ia-greenfield-project/
├── docs/
│   ├── decisions/
│   │   └── technical-decisions-phase-03-videos.md     ← research
│   └── phases/
│       └── phase-03-videos/
│           ├── context.md                             ← plan-context
│           ├── validation.md                          ← plan-validate (clean)
│           ├── library-refs.md                        ← plan-resolve
│           ├── phase-03-videos.md                     ← plan-build
│           └── progress.md                            ← implement
├── nestjs-project/
│   ├── CLAUDE.md                                      ← atualizado
│   ├── compose.yaml                                   ← storage, fila, worker
│   ├── src/
│   │   ├── videos/                                    ← módulo novo (forma: auth/)
│   │   └── database/migrations/
│   │       └── <timestamp>-CreateVideos.ts
│   └── (worker de vídeo — caminho conforme o plano)
└── CLAUDE.md                                          ← atualizado
```

Specs de teste (`plan-test-specs`) só aparecem na árvore se o preflight da skill tiver disparado. Não criar a pasta `specs/` para cumprir a árvore.
