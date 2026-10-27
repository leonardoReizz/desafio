"use client";
import { useState } from "react";
import type { Employee } from "@nexo/contracts";
import { ProfileView } from "./ProfileView";

export function ProfileContainer({ employee, passwordAgeDays }: { employee: Employee; passwordAgeDays: number }) {
  // A redefinição de senha é feita pelo portal da TI; aqui só confirmamos o envio do link.
  const [resetRequested, setResetRequested] = useState(false);
  return (
    <ProfileView
      employee={employee}
      passwordAgeDays={passwordAgeDays}
      resetRequested={resetRequested}
      onReset={() => setResetRequested(true)}
    />
  );
}
