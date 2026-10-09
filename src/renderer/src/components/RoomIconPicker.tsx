import { useId, useRef, type KeyboardEvent } from "react";
import { ROOM_ICONS, type RoomIcon as RoomIconKind } from "../api";
import { ROOM_ICON_LABELS, RoomIcon } from "./RoomIcon";

/** Escolha do ícone da sala (grupo de opções: setas mudam a escolha) */
export function RoomIconPicker({ value, onChange }: { value: RoomIconKind; onChange: (icon: RoomIconKind) => void }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  const onKey = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const i = ROOM_ICONS.indexOf(value);
    const next = ROOM_ICONS[(i + step + ROOM_ICONS.length) % ROOM_ICONS.length];
    onChange(next);
    ref.current?.querySelector<HTMLElement>(`[data-icon="${next}"]`)?.focus();
  };

  return (
    <div className="field">
      <span className="label" id={id}>
        Ícone
      </span>
      <div ref={ref} className="ico-pick" role="radiogroup" aria-labelledby={id} onKeyDown={onKey}>
        {ROOM_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            role="radio"
            data-icon={icon}
            aria-checked={icon === value}
            aria-label={ROOM_ICON_LABELS[icon]}
            data-tip={ROOM_ICON_LABELS[icon]}
            tabIndex={icon === value ? 0 : -1}
            onClick={() => onChange(icon)}
          >
            <RoomIcon icon={icon} size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}
