# 07 — Dicas

Origem: `Dicas.txt`, aplicadas ao Cursor via [00-Ponte-Cursor.md](00-Ponte-Cursor.md).

A Fase 03 é grande; o plano é o que segura. Decisões com trade-off registrado e SIs fatiados (contratos e eventos da fila escritos nas Technical Specifications) deixam a implementação verificável. O tempo vai no `research` e no ciclo validate → resolve até `clean`.

Upload de 10GB é decisão de arquitetura. A pesquisa vem antes do código. O caminho que o enunciado marca como reprovação é fazer o arquivo inteiro atravessar a API e segurar o processo. A estratégia concreta (pré-assinada, multipart ou outra) fica no TD, depois de opções e trade-offs.

Infra real, exercitada pelos testes. Fila, worker e storage sobem no `compose.yaml` e os testes de integração/e2e usam esses serviços. Mock só entra onde a skill de teste do `nestjs-project` manda mockar (unitário). Integração com banco ou storage real usa `*.integration-spec.ts`.

Continuidade com o que as Fases 01 e 02 já fecharam: guard JWT global, filtro de exceção de domínio, ValidationPipe, repository, migrations versionadas, rules em `.claude/rules/`. O módulo novo segue a forma de `auth/`. A fase soma; não reescreve auth, users, channels nem o frontend.

A ferramenta desta entrega é o Cursor. O encadeamento continua research → planejamento → implementação, com os artefatos da pasta `docs/phases/phase-03-videos/`. As skills em `.claude/skills/` são o procedimento; a ponte só diz qual chamada do Cursor corresponde a `Skill`, `Agent`, `AskUserQuestion`, `TaskCreate` e Context7.

Quando a skill abortar com `Run /…`, parar e executar esse estágio. Não "adiantar" o SI para destravar o plano. Quando faltar uma decisão, ela volta para o documento de decisões pelo `plan-resolve` (ou para um novo `research` se a skill classificar como `MD-N` em phase mode). Não preencher `**Decision:**` em silêncio.
