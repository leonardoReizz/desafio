"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError } from "@/lib/api";
import { LoginView } from "./LoginView";

export function LoginContainer() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(email: string, password: string, remember: boolean) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await api<{ redirectTo: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      router.replace(r.redirectTo);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Não foi possível entrar.");
      setPending(false);
    }
  }

  return <LoginView onSubmit={(e, p, r) => void submit(e, p, r)} pending={pending} error={error} />;
}
