import { Suspense } from "react";
import { ConsoleContainer } from "@/components/ConsoleContainer";
async function ConsoleState({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  return <ConsoleContainer initialAssumed={state === "assumido"} />;
}
export default function ConsolePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  return (
    <Suspense fallback={<div role="status">Carregando conversas…</div>}>
      <ConsoleState searchParams={searchParams} />
    </Suspense>
  );
}
