# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema num chat; o agent
consulta os chamados dele, busca na central de ajuda, abre/atualiza chamados (sempre com confirmação) e
chama um analista quando precisa. Analistas usam um console para assumir a conversa (agent pausado),
devolvê-la ao agent ou encerrá-la.

> Decisões de arquitetura detalhadas: [docs/adr/0001-arquitetura-nexo-assist.md](docs/adr/0001-arquitetura-nexo-assist.md)

## Acesso público

**https://desafio.cap.leonardo-reis.com/login**

### Como entrar

Há **uma única tela de login** para todos. Não existe escolha de perfil: **o e-mail define quem você é** e
para onde vai depois de entrar.

- **Funcionário da empresa** → cai no **chat de atendimento** (`/chat`), onde conversa com o agent.
- **Analista do suporte (service desk)** → cai no **console do analista** (`/console`), onde vê a fila,
  assume conversas e trata chamados.

**Senha:** qualquer uma (regra do protótipo; o campo só precisa estar preenchido). Só são aceitos os e-mails
abaixo, todos `@nexo.com.br`.

### Contas

| Perfil                    | Nome           | E-mail                       | Área / equipe                      |
| ------------------------- | -------------- | ---------------------------- | ---------------------------------- |
| **Suporte** (analista)    | Rafael Lima    | `rafael.lima@nexo.com.br`    | Suporte N2                         |
| **Suporte** (analista)    | Juliana Costa  | `juliana.costa@nexo.com.br`  | Suporte N1                         |
| **Empresa** (funcionário) | Ana Souza      | `ana.souza@nexo.com.br`      | Financeiro — cenários do protótipo |
| **Empresa** (funcionário) | Carla Mendes   | `carla.mendes@nexo.com.br`   | Comercial                          |
| **Empresa** (funcionário) | Bruno Tavares  | `bruno.tavares@nexo.com.br`  | Marketing                          |
| **Empresa** (funcionário) | Diego Ramos    | `diego.ramos@nexo.com.br`    | Engenharia                         |
| **Empresa** (funcionário) | Elisa Prado    | `elisa.prado@nexo.com.br`    | Operações                          |
| **Empresa** (funcionário) | Fábio Nunes    | `fabio.nunes@nexo.com.br`    | Jurídico                           |
| **Empresa** (funcionário) | Gabriela Rocha | `gabriela.rocha@nexo.com.br` | Compras                            |

Cada funcionário vê só os próprios chamados e conversas; os analistas veem as conversas de todos.

### Para ver os dois lados ao mesmo tempo

O login vale para o navegador inteiro (um cookie por navegador). Entrar com outro e-mail na mesma janela
troca a sessão. Por isso:

1. Numa janela normal, entre como **funcionário** (ex.: `ana.souza@nexo.com.br`) e converse com o agent.
2. Numa **janela anônima** (ou outro navegador), entre como **suporte** (ex.: `rafael.lima@nexo.com.br`).
3. Quando o funcionário pede um analista ou o agent abre um chamado, a conversa aparece em **"Para você"** no
   console; o analista pode **Assumir atendimento**, responder e mudar o status dos chamados.

Para trocar de usuário na mesma janela, use **Sair** (menu lateral no chat, ícone de saída no console).

O uso do LLM tem um teto diário nesta demonstração; ao atingi-lo, o agent avisa e as ações sem LLM
(seleção de chamado, confirmação, transferência, console) continuam funcionando.

## Como rodar

Requisitos: Node 22+ e pnpm 10.

```bash
pnpm install
cp .env.example .env          # preencha FAL_KEY (ou ANTHROPIC_API_KEY) e TICKETS_SERVICE_TOKEN (openssl rand -hex 32)
pnpm seed                     # cria chamados, usuários e conversas de exemplo
pnpm dev                      # web em http://localhost:3000 + serviço de chamados em :4001
```

Login local igual ao público: mesmas [contas](#contas), qualquer senha, em http://localhost:3000/login.
Localmente o `pnpm seed` também cria conversas de exemplo no console (Carla e Bruno aguardando analista).

Outros comandos: `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm build && pnpm start`.

Sem chave de LLM a aplicação funciona nas rotas determinísticas (seleção de chamado, confirmação,
transferência, console) e responde com transparência quando a mensagem precisa do modelo.

### Roteiro rápido de teste

1. Entre como **Ana** → "Qual o status do meu chamado?" → escolha o **INC-20311** (vencido) → "Falar com um analista".
2. Em outra janela anônima, entre como **Rafael** → a conversa aparece em "Para você" com o resumo do caso →
   **Assumir atendimento** → responda → **Devolver ao agent**.
3. Como Ana: "Meu notebook não conecta na VPN, erro 809. Uso Windows 11" → responda quem é afetado e se há
   reunião hoje → confira o rascunho (prioridade calculada) → **Confirmar**.
4. Em qualquer resposta do agent, clique em **Ver por quê** para ver o que ele entendeu, a ação, a confiança,
   as regras aplicadas, cada ferramenta (duração, tentativas, falhas) e os guardrails.

## Deploy (CapRover)

CI/CD no GitHub Actions: a cada push na `main`, o workflow **Deploy** roda o CI (formatação, tipos, lint e
testes), monta a imagem Docker, publica no GHCR e manda o CapRover puxar a imagem pronta — nada é compilado
no servidor. Pull requests e outros branches rodam só o **CI**.

A imagem ([Dockerfile](Dockerfile)) sobe os dois processos num container ([docker/start.mjs](docker/start.mjs)):
o app web na porta 3000 e o serviço de chamados em `127.0.0.1:4001`, acessível só de dentro do container. Se
um dos dois cair, o container reinicia.

Configuração no CapRover (app `desafio`):

1. **Container HTTP Port**: `3000`; HTTPS habilitado.
2. **Persistent directory**: `/data` (bancos SQLite de conversas e chamados — sobrevivem a deploys).
3. **Variáveis de ambiente**: `TICKETS_SERVICE_TOKEN` (`openssl rand -hex 32`), `FAL_KEY`, `LLM_PROVIDER=fal` e
   `DEMO_DAILY_LLM_BUDGET` (ex.: `300`, protege o crédito num link público) e, se quiser fechar o acesso,
   `DEMO_PASSWORD`. Caminhos de banco e portas
   internas já vêm da imagem — não defina `APP_DB_PATH`, `TICKETS_DB_PATH` nem `TICKETS_SERVICE_URL`.
4. Se o pacote no GHCR for privado, cadastre o registry `ghcr.io` no CapRover (usuário do GitHub + token
   com `read:packages`).

Secrets do repositório no GitHub: `CAPROVER_SERVER` (URL do painel), `CAPROVER_APP` (`desafio`) e
`CAPROVER_APP_TOKEN` (aba _Deployment_ do app no CapRover → _App Token_).

## Arquitetura

```
apps/web            Next.js 16 — UI + BFF (route handlers) + runtime do agent (Mastra)
  src/components    telas do protótipo (componentes de apresentação + containers)
  src/server        só servidor: auth, db (SQLite), agent, tickets-client, kb, sla, console
services/tickets    "sistema legado" de chamados — processo separado (Hono + SQLite), instável de propósito
packages/contracts  schemas zod + tipos compartilhados (única fonte de verdade dos contratos)
design/             protótipo exportado (nexo.pen.json + screenshots) usado como referência visual
```

```
 Navegador ──HTTP/SSE──▶ Next route handlers ──▶ runEmployeeTurn ──▶ Mastra Agent ──▶ Claude
                              │ sessão + papel         │  guardrails       │ tools (fecham sobre a sessão)
                              ▼                        ▼                   ▼
                         SQLite (app.db)        TicketsClient ──HTTP──▶ services/tickets (SQLite)
                         conversas, mensagens,  retry + backoff +        token de serviço,
                         trace, rascunhos       idempotência + breaker   filtro por dono
```

- **Interface ↔ agent ↔ serviços** separados: a UI só fala com `/api/*`; o agent nunca acessa o banco de
  chamados direto, só pelo cliente HTTP; o serviço de chamados é outro processo.
- **Persistência**: conversas, mensagens (com cards e trace), rascunhos e o estado de cada conversa
  (`agent` / `waiting_human` / `human` / `closed`) ficam em SQLite e sobrevivem a reinício. Ao entrar, o
  funcionário retoma a última conversa aberta.
- **Tempo real**: `POST /api/chat` responde em Server-Sent Events — os chips de ação aparecem conforme cada
  ferramenta termina, e o texto chega em streaming. O console atualiza por polling (3 s).

## Como o agent decide

**"O LLM decide, o código garante."** A cada mensagem:

1. **Pré-checagens em código** — sessão e dono da conversa; se a conversa está com um analista, a mensagem é
   gravada e o agent **não responde**; limite de 30 mensagens; rate limit; orçamento diário de LLM.
2. **Rotas determinísticas (sem LLM, custo zero)** para o que não é ambíguo: clique num chamado da lista,
   botões _Confirmar/Cancelar_ do rascunho, "sim, pode criar" com rascunho pendente, pedido explícito de
   analista. Ficam marcadas no trace como `regras (sem LLM)`.
3. **Agent Mastra** para o resto, com ferramentas: `buscar_central_ajuda`, `listar_meus_chamados`,
   `consultar_chamado`, `oferecer_opcoes`, `preparar_rascunho`, `confirmar_rascunho`,
   `transferir_para_analista`. Todas fecham sobre o funcionário da sessão — o modelo nunca escolhe de
   quem são os chamados. A resposta vem com uma **decisão estruturada**: intenção, o que entendeu, ação,
   confiança (0–1), justificativa e regras aplicadas.
4. **Pós-checagens em código** — confiança < 55% → transfere para um analista (motivo "agent sem segurança");
   chamado crítico confirmado → transfere; transferência aplica o estado, avisa o legado e leva um resumo.

Regras do Anexo A que **não dependem do modelo obedecer**:

| Regra                                             | Onde é garantida                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Rascunho antes de criar; só grava com confirmação | `confirmar_rascunho` bloqueia sem confirmação explícita na mensagem atual; botões chamam rota sem LLM                  |
| Sem duplicidade / reabrir até 7 dias              | `findDuplicate` converte "create" em "update" ou "reopen" antes de montar o rascunho                                   |
| Prioridade = impacto × urgência                   | o modelo informa sinais (afetados, impede trabalho, compromisso hoje, alternativa); `classifyPriority` aplica a tabela |
| Prazos em horas/dias úteis e "vencido"            | `server/sla` (seg–sex, 8h–18h, Brasília; crítica 1 h corrida)                                                          |
| Privacidade                                       | identidade só da sessão; serviço de chamados filtra por `X-Requester-Id` e responde 404 para chamado alheio            |
| Agent pausado com analista                        | máquina de estados da conversa (`agentMayRespond`)                                                                     |

### Transparência

Acima de cada resposta aparecem as ações executadas ("consultou seus chamados", "classificou a prioridade").
Em **Ver por quê** (no chat e no console) o painel mostra o que o agent entendeu, a ação, a confiança, por
quê, as regras aplicadas, cada ferramenta (duração, tentativas, falhas recuperadas), os guardrails que
intervieram, o modelo, a latência e os tokens. **Os passos vêm da execução real das ferramentas**
(`TurnRecorder`), não do texto do modelo — o agent não consegue "dizer" que consultou algo que não consultou.

## Como garanti a qualidade das decisões

- **Regras críticas em código e testadas** (70 testes): prioridade e SLA em horário útil, detecção de
  duplicidade, confirmação explícita, máquina de estados, retry/idempotência/circuit breaker do cliente,
  privacidade e validação no serviço de chamados.
- **Testes de integração do turno** (`run-turn.test.ts`) contra o serviço de chamados real em memória, com um
  _runner_ falso no lugar do LLM: seleção de chamado vencido oferece analista; o modelo tentando gravar sem
  confirmação é bloqueado; criação duplicada vira atualização do INC-20311; confiança 41% transfere e pausa
  o agent; legado fora do ar gera resposta honesta sem alterar nada; limite de 30 mensagens.
- **Prompt enxuto e estável**, com as regras do Anexo A, e dados da conversa entrando como contexto
  delimitado (dados, não instruções).
- **Saída estruturada validada com zod**; se vier inválida, a confiança cai para 0,3 e um analista é chamado.

## Modelo de LLM

Claude via _model router_ do Mastra, padrão **Opus 5.5 com esforço baixo** (`LLM_EFFORT=low`): o agent
precisa escolher bem entre ferramentas e respeitar regras em português, e o esforço baixo mantém latência e
custo sob controle.

| `LLM_PROVIDER` | Chave               | Como chama                                                                          | Modelo padrão               |
| -------------- | ------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| `fal` (padrão) | `FAL_KEY`           | endpoint OpenAI-compatível do fal.ai (OpenRouter por baixo), `Authorization: Key …` | `anthropic/claude-opus-5.5` |
| `anthropic`    | `ANTHROPIC_API_KEY` | API da Anthropic direto, com cache de prefixo explícito                             | `claude-opus-5-5`           |

`LLM_MODEL` troca o modelo (ex.: `anthropic/claude-haiku-5.5` no fal para baratear).

Uso consciente do modelo:

- rotas determinísticas resolvem cliques e confirmações sem chamar o LLM;
- prompt de sistema e ferramentas estáveis → cache de prefixo;
- janela de 12 mensagens, ferramentas devolvem resumos (não o chamado inteiro), `maxOutputTokens` 1500,
  no máximo 6 passos por turno;
- uso de tokens registrado por dia (`llm_usage`) e exibido em cada trace.

## Segurança e privacidade

- Chaves só em `.env` (não versionado); `.env.example` sem valores.
- Sessão com token aleatório em cookie `HttpOnly`/`SameSite=Lax` (`Secure` em produção); o banco guarda só
  o hash. Logout apaga a sessão no servidor.
- Toda rota valida sessão, papel (funcionário × analista) e dono do recurso; entradas validadas com zod;
  erros sem detalhes internos. Analista só responde depois de assumir.
- Serviço de chamados exige token de serviço e filtra por solicitante (defesa em profundidade).
- Rate limit por usuário no chat (`RATE_LIMIT_PER_MINUTE`) e nas ações do console
  (`CONSOLE_RATE_LIMIT_PER_MINUTE`), e por IP no login — o IP vem do proxy (`X-Real-IP` / último valor de
  `X-Forwarded-For`), não do que o cliente envia. Orçamento diário de chamadas ao LLM (`DEMO_DAILY_LLM_BUDGET`).
- Login com mensagem única para e-mail inexistente ou senha errada; em deploy público, `DEMO_PASSWORD`
  exige uma senha (sem ela, vale a regra do protótipo: qualquer senha).
- Cabeçalhos de segurança (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e HSTS
  em produção). SQL só com parâmetros (nomes de coluna dinâmicos vêm de lista fixa); `pnpm audit` sem
  vulnerabilidades conhecidas.

## Principais trade-offs

| Escolha                                              | Por quê                                            | Custo                                                                 |
| ---------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| SQLite em arquivo                                    | roda com poucos comandos, persiste entre reinícios | não escala horizontalmente (trocar a camada `server/db` por Postgres) |
| Polling no console                                   | simples, sem infraestrutura extra                  | até 3 s de atraso; SSE/WebSocket com mais tempo                       |
| Busca lexical na central de ajuda                    | 8 artigos: determinística, explicável, sem custo   | não entende sinônimos distantes; embeddings com base maior            |
| Rotas determinísticas fora do LLM                    | custo zero, previsíveis                            | menos "naturais" que uma resposta gerada                              |
| Histórico gerenciado manualmente (sem Mastra Memory) | custo previsível, trace junto da mensagem          | sem memória semântica entre conversas                                 |

## O que eu faria com mais tempo

- **Avaliação contínua do agent**: conjunto de conversas de referência (dúvida resolvida pela central, fora do
  escopo, duplicidade, prioridade crítica, pedido de dados de outra pessoa) rodando com o modelo real no CI,
  medindo ação correta, prioridade correta e taxa de transferência.
- Console em tempo real (SSE), atribuição por fila N1/N2 e métricas (resolução sem fila, tempo até analista).
- Postgres + migrations versionadas; observabilidade (traces OpenTelemetry por turno).
- Busca semântica na central de ajuda e sugestão de novos artigos a partir de chamados recorrentes.
- Separar web e serviço de chamados em apps distintos no deploy (hoje dividem um container) e trocar SQLite
  por Postgres para escalar horizontalmente.
