import { useState } from "react";
import { login, register, type Account } from "./api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Entrar (e-mail ou @) ou criar conta (e-mail e senha; o @ e o nome vêm depois) */
export function AuthScreen({
  version,
  notice,
  onAuthenticated,
}: {
  version: string | null;
  /** Mensagem ao abrir (ex.: sessão expirada) */
  notice?: string | null;
  onAuthenticated: (account: Account) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  function validate(): string | null {
    if (!isRegister) return email.trim() && password ? null : "Preencha o e-mail e a senha";
    if (!EMAIL_PATTERN.test(email.trim())) return "Digite um e-mail válido";
    if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres";
    if (password !== confirm) return "As senhas não são iguais";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const account = isRegister ? await register(email.trim(), password) : await login(email.trim(), password);
      onAuthenticated(account);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const switchMode = () => {
    setMode(isRegister ? "login" : "register");
    setConfirm("");
    setError(null);
  };

  return (
    <div className="name-screen">
      <form className="name-card auth-card" onSubmit={submit} noValidate>
        <h1>Toca</h1>
        <p>{isRegister ? "Crie sua conta" : "Que bom te ver de novo!"}</p>
        {notice && !error && <div className="form-notice">{notice}</div>}

        <label className="auth-field">
          <span className="field-label">{isRegister ? "E-mail" : "E-mail ou usuário"}</span>
          <input
            autoFocus
            type={isRegister ? "email" : "text"}
            maxLength={254}
            autoComplete={isRegister ? "email" : "username"}
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="auth-field">
          <span className="field-label">Senha</span>
          <input
            type="password"
            maxLength={128}
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {isRegister && (
          <label className="auth-field">
            <span className="field-label">Confirme a senha</span>
            <input
              type="password"
              maxLength={128}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Aguarde…" : isRegister ? "Criar conta" : "Entrar"}
        </button>
        <button type="button" className="link-button" onClick={switchMode}>
          {isRegister ? "Já tenho conta" : "Criar uma conta"}
        </button>
        {version && <div className="version">v{version}</div>}
      </form>
    </div>
  );
}
