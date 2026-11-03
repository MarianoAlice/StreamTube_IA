# Ponte de ferramentas — Claude Code para Cursor

Origem: enunciado (`Contexto.txt`, trecho "Para quem usa outra ferramenta") e o pedido de adaptar a fundação para as ferramentas já disponíveis no Cursor. As skills e os subagentes de leitura **não são reescritos**. Eles já estão no repositório e já aparecem nesta sessão.

- Skills: `.claude/skills/<nome>/SKILL.md` (também listadas como agent skills da sessão).
- Subagentes de leitura: `.claude/agents/*.md`, já registrados como `subagent_type` do Cursor.

Portar a fundação, neste workspace, significa executar essas skills com a tabela abaixo. Não copie as skills para `.cursor/skills`. Não crie `AGENTS.md` nem `.cursor/rules` no lugar do `CLAUDE.md`.

O texto canônico de abort da skill continua igual (`Run /research phase NN first`, `Run /plan-validate NN`, etc.). Nesta sessão, cada `/nome` significa: abrir o `SKILL.md` correspondente e executá-lo. Não reescreva a mensagem de abort.

## 1. Disparar uma skill

Não existe ferramenta `Skill` nem comando de barra. Quando uma etapa manda rodar `/research`, `/plan-context`, `/plan-validate`, `/plan-resolve`, `/plan-build`, `/plan-test-specs` ou `/implement`:

1. Leia o `SKILL.md` inteiro com a ferramenta Read, no momento em que a etapa começa. O frontmatter `disable-model-invocation: true` só impede invocação automática; a diretiva da etapa é a invocação.
2. Leia também os arquivos que a própria skill manda abrir (`plan-pipeline/SKILL.md`, `plan-build/phase-a.md`, `phase-b.md`, `phase-c.md`, rules dentro da skill).
3. Siga o procedimento da skill. O formato do artefato é o da skill, não um resumo destas diretivas.
4. Skills de apoio, quando a skill da etapa mandar carregá-las: `testing-guide-nestjs-project`, `nestjs-best-practices`, `typeorm`. Fase 03, pelo enunciado, não mexe em `next-frontend/`; não carregue skills de frontend, Figma ou Playwright salvo um SI do plano (ainda não escrito) citar isso — e esse SI só existe se o plano do projeto o exigir.

| Etapa do enunciado | Arquivo |
| --- | --- |
| research | `.claude/skills/research/SKILL.md` |
| plan-context | `.claude/skills/plan-pipeline/SKILL.md` e `.claude/skills/plan-context/SKILL.md` |
| plan-validate | `.claude/skills/plan-validate/SKILL.md` |
| plan-resolve | `.claude/skills/plan-resolve/SKILL.md` |
| plan-build | `.claude/skills/plan-build/SKILL.md` e os companions que ele citar |
| plan-test-specs | `.claude/skills/plan-test-specs/SKILL.md` — só se o preflight dessa skill disparar |
| implement | `.claude/skills/implement/SKILL.md` |

`/decide` e `/screen-inventory` só entram se a skill da etapa apontar para eles. A Fase 03 do enunciado não pede inventário de telas.

## 2. Subagentes

Onde a skill diz `Agent` com `subagent_type`, use a ferramenta Task do namespace `cursor`.

1. Antes da primeira chamada da sessão, leia o schema: GetDynamicTools com `namespace: "cursor"` e `toolName: "Task"`.
2. Invoque com CallDynamicTool: `namespace: "cursor"`, `toolName: "Task"`.
3. `subagent_type` usa o identificador do Cursor, não o texto do Claude Code.

| Texto na skill | `subagent_type` no Cursor |
| --- | --- |
| `decisions-reader` | `decisions-reader` |
| `decisions-detail-reader` | `decisions-detail-reader` |
| `decisions-correlator` | `decisions-correlator` |
| `phases-reader` | `phases-reader` |
| `plan-reader` | `plan-reader` |
| `inventory-digest-reader` | `inventory-digest-reader` |
| `Explore` | `explore` |
| `general-purpose` | `generalPurpose` |

O subagente não vê o chat do agente principal. O campo `prompt` precisa repetir o contrato de entrada do arquivo em `.claude/agents/<nome>.md` (`mode`, `identifier` ou `NN`, `slug`) e o contrato de saída ("devolva só o bloco que o agente define"). Várias leituras em paralelo = várias chamadas Task na mesma mensagem.

Não despache esses leitores por conta própria. Quem manda despachar é a skill (`plan-context`, `plan-validate`, `plan-resolve`). `plan-build`, no próprio `SKILL.md`, lê `context.md` e `library-refs.md` na thread principal e não despacha Agent no caminho padrão.

`Contexto.txt` diz que os subagentes de leitura não são invocados diretamente: isso vale para não contorná-los nem chamá-los fora da skill. Quando a skill manda despachar, a chamada Task é o despacho.

Não passe `model` salvo pedido explícito. Não use `environment: "cloud"`.

Verificação de Filter Trace (exigida por `plan-context` e `plan-resolve`) continua na thread principal, com o texto que o subagente devolveu.

## 3. Perguntas ao usuário

Onde a skill diz `AskUserQuestion`, use a ferramenta AskQuestion.

- Uma leva de até 4 perguntas da skill = um call com array `questions`.
- Cada pergunta: `id`, `prompt`, `options` (`id` + `label`). `allow_multiple: true` quando a skill pede multi-choice.
- `plan-resolve` exige perguntar IC, AMB, DG, ICC e OQ mesmo quando a resposta parece óbvia. O usuário decide; o agente transcreve.
- Quando a skill diz que a pergunta é fechada e a justificativa está no rótulo da opção, use esses rótulos. Se a resposta vier em "Other" e não mapear para uma opção da skill, pergunte de novo com as mesmas opções. Não invente a decisão para fechar o issue.

## 4. Lista de SIs durante o implement

`implement/SKILL.md` manda `TaskCreate` (um item por SI) e atualizar o status nas bordas do loop. No Cursor isso é TodoWrite, no namespace `cursor` (leia o schema com GetDynamicTools antes de chamar).

- Um todo por SI, `id` = o identificador do SI (`SI-03.1`, …), `content` = título do SI, `status` `pending` | `in_progress` | `completed`.
- Crie a lista inteira num call com `merge: false` antes do primeiro SI. Nas transições, `merge: true`.
- O arquivo `progress.md` continua sendo a fonte de verdade entre sessões, no formato da skill. O TodoWrite é a lista da sessão.
- O schema atual exige pelo menos dois itens por call. Se o plano tiver um único SI, o segundo item é a verificação final que a própria skill `implement` já descreve depois do loop (suíte, `tsc`, lint).

## 5. Arquivos e busca

| Na skill | No Cursor |
| --- | --- |
| Read | Read |
| Grep | Grep |
| Glob | Glob |
| Edit | StrReplace |
| Write | Write |
| Bash | Shell |

Leitura curta e com limite de linhas, como a skill pede (frontmatter primeiro, seção entre dois headings). Grep para achar o heading e o heading irmão; Read no intervalo. Não carregue `docs/project-plan.md` inteiro na thread principal quando a skill manda usar `plan-reader`.

## 6. Shell neste workspace

O shell da sessão é PowerShell no Windows. Traduza o mecanismo, sem mudar a regra da skill.

- `mkdir -p` → `New-Item -ItemType Directory -Force`.
- Encadeamento: prefira comandos separados ou `;` com checagem de `$LASTEXITCODE`. Não dependa de `&&`.
- `sources_mtime`: a skill pede o mtime real do arquivo em ISO-8601 (`stat -c '%y'` no texto da skill). Aqui:

```powershell
(Get-Item -LiteralPath 'docs/decisions/technical-decisions-phase-03-videos.md').LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss.fffffffK')
```

Não invente o timestamp. Não reaproveite o mtime gravado num artefato anterior se a skill manda medir de novo.

- Processo que não termina (`start:dev`, watch): Shell com `block_until_ms: 0`. `nestjs-project/CLAUDE.md` manda subir a infra sem subir o servidor Nest, salvo pedido explícito para rodar a aplicação.
- Diretório do Compose e dos comandos npm do backend: `nestjs-project`. Use `working_directory` do Shell.

Comandos de teste, lint e `tsc` rodam **dentro** do container `nestjs-api`, como `nestjs-project/CLAUDE.md` já exige:

```powershell
docker compose exec nestjs-api npx tsc --noEmit
docker compose exec nestjs-api npm run lint
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e
```

Host dos serviços, dentro da rede do Compose: nome do serviço (`db`, e os nomes que a fase criar para storage, fila e worker). `localhost` dentro do container é o próprio container. Detalhe em `03-DefinitionOfDone.md`.

Durante um SI, rode só os testes que o SI lista. A suíte completa entra na verificação final da skill `implement` e na Definition of Done.

Testes barulhentos: a skill manda um subagente `general-purpose`. No Cursor, Task com `subagent_type: "generalPurpose"`, e o `prompt` pede um relatório curto com falha, arquivo e causa. Exploração de convenção local do módulo (layout, nomes) usa `explore`, só quando a skill de best-practice carregada não cobre o ponto.

## 7. Documentação de bibliotecas (Context7)

`CLAUDE.md` (raiz) e `plan-resolve` mandam consultar a documentação oficial via Context7, na versão instalada ou na versão fixada pela decisão.

Estado desta sessão, medido ao escrever esta ponte: GetDynamicTools com padrão `context7` não devolve namespace; `.mcp.json` só declara o servidor `postgres`. Não há ferramenta `mcp__context7__resolve-library-id` nem `mcp__context7__query-docs`.

Em toda etapa que precise de doc de lib:

1. Rode de novo GetDynamicTools com padrão `context7`. Se aparecerem `resolve-library-id` e `query-docs`, leia o schema e chame os dois na ordem da skill (resolver o id, depois buscar a doc, buscas em paralelo). Grave `context7_id` com o id devolvido. Isso é o caminho do `plan-resolve`.
2. Se o namespace continuar ausente, não invente o id nem escreva na seção da lib que a fonte foi Context7. Não pare a fase inteira por isso: as ferramentas disponíveis para a mesma obrigação (doc oficial da versão certa) são:
   - Read do manifesto do subprojeto (`nestjs-project/package.json` e o lockfile) para a versão instalada. Se a lib ainda não está instalada, a versão é a que o TD / a recomendação da skill fixar, e o `library-refs.md` diz isso.
   - WebSearch e WebFetch do namespace `cursor` (leia o schema com GetDynamicTools antes). Alvo: documentação oficial daquela versão (site do projeto, README do release, docs de API).
3. O `library-refs.md` mantém o formato da skill (`libs`, `version`, `context7_id`, `fetched_at`, `sources_mtime`, seção `### {lib}`). Com Context7 ausente:
   - `context7_id: "unavailable"` — valor literal, para não fingir um id.
   - No corpo, `**Source:**` com a URL oficial lida via WebFetch e a versão.
   - A frase pronta dos exemplos antigos ("Pulled via Context7") só entra se o passo 1 realmente rodou.
4. Se no meio da fase o Context7 passar a responder, o próximo `/plan-resolve` refaz o cache pelo caminho da skill. Até lá, `plan-build` só exige o heading `### {lib}` e o texto da API usada pelos SIs; não exige que o id seja um id Context7.
5. Falha de rede no WebFetch segue a política da skill: as edições de decisão já feitas permanecem; a mensagem pede para repetir o resolve quando a busca voltar, em vez de preencher a API de memória.

Memória de treino não conta como consulta. Se a página oficial não cobrir a versão do manifesto, registre a divergência no `library-refs.md` antes de seguir, como o `CLAUDE.md` pede.

## 8. O que não entra nesta fase

- Não implementar antes de `validation.md` com `status: clean`.
- Não tratar `next-frontend/` como escopo. `Contexto.txt` o deixa fora.
- Não escolher o produto de object storage. O enunciado já fixa S3 compatível, MinIO no Docker local. A decisão aberta de stack é a fila; o resto (upload, streaming, worker, ciclo de status) também se pesquisa e se registra, sem trocar o storage.
- Não commitar na `main`. Branch `feature/*` a partir de `dev`. Commit só quando o usuário pedir, mensagem curta no "porquê". Não fazer push salvo pedido explícito.
- Não editar `docs/project-plan.md` durante o resolve. A skill aborta esse caso com o comando de rerodar o pipeline.

## 9. Rastreio

Cada TD aponta para um bullet de capacidade da Fase 03 (`docs/project-plan.md` ou `04-Escopo-Fase3.md`, que copia esse escopo). Cada SI aponta para TD, contrato ou capability já escrita no plano. `progress.md` só registra SI que existe no plano e teste que foi executado. `CLAUDE.md` só descreve módulo, endpoint, fila, worker e storage que o código passou a ter.
