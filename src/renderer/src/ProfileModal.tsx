import { useState } from "react";
import { updateProfile, type Profile } from "./api";
import { Avatar } from "./components/Avatar";
import { Modal } from "./components/Modal";
import { useTheme, type ThemePreference } from "./theme";
import { Select } from "./components/Select";

/** Minha conta: troca o nome de exibição (o @ e o e-mail só aparecem) */
export function ProfileModal({
  me,
  onSaved,
  onSignOut,
  onClose,
}: {
  me: Profile;
  onSaved: (me: Profile) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(me.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();
  const trimmed = name.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || trimmed === me.displayName) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile({ displayName: trimmed });
      onSaved({ ...me, ...updated, username: me.username, displayName: updated.displayName ?? trimmed });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Minha conta" onClose={onClose}>
      <div className="profile-head">
        <Avatar kind={me.avatar} size={56} mine />
        <div>
          <div className="person-name">{trimmed || me.displayName}</div>
          <div className="muted-text">@{me.username}</div>
        </div>
      </div>

      <form className="modal-form" onSubmit={save}>
        <label className="form-field">
          <span className="field-label">Nome de exibição</span>
          <input autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-field">
          <span className="field-label">E-mail</span>
          <div className="muted-text selectable">{me.email ?? "não cadastrado"}</div>
        </div>
        {/* Provisório: vai para Configurações > Aparência na etapa (g) do redesign */}
        <Select<ThemePreference>
          label="Aparência"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "dark", label: "Escuro" },
            { value: "light", label: "Claro" },
            { value: "system", label: "Sistema (igual ao Windows)" },
          ]}
        />
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions spread">
          <button type="button" className="secondary danger-text" onClick={onSignOut}>
            Sair da conta
          </button>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary" disabled={busy || !trimmed || trimmed === me.displayName}>
              Salvar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
