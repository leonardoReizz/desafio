import { Check, CheckCheck } from "lucide-react";

/** ✓ cinza = enviada · ✓✓ azul = lida pelo outro lado. */
export function ReadReceipt({ read }: { read: boolean }) {
  return read ? (
    <CheckCheck size={14} className="receipt read" aria-label="Lida" />
  ) : (
    <Check size={14} className="receipt sent" aria-label="Enviada" />
  );
}

/** Lida se o outro lado leu a conversa depois que a mensagem foi enviada. */
export function isReadBy(readAt: string | null, sentAt: string): boolean {
  return readAt !== null && readAt >= sentAt;
}
