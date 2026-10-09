import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { ApiError, updateProfile, type Account } from "./api";
import { AuthHeading, AuthLayout } from "./components/AuthLayout";
import { Button } from "./components/Button";
import { Input } from "./components/Input";

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,20}$/;

/** Depois do cadastro: primeiro o @ (não muda depois), depois o nome de exibição */
export function ProfileSetup({
  account,
  version,
  onDone,
  onCancel,
}: {
  account: Account;
  version: string | null;
  onDone: (account: Account) => void;
  /** Sai da conta (ex.: e-mail errado) */
  onCancel: () => void;
}) {
  const step = account.username ? "displayName" : "username";
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (step === "username" && !USERNAME_PATTERN.test(trimmed)) {
      return setFieldError("De 3 a 20 caracteres: letras sem acento, números, _ e .");
    }
    if (step === "displayName" && !trimmed) return setFieldError("Escolha um nome.");
    setBusy(true);
    setFieldError(null);
    setFormError(null);
    try {
      const updated = await updateProfile(step === "username" ? { username: trimmed } : { displayName: trimmed });
      setValue("");
      setBusy(false);
      onDone(updated);
    } catch (err) {
      // @ já usado: o erro fica no campo
      if (err instanceof ApiError && err.status === 409) setFieldError(err.message);
      else setFormError((err as Error).message);
      setBusy(false);
    }
  }

  const onChange = (next: string) => {
    setValue(next);
    setFieldError(null);
  };

  return (
    <AuthLayout version={version}>
      <form key={step} onSubmit={submit} noValidate>
        {step === "username" ? (
          <>
            <AuthHeading eyebrow="Passo 1 de 2" title="Seu @usuário">
              É como os amigos vão te achar. Não dá para trocar depois.
            </AuthHeading>
            <Input
              label="@usuário"
              prefix="@"
              autoFocus
              maxLength={20}
              spellCheck={false}
              autoComplete="off"
              placeholder="usuario"
              value={value}
              hint="De 3 a 20 caracteres: letras sem acento, números, _ e ."
              error={fieldError}
              onChange={(e) => onChange(e.target.value.replace(/^@/, ""))}
            />
          </>
        ) : (
          <>
            <AuthHeading eyebrow="Passo 2 de 2" title="Como te chamam?">
              É o nome que aparece nas salas. Dá para trocar quando quiser.
            </AuthHeading>
            <Input
              label="Nome"
              autoFocus
              maxLength={32}
              placeholder="Como te chamam"
              value={value}
              error={fieldError}
              onChange={(e) => onChange(e.target.value)}
            />
          </>
        )}

        {formError && (
          <div className="notice error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {formError}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" block disabled={busy || !value.trim()}>
          {busy ? "Aguarde…" : step === "username" ? "Continuar" : "Entrar na toca"}
        </Button>
        <p className="sm muted">
          {account.email ? `Entrou como ${account.email}. ` : ""}
          <button type="button" className="link" onClick={onCancel}>
            Sair
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
