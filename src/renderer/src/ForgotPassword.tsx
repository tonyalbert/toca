import { useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import { ApiError, forgotPassword, resetPassword, type Account } from "./api";
import { AuthHeading } from "./components/AuthLayout";
import { Button } from "./components/Button";
import { Input } from "./components/Input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "t•••@email.com": mostra só o começo do e-mail */
const masked = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}•••@${domain}`;
};

type Errors = { email?: string; code?: string; password?: string; form?: string };

/**
 * Esqueci a senha, em dois passos: o e-mail (a API manda um código de 6
 * dígitos) e depois o código com a senha nova. Deu certo: já entra.
 */
export function ForgotPassword({
  initialEmail,
  onBack,
  onAuthenticated,
}: {
  initialEmail: string;
  onBack: () => void;
  onAuthenticated: (account: Account) => void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [minutes, setMinutes] = useState(15);
  // Segundos até poder pedir outro código
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) return setErrors({ email: "Digite o e-mail da sua conta." });
    setBusy(true);
    setErrors({});
    try {
      const res = await forgotPassword(value);
      setMinutes(res.expiresInMinutes);
      setWait(res.resendAfterSeconds);
      setStep("code");
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    const problems: Errors = {
      code: digits.length === 6 ? undefined : "O código tem 6 números.",
      password: password.length >= 8 ? undefined : "Use pelo menos 8 caracteres.",
    };
    if (problems.code || problems.password) return setErrors(problems);
    setBusy(true);
    setErrors({});
    try {
      onAuthenticated(await resetPassword(email.trim(), digits, password));
    } catch (err) {
      const message = (err as Error).message;
      setErrors(err instanceof ApiError && err.status === 400 ? { code: message } : { form: message });
      setBusy(false);
    }
  }

  const back = (
    <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start", marginLeft: -12 }} onClick={onBack}>
      <ArrowLeft size={16} aria-hidden="true" />
      Voltar para entrar
    </Button>
  );

  const formError = errors.form && (
    <div className="notice error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      {errors.form}
    </div>
  );

  if (step === "email") {
    return (
      <form onSubmit={send} noValidate>
        {back}
        <AuthHeading title="Esqueceu a senha?">A gente manda um código para você criar uma nova.</AuthHeading>
        <Input
          label="E-mail da conta"
          autoFocus
          type="email"
          maxLength={254}
          autoComplete="email"
          spellCheck={false}
          placeholder="voce@email.com"
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors({});
          }}
        />
        {formError}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? "Enviando…" : "Enviar código"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={reset} noValidate>
      {back}
      <AuthHeading title="Crie uma senha nova">Digite o código que chegou no seu e-mail.</AuthHeading>
      <div className="notice ok" role="status">
        <CircleCheck size={16} aria-hidden="true" />
        <span>
          Se existir uma conta com {masked(email.trim())}, o código chega em instantes. Ele vale por {minutes} minutos.
          Confira também o spam.
        </span>
      </div>
      <Input
        label="Código"
        autoFocus
        className="code-input num"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="000000"
        value={code}
        error={errors.code}
        onChange={(e) => {
          setCode(e.target.value.replace(/[^\d ]/g, ""));
          setErrors((er) => ({ ...er, code: undefined, form: undefined }));
        }}
      />
      <Input
        label="Senha nova"
        type="password"
        maxLength={128}
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres. Os outros PCs conectados vão sair da conta."
        value={password}
        error={errors.password}
        onChange={(e) => {
          setPassword(e.target.value);
          setErrors((er) => ({ ...er, password: undefined }));
        }}
      />
      {formError}
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>
        {busy ? "Salvando…" : "Salvar senha e entrar"}
      </Button>
      <p className="sm muted">
        Não chegou?{" "}
        <button type="button" className="link" disabled={wait > 0 || busy} onClick={() => send()}>
          {wait > 0 ? `Reenviar em ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}` : "Reenviar código"}
        </button>
        {" · "}
        <button
          type="button"
          className="link"
          onClick={() => {
            setStep("email");
            setCode("");
            setErrors({});
          }}
        >
          Trocar e-mail
        </button>
      </p>
    </form>
  );
}
