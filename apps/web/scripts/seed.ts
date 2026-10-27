/**
 * Recria as conversas de exemplo do app (o console do analista já abre populado, como no protótipo).
 * Rode com `pnpm seed` na raiz (também recria os chamados no serviço de chamados).
 */
import type { DecisionTrace, TraceStep, UiBlock } from "@nexo/contracts";
import { openAppDatabase } from "../src/server/db/client";
import { ConversationRepository } from "../src/server/db/conversations";

const dbPath = process.env.APP_DB_PATH ?? "./data/app.db";
const db = openAppDatabase(dbPath);
db.exec("DELETE FROM messages; DELETE FROM drafts; DELETE FROM conversations; DELETE FROM sessions;");

const MIN = 60_000;
const base = Date.now();
let clock = base;
const repo = new ConversationRepository(db, () => new Date(clock));
const at = (minutesAgo: number) => {
  clock = base - minutesAgo * MIN;
};

let stepSeq = 0;
const step = (tool: string, label: string, detail: string | null = null): TraceStep => ({
  id: `seed-step-${++stepSeq}`,
  tool,
  label,
  status: "ok",
  durationMs: 120 + ((stepSeq * 37) % 200),
  detail,
  attempts: 1,
});

const trace = (t: Partial<DecisionTrace> & Pick<DecisionTrace, "intent" | "understood" | "action" | "rationale">): DecisionTrace => ({
  confidence: 0.92,
  rulesApplied: [],
  steps: [],
  guardrails: [],
  model: "exemplo (seed)",
  latencyMs: 1800,
  usage: null,
  ...t,
});

function agent(conversationId: string, text: string, tr: DecisionTrace, blocks: UiBlock[] = []) {
  repo.addMessage(conversationId, { role: "agent", text, authorName: "Nexo Assist", blocks, trace: tr });
}

// ---- Ana Souza: chamado vencido → pediu analista (Tela 4) ----
{
  at(12);
  const c = repo.create("emp_ana");
  repo.addMessage(c.id, { role: "user", text: "Qual o status do meu chamado?" });
  agent(
    c.id,
    "Você tem 3 chamados abertos. Sobre qual deles quer saber?",
    trace({
      intent: "consultar_chamado",
      understood: "Quer saber o status de um chamado, sem dizer qual",
      action: "listou_chamados",
      rationale: "Há mais de um chamado aberto; mostrar a seleção evita adivinhar.",
      steps: [step("listar_meus_chamados", "consultou seus chamados", "3 aberto(s), 1 com prazo vencido; 3 encerrado(s)")],
    }),
  );
  at(11);
  repo.addMessage(c.id, { role: "user", text: "INC-20311 · Notebook lento após atualização" });
  agent(
    c.id,
    "Está sem atualização há 5 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?",
    trace({
      intent: "consultar_chamado",
      understood: "Quer saber o status do INC-20311",
      action: "mostrou_chamado",
      confidence: 1,
      model: "regras (sem LLM)",
      rationale: "O INC-20311 está sem atualização acima do prazo da prioridade média. Chamado vencido justifica oferecer um analista.",
      rulesApplied: ["Prazo de 3 dias úteis para prioridade média vencido → oferecer analista"],
      steps: [
        step("consultar_chamado", "consultou o INC-20311", "Aguardando analista · prioridade média"),
        step("calcular_prazo", "calculou o prazo", "prazo 3 dias úteis → prazo vencido"),
      ],
    }),
  );
  at(10);
  repo.addMessage(c.id, { role: "user", text: "Está parado há 5 dias." });
  repo.addMessage(c.id, { role: "user", text: "Quero falar com um analista." });
  agent(
    c.id,
    "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
    trace({
      intent: "falar_com_analista",
      understood: "Quer falar com um analista",
      action: "transferiu",
      confidence: 1,
      model: "regras (sem LLM)",
      rationale: "Pedido explícito de atendimento humano, com chamado vencido em foco.",
      rulesApplied: ["Transferência: chamado com prazo vencido"],
      steps: [
        step("transferir_chamado", "transferiu o INC-20311", "Suporte N2"),
        step("transferir_conversa", "chamou um analista", "Suporte N2 · chamado_vencido"),
      ],
    }),
    [{ kind: "handoff", team: "N2", etaLabel: "em até 2 h úteis", reason: "chamado_vencido" }],
  );
  repo.addMessage(c.id, { role: "system", text: "Transferida para Suporte N2" });
  repo.update(c.id, {
    status: "waiting_human",
    handoffReason: "chamado_vencido",
    handoffSummary:
      "Chamado com prazo vencido. Chamado: INC-20311 (notebook lento após atualização do Windows, média, sem atualização há 5 dias). Funcionária pediu para falar com um analista.",
    handoffAt: new Date(clock).toISOString(),
    relatedTicketId: "INC-20311",
    lastConfidence: 1,
  });
}

// ---- Carla Mendes: acesso ao SAP hoje (transferida) ----
{
  at(17);
  const c = repo.create("emp_carla");
  repo.addMessage(c.id, { role: "user", text: "Preciso de acesso ao SAP ainda hoje" });
  agent(
    c.id,
    "Seu INC-20322 está aguardando analista com prioridade alta. Como o prazo é hoje, chamei um analista agora.",
    trace({
      intent: "consultar_chamado",
      understood: "Precisa de acesso ao SAP hoje; já tem chamado aberto",
      action: "transferiu",
      rationale: "Há compromisso no mesmo dia e o chamado já existe; transferir evita duplicar e acelera.",
      rulesApplied: [
        "Sem duplicidade: chamado aberto sobre o mesmo problema é atualizado",
        "Compromisso em risco no mesmo dia → Alta (4 horas úteis)",
      ],
      steps: [
        step("listar_meus_chamados", "consultou seus chamados", "1 aberto(s)"),
        step("transferir_conversa", "chamou um analista", "Suporte N1"),
      ],
    }),
  );
  repo.update(c.id, {
    status: "waiting_human",
    handoffReason: "pedido_do_funcionario",
    handoffSummary: "Precisa do perfil de pedidos no SAP para fechar pedido de cliente hoje. Chamado INC-20322 (alta).",
    handoffAt: new Date(clock).toISOString(),
    relatedTicketId: "INC-20322",
    lastConfidence: 0.88,
  });
}

// ---- Bruno Tavares: agent sem segurança (confiança 41%) ----
{
  at(24);
  const c = repo.create("emp_bruno");
  repo.addMessage(c.id, { role: "user", text: "o negócio do marketing não abre mais desde a mudança" });
  agent(
    c.id,
    "Vou chamar um analista para isso.",
    trace({
      intent: "conversa",
      understood: "Algum sistema do marketing parou de abrir após uma mudança, sem dizer qual",
      action: "transferiu",
      confidence: 0.41,
      rationale: "Não ficou claro qual sistema nem o que mudou; com baixa confiança, um analista decide melhor.",
      guardrails: ["Confiança 41% abaixo de 55% → analista chamado"],
      rulesApplied: ["Transferência: agent sem segurança sobre o que fazer"],
      steps: [step("buscar_central_ajuda", "buscou na central de ajuda", "nenhum artigo relevante")],
    }),
  );
  repo.update(c.id, {
    status: "waiting_human",
    handoffReason: "baixa_confianca",
    handoffSummary: "Agent sem segurança para decidir. Últimas mensagens: “o negócio do marketing não abre mais desde a mudança”",
    handoffAt: new Date(clock).toISOString(),
    lastConfidence: 0.41,
  });
}

// ---- Diego, Elisa: com o agent ----
{
  at(1);
  const c = repo.create("emp_diego");
  repo.addMessage(c.id, { role: "user", text: "Como instalo o Docker Desktop?" });
}
{
  at(12);
  const c = repo.create("emp_elisa");
  repo.addMessage(c.id, { role: "user", text: "O Teams não reconhece meu microfone desde ontem." });
  agent(
    c.id,
    "Chamado INC-20519 criado. Prazo: resposta em até 3 dias úteis.",
    trace({
      intent: "abrir_chamado",
      understood: "Microfone não funciona no Teams",
      action: "criou_chamado",
      rationale: "Artigo não cobria o caso; rascunho confirmado pela funcionária.",
      rulesApplied: [
        "Atrapalha, mas há alternativa → Média (3 dias úteis)",
        "Chamado só é criado/atualizado após confirmação do funcionário",
      ],
      steps: [
        step("buscar_central_ajuda", "buscou na central de ajuda", "nenhum artigo relevante"),
        step("criar_chamado", "criou o chamado", "INC-20519 · Média"),
      ],
    }),
  );
  repo.update(c.id, { relatedTicketId: "INC-20519", lastConfidence: 0.9 });
}

// ---- Fábio, Gabriela: resolvidas pelo agent ----
for (const [emp, minutes, q, a, kb] of [
  [
    "emp_fabio",
    14,
    "Esqueci a senha da rede, como troco?",
    "Acesse senha.nexo.com.br pelo celular, confirme o código e defina a nova senha. Isso resolveu?",
    "KB-003 Redefinir a senha da rede",
  ],
  [
    "emp_gabriela",
    1500,
    "Qual a senha do Wi-Fi para um visitante?",
    "A rede NEXO-VISITANTE usa um código diário retirado na recepção.",
    "KB-007 Wi-Fi para visitantes",
  ],
] as const) {
  at(minutes);
  const c = repo.create(emp);
  repo.addMessage(c.id, { role: "user", text: q });
  agent(
    c.id,
    a,
    trace({
      intent: "tirar_duvida",
      understood: q,
      action: "respondeu_com_artigo",
      rationale: `O artigo ${kb} responde diretamente; não precisa de chamado.`,
      steps: [step("buscar_central_ajuda", "buscou na central de ajuda", kb)],
    }),
  );
  if (emp === "emp_fabio") repo.addMessage(c.id, { role: "user", text: "Isso resolveu, obrigado!" });
  repo.update(c.id, { status: "closed", lastConfidence: 0.95 });
}

console.log(`[web] seed concluído em ${dbPath}`);
