import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Affected, Category, CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, TicketType } from "@nexo/contracts";
import { TicketServiceError, TicketServiceUnavailableError } from "../tickets-client/client";
import {
  confirmDraft,
  DraftNotPendingError,
  listMyTickets,
  offerOptions,
  prepareDraft,
  requestHandoff,
  searchKnowledgeBase,
  showTicket,
  type TurnContext,
} from "./actions";
import { isExplicitConfirmation } from "./intents";

/** Erros viram resultado legível para o modelo explicar ao funcionário, sem vazar detalhes. */
async function guarded<T>(fn: () => Promise<T>): Promise<T | { ok: false; erro: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TicketServiceUnavailableError) {
      return { ok: false, erro: "O sistema de chamados está instável agora. Avise o funcionário e sugira tentar de novo em instantes." };
    }
    if (e instanceof TicketServiceError) {
      return { ok: false, erro: e.status === 404 ? "Chamado não encontrado entre os chamados deste funcionário." : e.message };
    }
    if (e instanceof DraftNotPendingError) return { ok: false, erro: e.message };
    throw e;
  }
}

/**
 * Tools criadas por turno, fechando sobre o contexto da sessão. O modelo nunca informa de quem
 * são os chamados: o `employee.id` vem do cookie de sessão.
 */
export function createAgentTools(ctx: TurnContext, userText: string) {
  return {
    buscar_central_ajuda: createTool({
      id: "buscar_central_ajuda",
      description: "Busca artigos na central de ajuda de TI. Use antes de abrir chamado para dúvidas e problemas comuns.",
      inputSchema: z.object({ consulta: z.string().min(2).describe("palavras-chave do problema, ex.: 'vpn erro 809'") }),
      execute: async ({ consulta }) => {
        const hits = await searchKnowledgeBase(ctx, consulta);
        return {
          artigos: hits.map((h) => ({ id: h.article.id, titulo: h.article.title, conteudo: h.article.body, limitacoes: h.article.limits, relevancia: Math.round(h.score * 100) / 100 })),
        };
      },
    }),

    listar_meus_chamados: createTool({
      id: "listar_meus_chamados",
      description: "Lista os chamados do funcionário logado com status e prazo. mostrarSelecao=true exibe uma lista para ele escolher.",
      inputSchema: z.object({
        incluirEncerrados: z.boolean().default(false),
        mostrarSelecao: z.boolean().default(false),
      }),
      execute: ({ incluirEncerrados, mostrarSelecao }) =>
        guarded(async () => {
          const list = await listMyTickets(ctx, { includeClosed: incluirEncerrados, showSelection: mostrarSelecao });
          return {
            chamados: list.map((t) => ({
              id: t.id,
              titulo: t.title,
              status: STATUS_LABEL[t.status],
              prioridade: PRIORITY_LABEL[t.priority],
              categoria: CATEGORY_LABEL[t.category],
              prazo: t.sla.label,
              vencido: t.sla.overdue,
              resolvidoEm: t.resolvedAt,
            })),
          };
        }),
    }),

    consultar_chamado: createTool({
      id: "consultar_chamado",
      description: "Consulta um chamado do funcionário pelo número (INC-xxxxx ou REQ-xxxxx). mostrarCard=true exibe o card do chamado.",
      inputSchema: z.object({ chamado: z.string().regex(/^(INC|REQ)-\d{5}$/i), mostrarCard: z.boolean().default(true) }),
      execute: ({ chamado, mostrarCard }) =>
        guarded(async () => {
          const t = await showTicket(ctx, chamado.toUpperCase(), { card: mostrarCard });
          const last = t.updates.at(-1);
          return {
            id: t.id,
            titulo: t.title,
            descricao: t.description,
            status: STATUS_LABEL[t.status],
            prioridade: PRIORITY_LABEL[t.priority],
            prazo: t.sla.label,
            vencido: t.sla.overdue,
            ultimaAtualizacao: last ? { em: last.at, por: last.authorName, texto: last.text } : null,
          };
        }),
    }),

    oferecer_opcoes: createTool({
      id: "oferecer_opcoes",
      description: "Mostra botões de resposta rápida abaixo da sua mensagem (2 a 5 opções curtas). Use para perguntas fechadas, como quem é afetado.",
      inputSchema: z.object({
        pergunta: z.string().nullable().describe("pergunta em negrito acima dos botões, ex.: 'Quem está sendo afetado?'"),
        opcoes: z.array(z.object({ rotulo: z.string().max(40), valor: z.string().max(60) })).min(2).max(5),
      }),
      execute: async ({ pergunta, opcoes }) => {
        offerOptions(ctx, pergunta, opcoes.map((o) => ({ label: o.rotulo, value: o.valor })));
        return { ok: true };
      },
    }),

    preparar_rascunho: createTool({
      id: "preparar_rascunho",
      description:
        "Monta o rascunho de um chamado para o funcionário conferir (NÃO cria). modo: create (novo), update (complementar chamado aberto), reopen (reabrir resolvido há até 7 dias). A prioridade é calculada pelo sistema a partir dos sinais.",
      inputSchema: z.object({
        modo: z.enum(["create", "update", "reopen"]),
        chamadoAlvo: z.string().regex(/^(INC|REQ)-\d{5}$/i).nullable().describe("obrigatório em update/reopen"),
        tipo: TicketType.describe("INC = algo parou/não funciona; REQ = pedido de acesso/equipamento/software"),
        titulo: z.string().min(5).max(90).describe("curto e específico, ex.: 'VPN não conecta no notebook — erro 809'"),
        descricao: z.string().min(10).max(800).describe("o que acontece, desde quando, o que já tentou, ambiente (SO etc.) e impacto"),
        categoria: Category,
        subcategoria: z.string().max(40).nullable(),
        afetados: Affected.describe("so_eu | equipe | empresa"),
        sinais: z.object({
          impedeTrabalho: z.boolean().describe("algo parou / não consegue trabalhar"),
          compromissoHoje: z.boolean().describe("há reunião/entrega/prazo hoje que depende disso"),
          temAlternativa: z.boolean().describe("existe contorno razoável enquanto não resolve"),
        }),
      }),
      execute: (i) =>
        guarded(async () => {
          const { draft, adjustedBecause } = await prepareDraft(ctx, {
            mode: i.modo,
            targetTicketId: i.chamadoAlvo?.toUpperCase() ?? null,
            type: i.tipo,
            title: i.titulo,
            description: i.descricao,
            category: i.categoria,
            subcategory: i.subcategoria,
            affected: i.afetados,
            signals: { blocksWork: i.sinais.impedeTrabalho, sameDayCommitment: i.sinais.compromissoHoje, hasWorkaround: i.sinais.temAlternativa },
          });
          return {
            rascunho: draft.id,
            modo: draft.mode,
            chamadoAlvo: draft.targetTicketId,
            prioridade: PRIORITY_LABEL[draft.priority],
            prazo: draft.slaLabel,
            observacao: adjustedBecause,
            proximoPasso: "Peça ao funcionário para conferir o rascunho e confirmar. Não diga que o chamado foi criado.",
          };
        }),
    }),

    confirmar_rascunho: createTool({
      id: "confirmar_rascunho",
      description: "Grava o rascunho pendente no sistema de chamados. Só use quando o funcionário confirmou explicitamente nesta mensagem.",
      inputSchema: z.object({ rascunho: z.string() }),
      execute: ({ rascunho }) =>
        guarded(async () => {
          // Guardrail de código: sem confirmação explícita na mensagem atual, não grava.
          if (!isExplicitConfirmation(userText)) {
            ctx.recorder.guardrails.add("Tentativa de gravar sem confirmação explícita bloqueada");
            return { ok: false as const, erro: "O funcionário ainda não confirmou explicitamente. Peça para conferir e confirmar o rascunho." };
          }
          const { ticket, draft } = await confirmDraft(ctx, rascunho);
          return { ok: true as const, chamado: ticket.id, modo: draft.mode, prioridade: PRIORITY_LABEL[ticket.priority], prazo: ticket.sla.label };
        }),
    }),

    transferir_para_analista: createTool({
      id: "transferir_para_analista",
      description: "Transfere a conversa para um analista humano (o agent fica pausado). Use quando o funcionário pedir, em caso crítico, chamado vencido ou quando você não tiver segurança.",
      inputSchema: z.object({
        motivo: z.enum(["pedido_do_funcionario", "caso_critico", "chamado_vencido", "baixa_confianca"]),
        resumo: z.string().min(20).max(600).describe("resumo do caso para o analista não precisar perguntar tudo de novo"),
        chamado: z.string().regex(/^(INC|REQ)-\d{5}$/i).nullable(),
      }),
      execute: async ({ motivo, resumo, chamado }) => {
        const req = requestHandoff(ctx, motivo, resumo, chamado?.toUpperCase() ?? null, motivo === "caso_critico");
        return { ok: true, equipe: `Suporte ${req.team}`, observacao: "A transferência é aplicada ao final desta resposta. Avise o funcionário que um analista vai falar com ele." };
      },
    }),
  };
}
