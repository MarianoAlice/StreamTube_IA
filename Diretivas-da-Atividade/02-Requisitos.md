# 02 — Requisitos

Origem: `Requisitos.txt`. Ferramentas: [00-Ponte-Cursor.md](00-Ponte-Cursor.md). Escopo e decisões em aberto: [04-Escopo-Fase3.md](04-Escopo-Fase3.md).

## 1. Decisões técnicas (research)

Rodar `.claude/skills/research/SKILL.md` sobre as decisões em aberto do escopo. Salvar em `docs/decisions/technical-decisions-phase-03-videos.md`, no formato dos documentos de decisão existentes e da estrutura de saída da skill (opções, trade-offs e recomendação por decisão). Esse documento alimenta o planejamento.

Pesquisa de opções usa a doc oficial da tecnologia candidata pelo procedimento de bibliotecas da ponte (Context7 se o namespace existir; senão WebSearch + WebFetch na versão/documentação oficial). A recomendação fica no TD; a escolha fechada (`**Decision:**`) segue o fluxo da skill `research` (o usuário revisa e decide).

## 2. Planejamento (pipeline)

Conduzir o pipeline até o plano final, na pasta `docs/phases/phase-03-videos/`:

1. `plan-context` → `context.md`
2. `plan-validate` → `validation.md` (precisa fechar em `clean`)
3. `plan-resolve` → resolve as pendências e gera `library-refs.md` (libs confirmadas pelo procedimento da ponte, seção 7)
4. `plan-build` → `phase-03-videos.md`, com Step Implementations (`SI-03.x`), Technical Specifications (incluindo Events/Messages para a fila), Dependency Map e Deliverables

Revisar cada saída. O `validation.md` aponta decisões faltando e gaps de dependência: iterar validate e resolve até `clean`. O `plan-build` recusa seguir quando o status não é `clean` (mensagem da própria skill).

`plan-test-specs` permanece o estágio opcional descrito em `Contexto.txt` e em `plan-pipeline/SKILL.md`. Rodar só quando o preflight dessa skill disparar (plano com `test_specs_aware: true` e algum SI com `**Test Specs:**`). Fase sem UI de servidor pode encerrar o planejamento no `plan-build`; isso é o comportamento da skill, não um atalho.

## 3. Implementação (implement)

Implementar pela skill `.claude/skills/implement/SKILL.md`, SI a SI, rodando os testes de cada SI e só avançando com a suíte daquele SI verde. Inclui:

- O módulo de vídeos no backend, nas convenções do projeto (separação de camadas, repository pattern, fila/eventos, transações). Referência de forma: módulo `auth/`. A estrutura concreta de arquivos é decisão do plano, não do enunciado. Ao implementar, carregar `nestjs-best-practices` e `typeorm` quando o SI criar módulo, entidade, migration ou query, e `testing-guide-nestjs-project` para o que testar em cada camada.
- A infraestrutura nova no `compose.yaml`: object storage, fila e worker, subindo com a stack do backend.
- A migration que cria a tabela de vídeos.
- Testes nos níveis adequados (unit, integração com banco/serviços reais, e2e), conforme as skills de teste. Não mockar o que a infra do Compose permite exercer de verdade.
- O `progress.md` da fase (status + testes por SI), no formato que `implement/SKILL.md` grava. A Fase 02 (`docs/phases/phase-02-auth/progress.md`) é a referência de pasta, como diz o enunciado.

Ao final, a Definition of Done do `CLAUDE.md` passa inteira. Comandos em [03-DefinitionOfDone.md](03-DefinitionOfDone.md).

## 4. Atualização da documentação de IA

Atualizar o `CLAUDE.md` da raiz e o `nestjs-project/CLAUDE.md`. O Cursor já aplica o da raiz como regra do workspace e anexa o do `nestjs-project/` ao trabalhar naquele diretório. Os dois precisam refletir o código depois da fase: módulo de vídeos, endpoints, fila/worker e storage. Documentação que cite arquivo ou comportamento inexistente reprova. Não criar um arquivo paralelo para "substituir" o `CLAUDE.md`.

## Critérios de aceite

Todos obrigatórios. Lista única de avaliação, copiada do enunciado.

### Decisões e planejamento

- `technical-decisions-phase-03-videos.md` com as decisões em aberto resolvidas e justificadas (fila, estratégia de upload, streaming, processamento/thumbnail, ciclo de status).
- Pasta `docs/phases/phase-03-videos/` com `context.md`, `validation.md` (status `clean`), o plano `phase-03-videos.md`, o `progress.md` e o `library-refs.md` (libs novas — esperado nesta fase).
- O plano no formato do projeto: SIs `SI-03.x`, Technical Specifications (Data Model, API Contracts, Authorization Matrix, Error Catalog, Events/Messages), Dependency Map e Deliverables.

O enunciado em `Requisitos.txt` termina nessa lista. Implementação, infra, testes, Git e `CLAUDE.md` estão em [05-Implementacao.md](05-Implementacao.md) e na Definition of Done; continuam obrigatórios.
