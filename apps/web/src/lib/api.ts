import { ChatStreamEvent, type SendMessageInput } from "@nexo/contracts";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<ApiRequestError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiRequestError(res.status, body.error?.code ?? "error", body.error?.message ?? "Erro inesperado");
  } catch {
    return new ApiRequestError(res.status, "error", "Erro inesperado");
  }
}

/** "read=1" só quando a aba está visível: é o que conta como mensagem lida (confirmação ✓✓). */
export function readParam(): string {
  return typeof document !== "undefined" && document.visibilityState === "visible" ? "read=1" : "read=0";
}

/** fetch tipado para as rotas /api; redireciona para o login se a sessão expirou. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  } catch {
    throw new ApiRequestError(0, "network", "Sem conexão com o servidor.");
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    // Sessão expirada fora de um componente: recarga completa limpa o estado do cliente.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

/**
 * Envia uma mensagem e consome a resposta em SSE. EventSource não suporta POST,
 * então lemos o corpo do fetch e separamos os eventos "data: …\n\n".
 */
export async function streamChat(input: SendMessageInput, onEvent: (e: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiRequestError(0, "network", "Sem conexão com o servidor.");
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401) window.location.assign("/login");
  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = raw
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (!data) continue;
      const parsed = ChatStreamEvent.safeParse(JSON.parse(data));
      if (parsed.success) onEvent(parsed.data);
    }
  }
}
