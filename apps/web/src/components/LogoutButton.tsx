"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api";

/** Encerra a sessão no servidor (apaga o token) antes de voltar ao login. */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={compact ? "icon-button rail-logout" : "sidebar-link logout"}
      aria-label="Sair"
      disabled={pending}
      onClick={() => {
        setPending(true);
        api("/api/auth/logout", { method: "POST" })
          .catch(() => {})
          .finally(() => router.replace("/login"));
      }}
    >
      <LogOut size={compact ? 19 : 18} />
      {!compact && "Sair"}
    </button>
  );
}
