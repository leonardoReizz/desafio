"use client";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Brand } from "./Brand";
export function LoginForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (email: string, password: string, remember: boolean) => void;
  pending: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("nexo2026demo");
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  return (
    <form
      className="login-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email, password, remember);
      }}
    >
      <h1>Entrar</h1>
      <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>
      <label htmlFor="login-email">E-mail corporativo</label>
      <div className={`login-field ${error ? "invalid" : ""}`}>
        <Mail size={20} />
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
      <div className="password-label">
        <label htmlFor="login-password">Senha</label>
        <button type="button" onClick={() => alert("Ligue no ramal 4000 para redefinir sua senha.")}>
          Esqueci minha senha
        </button>
      </div>
      <div className="login-field password-field">
        <LockKeyhole size={20} />
        <input
          id="login-password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="button" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <label className="remember">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
        Manter conectado neste computador
      </label>
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
        <ArrowRight size={19} />
      </button>
      <div className="login-form-rule" />
    </form>
  );
}
export function LoginView({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (email: string, password: string, remember: boolean) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand inverse />
        <div className="login-story-middle">
          <span className="story-kicker">Service desk de TI da Nexo</span>
          <h1>Seu problema de TI, resolvido em uma conversa.</h1>
          <p>
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando
            precisa.
          </p>
          <div className="mini-chat">
            <div className="mini-user">Meu notebook não conecta na VPN. Erro 809.</div>
            <div className="mini-trace">
              <strong>Nexo Assist</strong> &nbsp;consultou seus chamados · criou um chamado
            </div>
            <div className="mini-agent">Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.</div>
            <div className="mini-ticket">
              <i /> <strong>INC-20517</strong> &nbsp;Rede e VPN · Alta · em até 4 h
            </div>
          </div>
        </div>
        <div className="login-stats">
          <div>
            <strong>8 s</strong>
            <span>primeira resposta, em média</span>
          </div>
          <div>
            <strong>72%</strong>
            <span>resolvidos sem fila</span>
          </div>
          <div>
            <strong>
              6 <i />
            </strong>
            <span>analistas online agora</span>
          </div>
        </div>
      </section>
      <section className="login-right">
        <div className="login-help">
          Problema para entrar? <a href="tel:4000">Ligue no ramal 4000</a>
        </div>
        <LoginForm onSubmit={onSubmit} pending={pending} error={error} />
        <footer>
          <span>© 2026 Nexo · Service desk de TI</span>
          <a href="#privacidade">Privacidade e uso de dados</a>
        </footer>
      </section>
    </main>
  );
}
