import { useState } from "react";
import { login, register, type User } from "./api";

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,20}$/;

/** Entrar ou criar conta (cadastro exige código de convite) */
export function AuthScreen({
  version,
  notice,
  onAuthenticated,
}: {
  version: string | null;
  /** Mensagem ao abrir (ex.: sessão expirada) */
  notice?: string | null;
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  function validate(): string | null {
    if (!isRegister) return username.trim() && password ? null : "Preencha usuário e senha";
    if (!USERNAME_PATTERN.test(username.trim()))
      return "Usuário: 3 a 20 caracteres, só letras sem acento, números, _ e .";
    if (!displayName.trim()) return "Escolha como você quer aparecer para os outros";
    if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres";
    if (!inviteCode.trim()) return "Informe o código de convite";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const user = isRegister
        ? await register({
            username: username.trim(),
            displayName: displayName.trim(),
            password,
            inviteCode: inviteCode.trim(),
          })
        : await login(username.trim(), password);
      onAuthenticated(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const switchMode = () => {
    setMode(isRegister ? "login" : "register");
    setError(null);
  };

  return (
    <div className="name-screen">
      <form className="name-card auth-card" onSubmit={submit} noValidate>
        <h1>Toca</h1>
        <p>{isRegister ? "Crie sua conta" : "Que bom te ver de novo!"}</p>
        {notice && !error && <div className="form-notice">{notice}</div>}

        <label className="auth-field">
          <span className="field-label">Usuário</span>
          <input
            autoFocus
            maxLength={20}
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        {isRegister && (
          <label className="auth-field">
            <span className="field-label">Nome de exibição</span>
            <input maxLength={32} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
        )}

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
            <span className="field-label">Código de convite</span>
            <input spellCheck={false} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
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
