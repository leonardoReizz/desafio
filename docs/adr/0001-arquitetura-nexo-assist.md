# ADR 0001 — Arquitetura do Nexo Assist

- **Status:** aceito
- **Data:** 2026-10-27
- **Contexto do documento:** desafio técnico (PRD v5) — agent de service desk de TI para ~2.000 funcionários.

## 1. Contexto

O PRD pede um chat em que o funcionário descreve o problema com as próprias palavras e um agent:
consulta chamados, busca na central de ajuda, abre/atualiza chamados (com confirmação) e transfere para
um analista quando necessário. Do outro lado, um console permite ao analista assumir a conversa
(agent pausado), devolvê-la ou encerrá-la.

Forças que moldam a arquitetura:

| Força                                          | Consequência                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| "Transparência é a parte mais importante"      | Toda resposta do agent carrega um `DecisionTrace` estruturado e persistido.              |
| Regras do Anexo A precisam ser seguidas sempre | Regras críticas são **código** (guardrails), não só prompt.                              |
| Sistema de chamados é legado e instável        | Serviço separado, com falhas simuladas, e cliente com retry/backoff/timeout.             |
| Privacidade entre funcionários                 | Identidade vem da sessão, nunca do LLM. Ferramentas são "pré-escopadas" ao usuário.      |
| Persistência entre reinícios                   | SQLite em arquivo para app e serviço de chamados.                                        |
| Custo por conversa                             | Janela curta de histórico, prompt estável (cacheável), ferramentas que devolvem resumos. |
| Mastra (preferência)                           | Agent com Mastra + AI SDK.                                                               |

## 2. Decisão

### 2.1 Visão geral (monorepo pnpm)

```
apps/web            Next.js 16 (App Router) — UI + BFF (route handlers) + runtime do agent
  src/app/          rotas: /login, /chat, /perfil, /console, /api/*
  src/components/   UI (fiel ao protótipo em design/)
  src/server/       código só de servidor
    auth/           sessão (cookie HttpOnly com token opaco), RBAC funcionário/analista
    db/             SQLite (conversas, mensagens, rascunhos, estado)
    agent/          Mastra agent, tools, prompt, guardrails, trace
    tickets-client/ cliente HTTP do serviço de chamados (retry, timeout, circuit breaker)
    kb/             central de ajuda (artigos + busca)
    sla/            cálculo de prazo em horário útil
services/tickets    Serviço de chamados simulado (Hono + SQLite) — processo separado, porta 4001
packages/contracts  Schemas zod + tipos compartilhados (fonte única de verdade dos contratos)
design/             protótipo exportado (nexo.pen.json + screens/*.png) — referência visual
docs/adr/           decisões
```

Separação de responsabilidades: **interface** (components) ↔ **BFF/agent** (server) ↔ **serviços**
(tickets). A UI nunca fala com o serviço de chamados nem com o LLM diretamente.

### 2.2 O agent: "LLM decide, código garante"

Cada mensagem do funcionário passa por um pipeline determinístico em volta do LLM:

1. **Pré-checagens (código):** sessão válida; conversa pertence ao usuário; status da conversa é
   `agent` (se `waiting_human`/`human`, a mensagem é gravada e o agent **não** responde); limite de
   30 mensagens por sessão; rate limit.
2. **Contexto mínimo:** prompt de sistema estável (regras do Anexo A + catálogo), últimas N mensagens,
   e um bloco curto de estado (rascunho pendente, chamado em foco). Nada de dados de outro funcionário.
3. **Mastra agent com tools** (todas fecham sobre o `employeeId` da sessão — o LLM não informa o dono):
   `buscar_central_ajuda`, `listar_meus_chamados`, `consultar_chamado`, `preparar_rascunho`
   (create/update/reopen), `confirmar_rascunho`, `transferir_para_analista`.
4. **Saída estruturada:** além do texto, o agent devolve `intent`, `understood`, `action`,
   `confidence`, `rationale`, `rulesApplied`. Os `steps` do trace são montados **pelo código**
   a partir das tools efetivamente executadas (duração, tentativas, erro) — o agent não pode
   "inventar" que consultou algo.
5. **Pós-checagens (código):**
   - `confidence < 0.55` → conversa sinalizada como "agent pediu ajuda" e transferida
     (motivo `baixa_confianca`).
   - Chamado vencido detectado → oferta de analista; transferência se aceita.
   - Prioridade crítica → transferência imediata após criação.
   - Fora do escopo (RH, financeiro, facilities) → redireciona, não abre chamado.

**Confirmação obrigatória:** `preparar_rascunho` só grava um rascunho `pending` e devolve o card.
Criar/atualizar/reabrir no serviço de chamados só acontece via `confirmar_rascunho` (botão
"Confirmar" no card, que chama um endpoint sem LLM, ou confirmação explícita digitada). O código
valida que o rascunho pertence à conversa e está `pending`.

**Sem duplicidade:** antes de montar um rascunho `create`, o código busca chamados abertos do
mesmo funcionário com mesma categoria e similaridade de título; se houver, o rascunho vira
`update` daquele chamado. Resolvidos há ≤ 7 dias viram `reopen`.

**Prioridade:** o LLM extrai _impacto_ (quem é afetado) e _urgência_ (compromisso hoje? há
alternativa?); a **matriz do Anexo A é aplicada em código** (`sla/priority.ts`), e o prazo é
calculado em horário útil (seg–sex, 8h–18h; crítico 24h). Isso torna a prioridade testável.

### 2.3 Transparência

- Acima de cada resposta: chips com os `steps` ("consultou seus chamados", "buscou na central de ajuda").
- Ao expandir: painel "Por que o agent fez isso" com **o que entendeu**, **ação**, **confiança**
  (barra + %), **regras aplicadas**, **ferramentas** (duração, tentativas, falhas recuperadas),
  **guardrails** que intervieram, modelo, latência e tokens.
- O trace é persistido com a mensagem e aparece também no console do analista.

### 2.4 Serviço de chamados (legado simulado)

- Processo separado (Hono, porta 4001, SQLite próprio), API REST:
  `GET /employees/:id/tickets`, `GET /tickets/:id`, `POST /tickets`, `POST /tickets/:id/updates`,
  `POST /tickets/:id/transfer`.
- Autenticação serviço-a-serviço por `TICKETS_SERVICE_TOKEN` (header). O serviço também exige o
  `X-Requester-Id` e **filtra por dono** (defesa em profundidade da regra de privacidade).
- Instabilidade simulada configurável (`TICKETS_FAILURE_RATE`, `TICKETS_LATENCY_MS`): 503 aleatório.
- Cliente (`tickets-client`): timeout 3s, 3 tentativas com backoff exponencial + jitter, só para
  erros transitórios (5xx/timeout/conexão), idempotency key em POST para não duplicar chamado em
  retry, circuit breaker simples. Falha final vira step `erro` no trace e mensagem honesta ao
  funcionário ("o sistema de chamados está instável, tento de novo em instantes").

### 2.5 Persistência

SQLite (better-sqlite3) em arquivo, WAL:

- `apps/web/data/app.db`: employees, analysts, sessions, conversations (status, handoff), messages
  (texto + blocks JSON + trace JSON), drafts, rate limits.
- `services/tickets/data/tickets.db`: tickets, updates, idempotency keys.

Conversas, chamados e o estado de cada conversa sobrevivem a reinício. "Voltar outro dia" = ao
logar, o chat reabre a última conversa não encerrada.

### 2.6 Autenticação e segurança

- Login: e-mail corporativo de um funcionário/analista do seed + qualquer senha (exigência do PRD).
  Sessão com token opaco aleatório (32 bytes) em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em
  produção; no banco fica só o hash SHA-256 do token (vazar o banco não permite sequestrar sessão).
- `proxy.ts` só redireciona quem não tem cookie para `/login`; a autorização real (sessão válida,
  papel e dono do recurso) é feita em cada route handler.
- RBAC: rotas `/console` e `/api/console/*` só para analistas; `/api/chat` só para funcionários.
- Toda query por conversa/chamado é escopada pelo dono da sessão. O console lê chamados do
  funcionário da conversa via serviço, com o analista autenticado.
- Chaves (LLM, segredos) só em `.env`; `.env.example` sem valores. Nada de chave no cliente.
- Entrada validada com zod em todas as fronteiras (route handlers, tools, serviço).
- Prompt injection: dados de chamados/artigos entram como _dados_ delimitados; ações sensíveis
  dependem de guardrails de código, não da obediência do modelo.
- Rate limit por usuário e por IP nas rotas do agent; limite de 30 mensagens/sessão; teto de
  tokens por resposta. Em deploy, `DEMO_DAILY_BUDGET` limita chamadas ao LLM.

### 2.7 Interface

- Next.js 16 App Router, React 19, Tailwind v4 com tokens do protótipo (`design/nexo.pen.json`
  → variáveis `$ink`, `$cta`, `$rule`, …), fontes Schibsted Grotesk (UI) e Newsreader (display),
  ícones Lucide.
- Respostas em tempo real via **SSE** (`POST /api/chat` → eventos `step`, `text_delta`,
  `agent_message`): os chips de ação aparecem conforme as tools executam.
- Console do analista atualiza por polling leve (3s) — suficiente para o protótipo, sem infra extra.
- Estados de carregamento, erro (serviço instável, LLM indisponível) e vazio em todas as telas.

### 2.8 Modelo de LLM

Claude pelo _model router_ do Mastra (`anthropic/<modelo>`, provider Anthropic do AI SDK por baixo). Padrão `claude-opus-5-5` com esforço
baixo — melhor qualidade de decisão e de uso de ferramentas; configurável por `LLM_MODEL`
(ex.: `claude-haiku-5-5` para reduzir custo ~40×). Custo controlado por: prompt de sistema estável
(cache de prefixo), janela de histórico curta, tools retornando resumos, `max_tokens` baixo e
limite de mensagens.

## 3. Alternativas consideradas

| Alternativa                                         | Por que não                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| LangGraph.js                                        | Mastra é a preferência do PRD; o fluxo cabe num agent com tools + guardrails.                         |
| Grafo/workflow rígido por intenção                  | Conversa real mistura intenções; perde naturalidade. Mantivemos o LLM decidindo e o código validando. |
| Serviço de chamados dentro do Next (mesmo processo) | PRD pede separado; processo próprio simula de verdade latência/indisponibilidade.                     |
| Postgres                                            | Exige infra para rodar localmente; SQLite atende persistência e "poucos comandos".                    |
| WebSocket para o chat                               | SSE cobre streaming servidor→cliente com menos complexidade.                                          |
| Mastra Memory para histórico                        | Controlamos a janela e o formato manualmente (custo previsível, trace junto da mensagem).             |

## 4. Consequências

- (+) Regras críticas (confirmação, privacidade, pausa do agent, prioridade, duplicidade) são
  testáveis sem LLM.
- (+) Trace confiável: passos vêm da execução real, não do texto do modelo.
- (−) Dois processos para rodar (mitigado por `pnpm dev` na raiz rodando ambos).
- (−) SQLite em arquivo limita escala horizontal; aceitável para o protótipo (migrar para Postgres
  é trocar a camada `server/db`).
- (−) Polling no console; com mais tempo, SSE/WebSocket para o console.
