import { Suspense } from "react";
import { ChatContainer } from "@/components/ChatContainer";
async function ChatState({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  return <ChatContainer variant={state} />;
}
export default function ChatPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  return (
    <Suspense fallback={<div role="status">Carregando atendimento…</div>}>
      <ChatState searchParams={searchParams} />
    </Suspense>
  );
}
