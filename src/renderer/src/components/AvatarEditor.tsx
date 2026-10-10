import { useEffect, useId, useState } from 'react';
import { Check, RotateCcw, Shuffle } from 'lucide-react';
import type { Avatar as AvatarKind } from '../api';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, decodeAvatar, encodeAvatar, randomAvatar, type AvatarConfig } from '../avatar';
import { Avatar, BG_COLORS, FUR_COLORS, TONE_COLORS } from './Avatar';
import { Button } from './Button';

const LABELS: Record<string, string> = {
  rabbit: 'Coelho', cat: 'Gato', bear: 'Urso', cream: 'Creme', honey: 'Mel', cocoa: 'Cacau', rose: 'Rosa', lavender: 'Lavanda', mint: 'Menta', sky: 'Céu', charcoal: 'Grafite',
  smile: 'Sorriso', happy: 'Feliz', wink: 'Piscadinha', sleepy: 'Sonolento', serious: 'Sério', star: 'Estrelas',
  none: 'Sem', beanie: 'Gorro', cap: 'Boné', crown: 'Coroa', flower: 'Flor', antenna: 'Antena', bow: 'Laço',
  round: 'Redondos', square: 'Quadrados', sun: 'Escuros', monocle: 'Monóculo', tee: 'Camiseta', hoodie: 'Moletom', overalls: 'Jardineira', scarf: 'Cachecol', space: 'Astronauta',
  amber: 'Âmbar', coral: 'Coral', violet: 'Violeta', teal: 'Turquesa', blue: 'Azul', ink: 'Tinta',
  plain: 'Padrão', sand: 'Areia', lilac: 'Lilás', ocean: 'Oceano', night: 'Noite', sunset: 'Pôr do sol',
};
const CATEGORIES = [
  { key: 'species', label: 'Bichinho' }, { key: 'fur', label: 'Pelagem' },
  { key: 'face', label: 'Expressão' }, { key: 'hat', label: 'Cabeça' },
  { key: 'glasses', label: 'Óculos' }, { key: 'outfit', label: 'Roupa' }, { key: 'background', label: 'Fundo' },
] as const;
type Category = (typeof CATEGORIES)[number]['key'];

export function AvatarEditor({ value, disabled, onSave }: { value: AvatarKind; disabled: boolean; onSave: (avatar: AvatarKind) => Promise<boolean> }) {
  const [draft, setDraft] = useState(() => decodeAvatar(value));
  const [category, setCategory] = useState<Category>('species');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const id = useId();
  useEffect(() => { setDraft(decodeAvatar(value)); }, [value]);
  const recipe = encodeAvatar(draft);
  const dirty = recipe !== encodeAvatar(decodeAvatar(value));
  const locked = disabled || saving;
  function change(key: keyof AvatarConfig, option: string) {
    setDraft(current => ({ ...current, [key]: option }));
    setSaved(false);
  }
  async function save() {
    setSaving(true);
    try { if (await onSave(recipe)) setSaved(true); }
    finally { setSaving(false); }
  }
  return (
    <div className="avatar-studio" aria-labelledby={`${id}-title`}>
      <div className="avatar-studio-heading"><div><h4 id={`${id}-title`}>Seu avatar, do seu jeito</h4><p className="sm muted">Misture peças e crie um bichinho com a sua cara.</p></div><span className="badge accent">Feito por você</span></div>
      <div className="avatar-studio-layout">
        <div className="avatar-studio-preview">
          <div className="avatar-stage"><Avatar kind={recipe} size={176} /></div>
          <strong>{LABELS[draft.species]} · {LABELS[draft.face]}</strong>
          <span className="xs muted">Prévia do seu avatar</span>
          <Button size="sm" icon={<Shuffle size={15} />} disabled={locked} onClick={() => { setDraft(randomAvatar()); setSaved(false); }}>Surpreenda-me</Button>
        </div>
        <div className="avatar-studio-controls">
          <div className="avatar-categories" role="tablist" aria-label="Partes do avatar">
            {CATEGORIES.map((item, index) => <button key={item.key} type="button" role="tab" id={`${id}-tab-${item.key}`} aria-controls={`${id}-panel`} aria-selected={category === item.key} tabIndex={category === item.key ? 0 : -1} disabled={locked} onClick={() => setCategory(item.key)} onKeyDown={event => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const next = CATEGORIES[event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORIES.length - 1 : (index + step + CATEGORIES.length) % CATEGORIES.length];
              setCategory(next.key);
              document.getElementById(`${id}-tab-${next.key}`)?.focus();
            }}>{item.label}</button>)}
          </div>
          <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${category}`} className="avatar-options-panel">
            <div className="avatar-options" aria-label={CATEGORIES.find(item => item.key === category)?.label}>
              {AVATAR_OPTIONS[category].map(option => {
                const selected = draft[category] === option;
                const color = category === 'fur' ? FUR_COLORS[option as keyof typeof FUR_COLORS] : category === 'background' ? BG_COLORS[option as keyof typeof BG_COLORS] : undefined;
                return <button key={`${category}-${option}`} type="button" className={`avatar-option ${color ? 'is-swatch' : ''}`} aria-pressed={selected} disabled={locked} onClick={() => change(category, option)}>
                  {color ? <span className="avatar-swatch" style={{ background: color }} /> : <Avatar kind={encodeAvatar({ ...draft, [category]: option })} size={64} />}
                  <span>{LABELS[option]}</span>{selected && <Check className="avatar-option-check" size={14} aria-hidden="true" />}
                </button>;
              })}
            </div>
            {(category === 'outfit' || category === 'hat') && <div className="avatar-tone"><span className="xs muted">Cor da roupa e dos acessórios</span><div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{AVATAR_OPTIONS.tone.map(tone => <button key={tone} type="button" className="avatar-tone-button" aria-label={LABELS[tone]} aria-pressed={draft.tone === tone} disabled={locked} style={{ background: TONE_COLORS[tone] }} onClick={() => change('tone', tone)}>{draft.tone === tone && <Check size={15} aria-hidden="true" />}</button>)}</div></div>}
          </div>
        </div>
      </div>
      <div className="avatar-studio-footer"><span className="xs muted" role="status">{saved ? 'Avatar salvo. Os amigos já podem ver!' : dirty ? 'Você tem alterações para salvar.' : 'Seu avatar aparece no perfil, nas salas e para os amigos.'}</span><div className="row" style={{ gap: 8 }}><Button size="sm" icon={<RotateCcw size={14} />} disabled={locked || !dirty} onClick={() => { setDraft(decodeAvatar(value)); setSaved(false); }}>Desfazer</Button><Button size="sm" disabled={locked} onClick={() => { setDraft({ ...DEFAULT_AVATAR, species: draft.species }); setSaved(false); }}>Limpar</Button><Button variant="primary" disabled={locked || !dirty} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar avatar'}</Button></div></div>
    </div>
  );
}
