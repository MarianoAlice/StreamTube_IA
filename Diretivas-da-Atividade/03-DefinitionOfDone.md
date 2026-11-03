# 03 — Regras e Definition of Done

Origem: `DefinitionOfDone.txt`, `CLAUDE.md` (raiz) e `nestjs-project/CLAUDE.md`. Shell e Context7: [00-Ponte-Cursor.md](00-Ponte-Cursor.md).

As regras do `CLAUDE.md` valem para esta fase. O da raiz já é regra permanente do Cursor neste workspace.

## Definition of Done

A fase só está pronta quando todos os itens abaixo passam:

1. A suíte relevante do que mudou (unit + integração + e2e).
2. A suíte completa, antes de encerrar a tarefa.
3. TypeScript limpo: `npx tsc --noEmit` com código de saída 0. Erro de compilação não fica para depois.
4. Lint: `npm run lint`.

Esses comandos rodam dentro do container `nestjs-api`, a partir de `nestjs-project`, porque `nestjs-project/CLAUDE.md` exige npm, npx, tsc e testes no container (no host, `DB_HOST` não é o serviço `db`):

```powershell
docker compose exec nestjs-api npx tsc --noEmit
docker compose exec nestjs-api npm run lint
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e
```

`npm test` já cobre `*.spec.ts` e `*.integration-spec.ts` (`testRegex` do `package.json`). `npm run test:e2e` usa `nestjs-project/test/jest-e2e.json`. Integração e e2e compartilham o banco de teste e rodam com `--runInBand`, como o `CLAUDE.md` do backend já manda. O script `test:e2e` não recebe um segundo `--runInBand` além do que o próprio script já configura; o `npm test` sim, no comando acima.

Durante o SI, a skill `implement` roda só os testes daquele SI. A suíte completa é a verificação final.

## Docker

Tudo roda em containers. Conexão entre serviços usa o nome do serviço no Compose (`db`, e os serviços novos de storage, fila e worker). Dentro de um container, `localhost` é o próprio container.

Conferir a stack depois de subir:

```powershell
docker compose ps
docker compose exec db pg_isready -U streamtube
```

Subir a infra não inclui `npm run start:dev`, salvo pedido explícito para rodar a API (`nestjs-project/CLAUDE.md`).

## Documentação de libs

Antes de implementar com qualquer biblioteca, consultar a doc oficial na versão instalada (ou na versão que o TD fixou, se o pacote ainda não estiver no manifesto). Procedimento único na seção 7 de [00-Ponte-Cursor.md](00-Ponte-Cursor.md). Context7 é o caminho quando o MCP estiver conectado. Com o namespace ausente, a consulta oficial é WebSearch + WebFetch, registrada no `library-refs.md` com `context7_id: "unavailable"` e a URL lida.

## Git

- `main`: não commitar nela.
- Branches de trabalho: `feature/*`, `bugfix/*`, `hotfix/*`, `docs/*`, saindo de `dev` e voltando para `dev`.
- Commits curtos, no "porquê".
- Criar o commit quando o usuário pedir. Não fazer push salvo pedido explícito.
- Não usar `git commit --amend` nem push force salvo as condições das regras de git do usuário.

## Testes — sufixos

| Sufixo | Papel |
| --- | --- |
| `*.spec.ts` | unitário |
| `*.integration-spec.ts` | integração com banco ou serviço real |
| `*.e2e-spec.ts` | e2e via supertest, em `nestjs-project/test/` |

O que cada camada cobre está em `.claude/skills/testing-guide-nestjs-project/SKILL.md`, carregada no início do `implement`.
