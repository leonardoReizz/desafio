import { z } from "zod";

/** Anexo A: INC = algo parou / não funciona; REQ = pedido de acesso, equipamento ou software. */
export const TicketType = z.enum(["INC", "REQ"]);
export type TicketType = z.infer<typeof TicketType>;

export const Category = z.enum(["acesso", "rede_vpn", "hardware", "software", "email", "outros"]);
export type Category = z.infer<typeof Category>;

export const CATEGORY_LABEL: Record<Category, string> = {
  acesso: "Acesso",
  rede_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  outros: "Outros",
};

export const Priority = z.enum(["critica", "alta", "media", "baixa"]);
export type Priority = z.infer<typeof Priority>;

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Quem é afetado — entrada do cálculo de impacto. */
export const Affected = z.enum(["so_eu", "equipe", "empresa"]);
export type Affected = z.infer<typeof Affected>;

export const AFFECTED_LABEL: Record<Affected, string> = {
  so_eu: "Somente você",
  equipe: "Sua equipe",
  empresa: "Toda a empresa",
};

export const TicketStatus = z.enum([
  "aberto",
  "em_andamento",
  "aguardando_analista",
  "aguardando_usuario",
  "aprovado",
  "resolvido",
  "fechado",
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  aguardando_usuario: "Aguardando você",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

/** Status em que o chamado ainda está "aberto" para efeito de duplicidade e SLA. */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  "aberto",
  "em_andamento",
  "aguardando_analista",
  "aguardando_usuario",
  "aprovado",
];

export const TicketUpdate = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  author: z.enum(["funcionario", "agent", "analista", "sistema"]),
  authorName: z.string(),
  text: z.string(),
});
export type TicketUpdate = z.infer<typeof TicketUpdate>;

export const Ticket = z.object({
  id: z.string().regex(/^(INC|REQ)-\d{5}$/),
  type: TicketType,
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(4000),
  category: Category,
  subcategory: z.string().max(60).nullable(),
  priority: Priority,
  affected: Affected,
  status: TicketStatus,
  requesterId: z.string(),
  assignedTeam: z.enum(["N1", "N2"]).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Última resposta/atualização do service desk — base do prazo (Anexo A). */
  lastServiceUpdateAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  updates: z.array(TicketUpdate),
});
export type Ticket = z.infer<typeof Ticket>;

export const SlaInfo = z.object({
  dueAt: z.iso.datetime().nullable(),
  overdue: z.boolean(),
  /** Ex.: "resposta até 13:43", "prazo vencido", "3 dias úteis". */
  label: z.string(),
});
export type SlaInfo = z.infer<typeof SlaInfo>;

/** Visão do chamado já com SLA calculado, como a UI e o agent consomem. */
export const TicketView = Ticket.extend({ sla: SlaInfo });
export type TicketView = z.infer<typeof TicketView>;

export const TicketSummary = Ticket.pick({
  id: true,
  type: true,
  title: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({ sla: SlaInfo });
export type TicketSummary = z.infer<typeof TicketSummary>;

// ---- Ticket service HTTP API (services/tickets) ----

export const CreateTicketInput = z.object({
  type: TicketType,
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(4000),
  category: Category,
  subcategory: z.string().max(60).nullable().default(null),
  priority: Priority,
  affected: Affected,
  requesterId: z.string(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

export const AddUpdateInput = z.object({
  author: TicketUpdate.shape.author,
  authorName: z.string(),
  text: z.string().min(1).max(4000),
  /** Reabrir chamado resolvido há até 7 dias. */
  reopen: z.boolean().default(false),
  priority: Priority.optional(),
});
export type AddUpdateInput = z.infer<typeof AddUpdateInput>;

export const TransferInput = z.object({
  team: z.enum(["N1", "N2"]),
  summary: z.string().min(1).max(4000),
});
export type TransferInput = z.infer<typeof TransferInput>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;
