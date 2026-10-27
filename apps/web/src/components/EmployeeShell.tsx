import Link from "next/link";
import { ChevronRight, LogOut, MessageSquare, UserRound } from "lucide-react";
import type { Employee } from "@nexo/contracts";
import { Brand } from "./Brand";

export function EmployeeShell({
  employee,
  section,
  status,
  children,
}: {
  employee: Employee;
  section: "chat" | "perfil";
  status?: "agent" | "waiting_human" | "human" | "closed";
  children: React.ReactNode;
}) {
  return (
    <div className="employee-shell">
      <aside className="employee-sidebar">
        <Link className="sidebar-brand" href="/chat">
          <Brand />
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/chat" className={`sidebar-link ${section === "chat" ? "active" : ""}`}>
            <MessageSquare size={19} />
            Atendimento
          </Link>
          <Link href="/perfil" className={`sidebar-link ${section === "perfil" ? "active" : ""}`}>
            <UserRound size={19} />
            Meu perfil
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="avatar avatar-ana">AS</span>
            <span>
              <strong>{employee.name}</strong>
              <small>{employee.email}</small>
            </span>
          </div>
          <Link className="sidebar-link logout" href="/login">
            <LogOut size={18} />
            Sair
          </Link>
        </div>
      </aside>
      <div className="employee-main">
        <header className="employee-topbar">
          <div className="breadcrumb">
            Service desk de TI <ChevronRight size={16} />
            <strong>{section === "chat" ? "Atendimento" : "Meu perfil"}</strong>
          </div>
          {section === "chat" && (
            <span className="online-pill">
              <i />
              {status === "agent"
                ? "Assistente online"
                : status === "human"
                  ? "Com um analista"
                  : status === "closed"
                    ? "Atendimento encerrado"
                    : "Aguardando analista"}
            </span>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
