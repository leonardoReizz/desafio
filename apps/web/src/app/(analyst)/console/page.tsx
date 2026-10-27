import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ConsoleContainer } from "@/components/ConsoleContainer";
import { currentUser } from "@/server/auth/session";

async function ConsoleGate() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "analyst") redirect("/chat");
  return <ConsoleContainer analyst={user.analyst} />;
}

export default function ConsolePage() {
  return (
    <Suspense fallback={<div role="status">Carregando conversas…</div>}>
      <ConsoleGate />
    </Suspense>
  );
}
