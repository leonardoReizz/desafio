"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoginView } from "./LoginView";
export function LoginContainer() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function submit(email: string, password: string) {
    if (email.toLowerCase() !== "ana.souza@nexo.com.br" && email.toLowerCase() !== "rafael.lima@nexo.com.br") {
      setError("E-mail não encontrado");
      return;
    }
    if (!password) return;
    setError(null);
    setPending(true);
    window.setTimeout(() => router.push(email.toLowerCase().startsWith("rafael") ? "/console" : "/chat"), 350);
  }
  return <LoginView onSubmit={submit} pending={pending} error={error} />;
}
