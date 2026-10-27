import { KeyRound, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import type { Employee } from "@nexo/contracts";
import { EmployeeShell } from "./EmployeeShell";
export function ProfileView({
  employee,
  passwordAgeDays,
  resetRequested,
  onReset,
}: {
  employee: Employee;
  passwordAgeDays: number;
  resetRequested: boolean;
  onReset: () => void;
}) {
  return (
    <EmployeeShell employee={employee} section="perfil">
      <main className="profile-page">
        <div className="profile-content">
          <h1>Meu perfil</h1>
          <p>Seus dados de acesso ao service desk de TI.</p>
          <div className="profile-card profile-data">
            <div>
              <span>Nome</span>
              <strong>{employee.name}</strong>
            </div>
            <div>
              <span>E-mail corporativo</span>
              <strong>{employee.email}</strong>
              <small>
                <LockKeyhole size={15} /> Gerenciado pela TI
              </small>
            </div>
          </div>
          <div className="profile-card password-card">
            <div>
              <span className="password-icon">
                <KeyRound size={22} />
              </span>
              <span>
                <strong>Senha</strong>
                <small>Alterada há {passwordAgeDays} dias</small>
              </span>
              <button type="button" className="button-secondary" onClick={onReset}>
                <RotateCcw size={17} />
                Redefinir senha
              </button>
            </div>
            <p role={resetRequested ? "status" : undefined}>
              <Mail size={17} />
              {resetRequested
                ? `Solicitação de redefinição preparada para ${employee.email}.`
                : `Enviaremos um link de redefinição para ${employee.email}.`}
            </p>
          </div>
        </div>
      </main>
    </EmployeeShell>
  );
}
