import { useState } from "react";
import { CircleAlert, Info } from "lucide-react";
import { ApiError, login, register, type Account } from "./api";
import { AuthHeading, AuthLayout } from "./components/AuthLayout";
import { Button } from "./components/Button";
import { Input } from "./components/Input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { login?: string; password?: string; form?: string };

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
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const isRegister = mode === "register";

  function validate(): Errors {
    const value = loginValue.trim();
    if (!isRegister) {
      return {
        login: value ? undefined : "Digite seu e-mail ou @usuário.",
        password: password ? undefined : "Digite sua senha.",
      };
    }
    return {
      login: EMAIL_PATTERN.test(value) ? undefined : "Digite um e-mail válido.",
      password: password.length >= 8 ? undefined : "Use pelo menos 8 caracteres.",
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems = validate();
    if (problems.login || problems.password) return setErrors(problems);
    setBusy(true);
    setErrors({});
    try {
      const value = loginValue.trim();
      onAuthenticated(isRegister ? await register(value, password) : await login(value, password));
    } catch (err) {
      const message = (err as Error).message;
      // E-mail já cadastrado: o erro fica no próprio campo
      setErrors(isRegister && err instanceof ApiError && err.status === 409 ? { login: message } : { form: message });
      setBusy(false);
    }
  }

  const switchMode = () => {
    setMode(isRegister ? "login" : "register");
    setPassword("");
    setErrors({});
  };

  return (
    <AuthLayout version={version}>
      <form onSubmit={submit} noValidate key={mode}>
        {isRegister ? (
          <AuthHeading title="Criar conta">Primeiro, seu e-mail e uma senha. Depois você escolhe seu @.</AuthHeading>
        ) : (
          <AuthHeading title="Entrar">Bom te ver de novo.</AuthHeading>
        )}

        {notice && !errors.form && (
          <div className="notice info" role="status">
            <Info size={16} aria-hidden="true" />
            {notice}
          </div>
        )}

        <Input
          label={isRegister ? "E-mail" : "E-mail ou @usuário"}
          autoFocus
          type={isRegister ? "email" : "text"}
          maxLength={254}
          autoComplete={isRegister ? "email" : "username"}
          spellCheck={false}
          placeholder={isRegister ? "voce@email.com" : undefined}
          value={loginValue}
          error={errors.login}
          onChange={(e) => {
            setLoginValue(e.target.value);
            setErrors((er) => ({ ...er, login: undefined }));
          }}
        />

        <Input
          label="Senha"
          type="password"
          maxLength={128}
          autoComplete={isRegister ? "new-password" : "current-password"}
          value={password}
          hint={isRegister ? "Pelo menos 8 caracteres." : undefined}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((er) => ({ ...er, password: undefined }));
          }}
        />

        {errors.form && (
          <div className="notice error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {errors.form}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? "Aguarde…" : isRegister ? "Continuar" : "Entrar"}
        </Button>

        {isRegister ? (
          <p className="sm muted">
            Já tem conta?{" "}
            <button type="button" className="link" onClick={switchMode}>
              Entrar
            </button>
          </p>
        ) : (
          <>
            <div className="divider">ainda não tem conta?</div>
            <Button block onClick={switchMode}>
              Criar conta
            </Button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
