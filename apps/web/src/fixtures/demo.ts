import type {
  Analyst,
  ChatMessage,
  Conversation,
  ConversationDetail,
  ConversationListItem,
  Employee,
  TicketDraft,
  TicketView,
  TraceStep,
} from "@nexo/contracts";

const at = (hour: string) => `2026-10-21T${hour}:00.000Z`;
export const employee: Employee = {
  id: "ana",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  department: "Financeiro",
  passwordChangedAt: "2026-09-09T12:00:00.000Z",
};
export const analyst: Analyst = { id: "rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", team: "N2" };
export const step = (id: string, label: string, tool: string, detail: string, durationMs = 285): TraceStep => ({
  id,
  label,
  tool,
  detail,
  durationMs,
  attempts: 1,
  status: "ok",
});
const trace = (
  intent: NonNullable<ChatMessage["trace"]>["intent"],
  action: NonNullable<ChatMessage["trace"]>["action"],
  understood: string,
  rationale: string,
  steps: TraceStep[],
  confidence = 0.91,
  rulesApplied: string[] = [],
  guardrails: string[] = [],
): NonNullable<ChatMessage["trace"]> => ({
  intent,
  action,
  understood,
  rationale,
  steps,
  confidence,
  rulesApplied,
  guardrails,
  model: "claude-opus-5-5",
  latencyMs: 1420,
  usage: { inputTokens: 624, outputTokens: 138 },
});
const message = (id: string, role: ChatMessage["role"], text: string, hour: string, extras: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversationId: "ana-conversation",
  role,
  text,
  authorName: role === "analyst" ? "Rafael Lima" : null,
  authorBadge: role === "analyst" ? "Suporte N2" : null,
  blocks: [],
  trace: null,
  createdAt: at(hour),
  ...extras,
});
export const draft: TicketDraft = {
  id: "D-381",
  mode: "create",
  targetTicketId: null,
  type: "INC",
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa dela para a reunião das 14h.",
  category: "rede_vpn",
  subcategory: null,
  priority: "alta",
  affected: "so_eu",
  slaLabel: "resposta até 13:43",
  status: "pending",
  resultTicketId: null,
};
const ticket = (
  id: string,
  title: string,
  status: TicketView["status"],
  category: TicketView["category"],
  priority: TicketView["priority"],
  date: string,
  description: string,
  overdue = false,
): TicketView => ({
  id,
  type: id.startsWith("REQ") ? "REQ" : "INC",
  title,
  description,
  category,
  subcategory: null,
  priority,
  affected: "so_eu",
  status,
  requesterId: employee.id,
  assignedTeam: "N2",
  createdAt: date,
  updatedAt: date,
  lastServiceUpdateAt: date,
  resolvedAt: status === "resolvido" ? date : null,
  updates: [],
  sla: { dueAt: null, overdue, label: overdue ? "prazo vencido" : "em até 3 dias úteis" },
});
export const tickets: TicketView[] = [
  ticket(
    "INC-20311",
    "Notebook lento após atualização do Windows",
    "aguardando_analista",
    "hardware",
    "media",
    "2026-10-16T14:20:00.000Z",
    "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
    true,
  ),
  ticket(
    "INC-20298",
    "Acesso à pasta Financeiro no SharePoint",
    "em_andamento",
    "acesso",
    "media",
    "2026-10-14T14:20:00.000Z",
    "Não consigo acessar a pasta Financeiro.",
  ),
  ticket(
    "REQ-10442",
    "Segundo monitor para home office",
    "aprovado",
    "hardware",
    "baixa",
    "2026-10-09T14:20:00.000Z",
    "Preciso de um segundo monitor.",
  ),
  ticket(
    "INC-19877",
    "Outlook não sincroniza no celular",
    "resolvido",
    "email",
    "baixa",
    "2026-09-02T14:20:00.000Z",
    "Outlook não sincroniza.",
  ),
  ticket("INC-19410", "Troca de senha da rede", "resolvido", "acesso", "baixa", "2026-07-11T14:20:00.000Z", "Preciso trocar a senha."),
];
const summaries = tickets
  .slice(0, 3)
  .map(({ id, type, title, category, priority, status, createdAt, updatedAt, sla }) => ({
    id,
    type,
    title,
    category,
    priority,
    status,
    createdAt,
    updatedAt,
    sla,
  }));
export const newTicketMessages: ChatMessage[] = [
  message("new-u1", "user", "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.", "10:00"),
  message(
    "new-a1",
    "agent",
    "Não há chamado aberto sobre VPN, e o artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.",
    "10:01",
    {
      blocks: [
        {
          kind: "quick_replies",
          question: "Quem está sendo afetado?",
          options: [
            { label: "Só eu", value: "so_eu" },
            { label: "Minha equipe", value: "equipe" },
            { label: "Toda a empresa", value: "empresa" },
            { label: "Não sei", value: "nao_sei" },
          ],
        },
      ],
      trace: trace(
        "abrir_chamado",
        "pediu_informacao",
        "A VPN do notebook apresenta erro 809 no Windows 11 desde ontem.",
        "Não encontrei chamado aberto equivalente. O artigo disponível trata de Windows 10, então preciso confirmar o impacto antes de calcular a prioridade.",
        [
          step("s1", "consultou seus chamados", "listar_meus_chamados", "Nenhum chamado aberto sobre VPN"),
          step("s2", "buscou na central de ajuda", "buscar_central_ajuda", "Artigo do erro 809 cobre Windows 10", 410),
        ],
        0.88,
        ["Confirmar afetados antes de classificar a prioridade"],
        ["Evitar chamado duplicado"],
      ),
    },
  ),
  message("new-u2", "user", "Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.", "10:02"),
  message(
    "new-a2",
    "agent",
    "Coloquei prioridade alta por causa da reunião — a resposta chega antes das 14h. Confira antes de eu criar:",
    "10:03",
    {
      blocks: [{ kind: "draft", draft }],
      trace: trace(
        "abrir_chamado",
        "montou_rascunho",
        "Uma pessoa foi afetada, com reunião às 14h que depende da VPN.",
        "A urgência do compromisso de hoje eleva a prioridade para Alta. O chamado aguarda sua confirmação.",
        [
          step("s3", "classificou a prioridade", "calcular_prioridade", "Impacto individual × urgência alta → Alta", 14),
          step("s4", "consultou o SLA", "calcular_sla", "Resposta até 13:43", 12),
          step("s5", "montou o rascunho", "preparar_rascunho", "Rascunho D-381 pendente", 195),
        ],
        0.94,
        ["Prioridade: compromisso no mesmo dia → Alta", "Prazo de primeira resposta: 4 horas úteis"],
        ["Criação depende de confirmação explícita"],
      ),
    },
  ),
];
export const consultationMessages: ChatMessage[] = [
  message("con-u1", "user", "Qual o status do meu chamado?", "10:01"),
  message("con-a1", "agent", "Você tem 3 chamados abertos. Sobre qual deles quer saber?", "10:01", {
    blocks: [{ kind: "ticket_select", tickets: summaries }],
    trace: trace(
      "consultar_chamado",
      "listou_chamados",
      "Você quer consultar um chamado, mas não indicou qual.",
      "Listei apenas seus chamados abertos para você escolher.",
      [step("c1", "consultou seus chamados", "listar_meus_chamados", "3 chamados abertos")],
      0.97,
      ["Mostrar apenas chamados do próprio funcionário"],
      ["Escopo do funcionário validado pela sessão"],
    ),
  }),
  message("con-u2", "user", "INC-20311 · Notebook lento após atualização", "10:02"),
  message(
    "con-a2",
    "agent",
    "Está sem atualização há 5 dias, acima do prazo de 3 dias úteis para prioridade média. Quer que eu chame um analista?",
    "10:02",
    {
      blocks: [
        { kind: "ticket_card", ticket: tickets[0]! },
        {
          kind: "quick_replies",
          question: null,
          options: [
            { label: "Falar com um analista", value: "analista" },
            { label: "Adicionar informação", value: "adicionar" },
            { label: "Não, obrigado", value: "nao" },
          ],
        },
      ],
      trace: trace(
        "consultar_chamado",
        "mostrou_chamado",
        "Você selecionou o INC-20311, sem atualização recente.",
        "O prazo de 3 dias úteis para prioridade média foi excedido; ofereci transferência para um analista.",
        [
          step("c2", "consultou o INC-20311", "consultar_chamado", "Chamado aguardando analista", 342),
          step("c3", "calculou o prazo", "calcular_sla", "Última atualização há 5 dias; prazo vencido", 9),
        ],
        0.96,
        ["Prazo de cada atualização: 3 dias úteis para prioridade média", "Chamado vencido → oferecer analista"],
        ["Transferência requer aceite do funcionário"],
      ),
    },
  ),
];
export const consoleMessages: ChatMessage[] = [
  consultationMessages[0]!,
  consultationMessages[1]!,
  consultationMessages[2]!,
  message("co-a2", "agent", "Está sem atualização há 5 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?", "10:02", {
    trace: consultationMessages[3]!.trace,
  }),
  message("co-u3", "user", "Está parado há 5 dias.", "10:04"),
  message("co-u4", "user", "Quero falar com um analista.", "10:04"),
  message("co-a3", "agent", "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.", "10:05", {
    blocks: [{ kind: "handoff", team: "N2", etaLabel: "até 2 h úteis", reason: "pedido_do_funcionario" }],
    trace: trace(
      "falar_com_analista",
      "transferiu",
      "Você pediu atendimento humano para o chamado vencido.",
      "A conversa foi encaminhada ao Suporte N2 com o histórico e um resumo do caso.",
      [step("c4", "transferiu para analista", "transferir_para_analista", "Suporte N2 recebeu o resumo", 188)],
      0.99,
      ["Pedido do funcionário → transferir", "Agent pausado após transferência"],
      ["Resposta automática bloqueada enquanto aguarda analista"],
    ),
  }),
  message("co-s1", "system", "Transferida para Suporte N2 · 10:05", "10:05"),
];
export const assumedMessages: ChatMessage[] = [
  ...consoleMessages,
  message("co-s2", "system", "Rafael Lima assumiu · agent pausado · 10:12", "10:12"),
  message(
    "co-r1",
    "analyst",
    "Oi, Ana! Aqui é o Rafael. Já li o histórico e vou verificar o driver de vídeo remotamente. Pode deixar o notebook ligado agora?",
    "10:12",
  ),
  message("co-u5", "user", "Posso sim, está ligado.", "10:13"),
];
export const conversation = (status: Conversation["status"]): Conversation => ({
  id: "ana-conversation",
  employeeId: employee.id,
  status,
  handoffReason: status === "agent" ? null : "pedido_do_funcionario",
  handoffSummary:
    status === "agent"
      ? null
      : "Ana relata lentidão no notebook após atualização do Windows. O INC-20311 está sem atualização há 5 dias, com prazo vencido. Ela pediu atendimento humano.",
  assignedAnalystId: status === "human" ? analyst.id : null,
  relatedTicketId: "INC-20311",
  lastConfidence: 0.96,
  userMessageCount: 16,
  createdAt: at("09:50"),
  updatedAt: at("10:05"),
});
const item = (
  id: string,
  name: string,
  department: string,
  status: ConversationListItem["status"],
  preview: string,
  time: string,
  unreadCount: number,
  extras: Partial<ConversationListItem> = {},
): ConversationListItem => ({
  id,
  employee: { id, name, department },
  status,
  handoffReason: status === "waiting_human" ? "pedido_do_funcionario" : null,
  relatedTicketId: null,
  lastConfidence: null,
  lastMessage: { role: "user", text: preview, at: at(time) },
  unreadCount,
  assignedAnalystId: status === "human" ? analyst.id : null,
  waitingSince: status === "waiting_human" ? at(time) : null,
  ...extras,
});
export const consoleItems: ConversationListItem[] = [
  item("ana-conversation", "Ana Souza", "Financeiro", "waiting_human", "Está parado há 5 dias. Quero falar com...", "10:05", 2, {
    relatedTicketId: "INC-20311",
  }),
  item("carla", "Carla Mendes", "Comercial", "waiting_human", "Preciso de acesso ao SAP ainda hoje", "09:58", 1),
  item("bruno", "Bruno Tavares", "Operações", "waiting_human", "Nexo: Vou chamar um analista para isso.", "09:51", 0, {
    handoffReason: "baixa_confianca",
    lastConfidence: 0.41,
  }),
  item("diego", "Diego Ramos", "Produto", "agent", "digitando...", "10:06", 0),
  item("elisa", "Elisa Prado", "Vendas", "agent", "Nexo: Chamado INC-20519 criado.", "10:03", 0),
  item("fabio", "Fábio Nunes", "Financeiro", "closed", "Isso resolveu, obrigado!", "10:01", 0),
  item("gabriela", "Gabriela Rocha", "Marketing", "closed", "Nexo: A senha do Wi-Fi foi enviada...", "09:45", 0),
];
export const consoleDetail = (
  status: Conversation["status"],
  messages = status === "human" ? assumedMessages : consoleMessages,
): ConversationDetail => ({
  conversation: conversation(status),
  employee,
  messages,
  tickets,
  assignedAnalyst: status === "human" ? analyst : null,
});
