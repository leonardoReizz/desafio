import "server-only";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  ChatMessage,
  Conversation,
  DecisionTrace,
  TicketDraft,
  UiBlock,
  type ConversationStatus,
  type HandoffReason,
  type MessageRole,
} from "@nexo/contracts";
import { z } from "zod";

interface ConversationRow {
  id: string;
  employee_id: string;
  status: string;
  handoff_reason: string | null;
  handoff_summary: string | null;
  handoff_at: string | null;
  assigned_analyst_id: string | null;
  related_ticket_id: string | null;
  last_confidence: number | null;
  user_message_count: number;
  analyst_read_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: string;
  text: string;
  author_name: string | null;
  author_badge: string | null;
  blocks_json: string;
  trace_json: string | null;
  created_at: string;
}

export interface StoredConversation extends Conversation {
  handoffAt: string | null;
  analystReadAt: string | null;
}

export interface NewMessage {
  role: MessageRole;
  text: string;
  authorName?: string | null;
  authorBadge?: string | null;
  blocks?: UiBlock[];
  trace?: DecisionTrace | null;
}

const Blocks = z.array(UiBlock);

function toConversation(r: ConversationRow): StoredConversation {
  return {
    ...Conversation.parse({
      id: r.id,
      employeeId: r.employee_id,
      status: r.status,
      handoffReason: r.handoff_reason,
      handoffSummary: r.handoff_summary,
      assignedAnalystId: r.assigned_analyst_id,
      relatedTicketId: r.related_ticket_id,
      lastConfidence: r.last_confidence,
      userMessageCount: r.user_message_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
    handoffAt: r.handoff_at,
    analystReadAt: r.analyst_read_at,
  };
}

function toMessage(r: MessageRow): ChatMessage {
  return ChatMessage.parse({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    text: r.text,
    authorName: r.author_name,
    authorBadge: r.author_badge,
    blocks: Blocks.parse(JSON.parse(r.blocks_json)),
    trace: r.trace_json ? DecisionTrace.parse(JSON.parse(r.trace_json)) : null,
    createdAt: r.created_at,
  });
}

export class ConversationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(employeeId: string): StoredConversation {
    const id = `conv_${randomUUID()}`;
    const at = this.now().toISOString();
    this.db
      .prepare("INSERT INTO conversations (id, employee_id, status, created_at, updated_at) VALUES (?, ?, 'agent', ?, ?)")
      .run(id, employeeId, at, at);
    return this.getOwned(id, employeeId)!;
  }

  get(id: string): StoredConversation | null {
    const r = this.db.prepare<[string], ConversationRow>("SELECT * FROM conversations WHERE id = ?").get(id);
    return r ? toConversation(r) : null;
  }

  /** Retorna a conversa só se for do funcionário — base da regra de privacidade. */
  getOwned(id: string, employeeId: string): StoredConversation | null {
    const r = this.db
      .prepare<[string, string], ConversationRow>("SELECT * FROM conversations WHERE id = ? AND employee_id = ?")
      .get(id, employeeId);
    return r ? toConversation(r) : null;
  }

  /** "Voltar outro dia e continuar de onde parei": última conversa não encerrada. */
  latestOpenFor(employeeId: string): StoredConversation | null {
    const r = this.db
      .prepare<[string], ConversationRow>(
        "SELECT * FROM conversations WHERE employee_id = ? AND status != 'closed' ORDER BY updated_at DESC LIMIT 1",
      )
      .get(employeeId);
    return r ? toConversation(r) : null;
  }

  listAll(): StoredConversation[] {
    return this.db
      .prepare<[], ConversationRow>("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200")
      .all()
      .map(toConversation);
  }

  update(
    id: string,
    patch: Partial<{
      status: ConversationStatus;
      handoffReason: HandoffReason | null;
      handoffSummary: string | null;
      handoffAt: string | null;
      assignedAnalystId: string | null;
      relatedTicketId: string | null;
      lastConfidence: number | null;
      analystReadAt: string | null;
    }>,
  ): void {
    const cols: Record<string, string> = {
      status: "status",
      handoffReason: "handoff_reason",
      handoffSummary: "handoff_summary",
      handoffAt: "handoff_at",
      assignedAnalystId: "assigned_analyst_id",
      relatedTicketId: "related_ticket_id",
      lastConfidence: "last_confidence",
      analystReadAt: "analyst_read_at",
    };
    const entries = Object.entries(patch).filter(([k]) => k in cols);
    if (entries.length === 0) return;
    const sets = entries.map(([k]) => `${cols[k]} = @${k}`).join(", ");
    this.db.prepare(`UPDATE conversations SET ${sets}, updated_at = @updatedAt WHERE id = @id`).run({
      ...Object.fromEntries(entries),
      updatedAt: this.now().toISOString(),
      id,
    });
  }

  addMessage(conversationId: string, m: NewMessage): ChatMessage {
    return this.db.transaction(() => {
      const seqRow = this.db
        .prepare<[string], { s: number | null }>("SELECT MAX(seq) AS s FROM messages WHERE conversation_id = ?")
        .get(conversationId);
      const id = `msg_${randomUUID()}`;
      const at = this.now().toISOString();
      this.db
        .prepare(
          `INSERT INTO messages (id, conversation_id, seq, role, text, author_name, author_badge, blocks_json, trace_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          conversationId,
          (seqRow?.s ?? 0) + 1,
          m.role,
          m.text,
          m.authorName ?? null,
          m.authorBadge ?? null,
          JSON.stringify(m.blocks ?? []),
          m.trace ? JSON.stringify(m.trace) : null,
          at,
        );
      const bump = m.role === "user" ? ", user_message_count = user_message_count + 1" : "";
      this.db.prepare(`UPDATE conversations SET updated_at = ?${bump} WHERE id = ?`).run(at, conversationId);
      return this.getMessage(id)!;
    })();
  }

  getMessage(id: string): ChatMessage | null {
    const r = this.db.prepare<[string], MessageRow>("SELECT * FROM messages WHERE id = ?").get(id);
    return r ? toMessage(r) : null;
  }

  /** Atualiza blocos de uma mensagem (ex.: rascunho confirmado muda o card). */
  updateMessageBlocks(id: string, blocks: UiBlock[]): void {
    this.db.prepare("UPDATE messages SET blocks_json = ? WHERE id = ?").run(JSON.stringify(Blocks.parse(blocks)), id);
  }

  messages(conversationId: string, afterSeq = 0): ChatMessage[] {
    return this.db
      .prepare<[string, number], MessageRow>("SELECT * FROM messages WHERE conversation_id = ? AND seq > ? ORDER BY seq ASC")
      .all(conversationId, afterSeq)
      .map(toMessage);
  }

  recentMessages(conversationId: string, limit: number): ChatMessage[] {
    return this.db
      .prepare<[string, number], MessageRow>("SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?")
      .all(conversationId, limit)
      .map(toMessage)
      .reverse();
  }

  // ---- Rascunhos ----

  saveDraft(conversationId: string, employeeId: string, draft: TicketDraft): void {
    const at = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO drafts (id, conversation_id, employee_id, data_json, status, created_at, updated_at)
         VALUES (@id, @conversationId, @employeeId, @data, @status, @at, @at)
         ON CONFLICT(id) DO UPDATE SET data_json = @data, status = @status, updated_at = @at
         WHERE drafts.conversation_id = excluded.conversation_id`,
      )
      .run({ id: draft.id, conversationId, employeeId, data: JSON.stringify(draft), status: draft.status, at });
  }

  getDraft(id: string, conversationId: string, employeeId: string): TicketDraft | null {
    const r = this.db
      .prepare<[string, string, string], { data_json: string }>(
        "SELECT data_json FROM drafts WHERE id = ? AND conversation_id = ? AND employee_id = ?",
      )
      .get(id, conversationId, employeeId);
    return r ? TicketDraft.parse(JSON.parse(r.data_json)) : null;
  }

  pendingDraft(conversationId: string): TicketDraft | null {
    const r = this.db
      .prepare<[string], { data_json: string }>(
        "SELECT data_json FROM drafts WHERE conversation_id = ? AND status = 'pending' ORDER BY updated_at DESC LIMIT 1",
      )
      .get(conversationId);
    return r ? TicketDraft.parse(JSON.parse(r.data_json)) : null;
  }

  cancelPendingDrafts(conversationId: string): void {
    const pending = this.db
      .prepare<[string], { data_json: string }>("SELECT data_json FROM drafts WHERE conversation_id = ? AND status = 'pending'")
      .all(conversationId);
    for (const p of pending) {
      const d = TicketDraft.parse(JSON.parse(p.data_json));
      this.saveDraft(conversationId, "", { ...d, status: "cancelled" });
    }
  }

  /** Mensagem que contém o card de um rascunho (para atualizar o card ao confirmar/cancelar). */
  findMessageWithDraft(conversationId: string, draftId: string): ChatMessage | null {
    const rows = this.db
      .prepare<[string, string], MessageRow>(
        "SELECT * FROM messages WHERE conversation_id = ? AND blocks_json LIKE ? ORDER BY seq DESC LIMIT 1",
      )
      .all(conversationId, `%"id":"${draftId}"%`);
    return rows[0] ? toMessage(rows[0]) : null;
  }
}
