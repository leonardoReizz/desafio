"use client";
import { useState } from "react";
import { employee } from "@/fixtures/demo";
import { ProfileView } from "./ProfileView";
export function ProfileContainer() {
  const [resetRequested, setResetRequested] = useState(false);
  return <ProfileView employee={employee} resetRequested={resetRequested} onReset={() => setResetRequested(true)} />;
}
