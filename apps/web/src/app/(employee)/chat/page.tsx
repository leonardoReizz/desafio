import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChatContainer } from "@/components/ChatContainer";
import { currentUser } from "@/server/auth/session";

async function ChatGate() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/console");
  return <ChatContainer employee={user.employee} />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div role="status">Carregando atendimento…</div>}>
      <ChatGate />
    </Suspense>
  );
}
