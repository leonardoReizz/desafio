import { z } from "zod";
import { Affected, Category, Priority, TicketSummary, TicketType, TicketView } from "./tickets";

export const Employee = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  department: z.string(),
  passwordChangedAt: z.iso.datetime(),
});
export type Employee = z.infer<typeof Employee>;

export const Analyst = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  team: z.enum(["N1", "N2"]),
});
export type Analyst = z.infer<typeof Analyst>;

// ---- Conversation state machine ----
//  agent ──(transfer)──▶ waiting_human ──(assume)──▶ human ──(return)──▶ agent
//                                    └─(return)──▶ agent        └─(close)──▶ closed
export const ConversationStatus = z.enum(["agent", "waiting_human", "human", "closed"]);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const HandoffReason = z.enum(["pedido_do_funcionario", "caso_critico", "chamado_vencido", "baixa_confianca"]);
export type HandoffReason = z.infer<typeof HandoffReason>;

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  pedido_do_funcionario: "Funcionário pediu um analista",
  caso_critico: "Caso crítico",
  chamado_vencido: "Chamado com prazo vencido",
  baixa_confianca: "Agent sem segurança para decidir",
};

// ---- Decision trace (transparência — o item mais importante do PRD) ----

export const Intent = z.enum([
  "tirar_duvida",
  "consultar_chamado",
  "complementar_chamado",
  "abrir_chamado",
  "falar_com_analista",
  "confirmar_ou_ajustar",
  "fora_de_escopo",
  "conversa",
]);
export type Intent = z.infer<typeof Intent>;

export const INTENT_LABEL: Record<Intent, string> = {
  tirar_duvida: "Tirar uma dúvida",
  consultar_chamado: "Consultar chamado",
  complementar_chamado: "Complementar chamado",
  abrir_chamado: "Abrir chamado",
  falar_com_analista: "Falar com analista",
  confirmar_ou_ajustar: "Confirmar ou ajustar rascunho",
  fora_de_escopo: "Fora do escopo de TI",
  conversa: "Conversa",
};

export const AgentAction = z.enum([
  "respondeu_com_artigo",
  "listou_chamados",
  "mostrou_chamado",
  "pediu_informacao",
  "montou_rascunho",
  "criou_chamado",
  "atualizou_chamado",
  "reabriu_chamado",
  "transferiu",
  "redirecionou",
  "respondeu",
]);
export type AgentAction = z.infer<typeof AgentAction>;

export const ACTION_LABEL: Record<AgentAction, string> = {
  respondeu_com_artigo: "Respondeu com a central de ajuda",
  listou_chamados: "Listou seus chamados",
  mostrou_chamado: "Mostrou o chamado",
  pediu_informacao: "Pediu mais informação",
  montou_rascunho: "Montou rascunho para confirmação",
  criou_chamado: "Criou chamado",
  atualizou_chamado: "Atualizou chamado",
  reabriu_chamado: "Reabriu chamado",
  transferiu: "Transferiu para analista",
  redirecionou: "Redirecionou (fora do escopo)",
  respondeu: "Respondeu",
};

export const TraceStep = z.object({
  id: z.string(),
  tool: z.string(),
  /** Rótulo curto exibido acima da resposta: "consultou seus chamados". */
  label: z.string(),
  status: z.enum(["ok", "erro", "recuperado"]),
  durationMs: z.number().int().nonnegative(),
  /** Resumo legível do resultado: "3 chamados abertos", "artigo KB-004 (VPN erro 809)". */
  detail: z.string().nullable(),
  attempts: z.number().int().positive().default(1),
});
export type TraceStep = z.infer<typeof TraceStep>;

export const DecisionTrace = z.object({
  intent: Intent,
  /** O que o agent entendeu, em uma frase. */
  understood: z.string(),
  action: AgentAction,
  /** 0..1 — abaixo do limiar a conversa é sinalizada para um analista. */
  confidence: z.number().min(0).max(1),
  /** Por que essa ação (cita regras/artigos/chamados). */
  rationale: z.string(),
  /** Regras do Anexo A aplicadas, ex.: "Prioridade: compromisso no mesmo dia → Alta". */
  rulesApplied: z.array(z.string()),
  steps: z.array(TraceStep),
  /** Guardrails de código que intervieram (ex.: confirmação obrigatória, limite de mensagens). */
  guardrails: z.array(z.string()),
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
  usage: z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() }).nullable(),
});
export type DecisionTrace = z.infer<typeof DecisionTrace>;

// ---- Rich blocks rendered inside agent messages ----

export const QuickReplyOption = z.object({ label: z.string(), value: z.string() });
export type QuickReplyOption = z.infer<typeof QuickReplyOption>;

export const TicketDraft = z.object({
  id: z.string(),
  /** create = novo; update = complementar aberto; reopen = reabrir resolvido ≤ 7 dias. */
  mode: z.enum(["create", "update", "reopen"]),
  targetTicketId: z.string().nullable(),
  type: TicketType,
  title: z.string(),
  description: z.string(),
  category: Category,
  subcategory: z.string().nullable(),
  priority: Priority,
  affected: Affected,
  /** Ex.: "resposta até 13:43". */
  slaLabel: z.string(),
  status: z.enum(["pending", "confirmed", "cancelled"]),
  resultTicketId: z.string().nullable(),
});
export type TicketDraft = z.infer<typeof TicketDraft>;

export const UiBlock = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("quick_replies"),
    question: z.string().nullable(),
    options: z.array(QuickReplyOption).min(1).max(5),
  }),
  z.object({ kind: z.literal("ticket_select"), tickets: z.array(TicketSummary) }),
  /** Resumo dos chamados do funcionário, agrupado; cada linha abre o chamado. */
  z.object({ kind: z.literal("ticket_list"), open: z.array(TicketSummary), closed: z.array(TicketSummary) }),
  z.object({ kind: z.literal("ticket_card"), ticket: TicketView }),
  z.object({ kind: z.literal("draft"), draft: TicketDraft }),
  z.object({ kind: z.literal("handoff"), team: z.enum(["N1", "N2"]), etaLabel: z.string(), reason: HandoffReason }),
]);
export type UiBlock = z.infer<typeof UiBlock>;

export const MessageRole = z.enum(["user", "agent", "analyst", "system"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const ChatMessage = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: MessageRole,
  text: z.string(),
  authorName: z.string().nullable(),
  /** Para role=analyst: "Suporte N2". */
  authorBadge: z.string().nullable(),
  blocks: z.array(UiBlock),
  trace: DecisionTrace.nullable(),
  createdAt: z.iso.datetime(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const Conversation = z.object({
  id: z.string(),
  employeeId: z.string(),
  status: ConversationStatus,
  handoffReason: HandoffReason.nullable(),
  handoffSummary: z.string().nullable(),
  assignedAnalystId: z.string().nullable(),
  relatedTicketId: z.string().nullable(),
  /** Confiança da última decisão do agent (para "Agent pediu ajuda · confiança 41%"). */
  lastConfidence: z.number().min(0).max(1).nullable(),
  userMessageCount: z.number().int().nonnegative(),
  /** Até quando cada lado leu a conversa (confirmação de leitura ✓✓). */
  employeeReadAt: z.iso.datetime().nullable(),
  analystReadAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof Conversation>;

export const MAX_USER_MESSAGES_PER_SESSION = 30;

// ---- Streaming (SSE) events from POST /api/chat ----

export const ChatStreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_message"), message: ChatMessage }),
  z.object({ type: z.literal("step"), step: TraceStep }),
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("agent_message"), message: ChatMessage }),
  z.object({ type: z.literal("conversation"), conversation: Conversation }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEvent>;

export const SendMessageInput = z.object({
  conversationId: z.string().nullable(),
  text: z.string().trim().min(1).max(2000),
  /** Quando o funcionário clica numa opção rápida / seleciona chamado. */
  action: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("quick_reply"), value: z.string() }),
      z.object({ kind: z.literal("select_ticket"), ticketId: z.string() }),
    ])
    .nullable()
    .default(null),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

// ---- Analyst console ----

export const ConversationListFilter = z.enum(["todas", "para_voce", "com_agent", "minhas"]);
export type ConversationListFilter = z.infer<typeof ConversationListFilter>;

export const ConversationListItem = z.object({
  id: z.string(),
  employee: z.object({ id: z.string(), name: z.string(), department: z.string() }),
  status: ConversationStatus,
  handoffReason: HandoffReason.nullable(),
  relatedTicketId: z.string().nullable(),
  lastConfidence: z.number().nullable(),
  lastMessage: z.object({ role: MessageRole, text: z.string(), at: z.iso.datetime() }).nullable(),
  unreadCount: z.number().int().nonnegative(),
  assignedAnalystId: z.string().nullable(),
  waitingSince: z.iso.datetime().nullable(),
});
export type ConversationListItem = z.infer<typeof ConversationListItem>;

export const ConversationDetail = z.object({
  conversation: Conversation,
  employee: Employee,
  messages: z.array(ChatMessage),
  tickets: z.array(TicketView),
  assignedAnalyst: Analyst.nullable(),
});
export type ConversationDetail = z.infer<typeof ConversationDetail>;

export { Affected, Category, Priority, TicketType };
