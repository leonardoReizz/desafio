import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ProfileContainer } from "@/components/ProfileContainer";
import { currentUser } from "@/server/auth/session";

async function ProfileGate() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/console");
  const passwordAgeDays = Math.max(0, Math.floor((Date.now() - Date.parse(user.employee.passwordChangedAt)) / 86_400_000));
  return <ProfileContainer employee={user.employee} passwordAgeDays={passwordAgeDays} />;
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div role="status">Carregando perfil…</div>}>
      <ProfileGate />
    </Suspense>
  );
}
