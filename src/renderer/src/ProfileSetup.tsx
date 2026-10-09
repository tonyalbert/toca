import { useState } from "react";
import { updateProfile, type Account } from "./api";

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,20}$/;

/** Depois do cadastro: primeiro o @ (não muda depois), depois o nome de exibição */
export function ProfileSetup({
  account,
  onDone,
  onCancel,
}: {
  account: Account;
  onDone: (account: Account) => void;
  /** Sai da conta (ex.: e-mail errado) */
  onCancel: () => void;
}) {
  const step = account.username ? "displayName" : "username";
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (step === "username" && !USERNAME_PATTERN.test(trimmed)) {
      return setError("De 3 a 20 caracteres: letras sem acento, números, _ e .");
    }
    if (step === "displayName" && !trimmed) return setError("Escolha um nome");
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile(step === "username" ? { username: trimmed } : { displayName: trimmed });
      setValue("");
      setBusy(false);
      onDone(updated);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="name-screen">
      <form key={step} className="name-card auth-card" onSubmit={submit} noValidate>
        <div className="steps">Passo {step === "username" ? 1 : 2} de 2</div>
        {step === "username" ? (
          <>
            <h1>Seu @</h1>
            <p>É como seus amigos vão te encontrar. Não dá para trocar depois.</p>
            <label className="auth-field">
              <span className="field-label">Nome de usuário</span>
              <div className="at-input">
                <span>@</span>
                <input
                  autoFocus
                  maxLength={20}
                  spellCheck={false}
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/^@/, ""))}
                />
              </div>
            </label>
          </>
        ) : (
          <>
            <h1>Como te chamam?</h1>
            <p>É o nome que aparece nas salas. Você pode trocar quando quiser.</p>
            <label className="auth-field">
              <span className="field-label">Nome de exibição</span>
              <input autoFocus maxLength={32} value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="primary" disabled={busy || !value.trim()}>
          {busy ? "Aguarde…" : "Continuar"}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          sair{account.email ? ` (${account.email})` : ""}
        </button>
      </form>
    </div>
  );
}
