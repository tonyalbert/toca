import type { Avatar as AvatarKind, Friend, Profile, RoomInfo } from "../api";

/** Classe das orelhas de cada bichinho (ver .av em components.css) */
const EARS: Record<AvatarKind, string> = { rabbit: "e-b", cat: "e-c", bear: "e-u" };

export const AVATAR_LABELS: Record<AvatarKind, string> = { rabbit: "Coelho", cat: "Gato", bear: "Urso" };

/** Bichinho de cada pessoa conhecida (o LiveKit só sabe id e nome) */
export function avatarMap(me: Profile, friends: Friend[], rooms: RoomInfo[]): Map<string, AvatarKind> {
  const map = new Map<string, AvatarKind>([[me.id, me.avatar]]);
  for (const f of friends) map.set(f.id, f.avatar);
  for (const r of rooms) for (const m of r.members) map.set(m.id, m.avatar);
  return map;
}

export type Presence = "online" | "call" | "offline";


/**
 * Bichinho do avatar: cabeça redonda com orelhas de coelho, gato ou urso.
 * Olhos a partir de 28 px e boca a partir de 38 px (menor que isso vira ruído).
 */
export function Avatar({
  kind = "rabbit",
  size,
  mine,
  presence,
  talking,
}: {
  kind?: AvatarKind;
  /** Diâmetro do círculo, em px */
  size: number;
  /** O seu próprio bichinho ganha o tom âmbar */
  mine?: boolean;
  presence?: Presence;
  /** Anel âmbar de quem está falando */
  talking?: boolean;
}) {
  const icon = Math.round(size * 0.88);
  return (
    <span className={`avw ${talking ? "talk" : ""}`} style={{ width: size, height: size }}>
      <AvatarShape kind={kind} size={icon} mine={mine} face={size >= 28} mouth={size >= 38} />
      {presence && (
        <span className={`pres ${presence === "online" ? "on" : presence === "call" ? "call" : ""}`} />
      )}
    </span>
  );
}

/** Só o desenho (sem o círculo de fundo), usado também no seletor de bichinho */
export function AvatarShape({
  kind,
  size,
  mine,
  face = true,
  mouth = true,
}: {
  kind: AvatarKind;
  size: number;
  mine?: boolean;
  face?: boolean;
  mouth?: boolean;
}) {
  return (
    <svg className={`av ${EARS[kind]} ${mine ? "tint-a" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {kind === "rabbit" && (
        <g>
          <rect className="ear" x="17" y="2" width="10" height="26" rx="5" transform="rotate(-8 22 28)" />
          <rect className="ear" x="37" y="2" width="10" height="26" rx="5" transform="rotate(8 42 28)" />
        </g>
      )}
      {kind === "cat" && (
        <g>
          <path className="ear" d="M14 32 L17 9 L31 22 Z" />
          <path className="ear" d="M50 32 L47 9 L33 22 Z" />
        </g>
      )}
      {kind === "bear" && (
        <g>
          <circle className="ear" cx="17" cy="22" r="8" />
          <circle className="ear" cx="47" cy="22" r="8" />
        </g>
      )}
      <circle className="head" cx="32" cy="38" r="20" />
      {face && (
        <>
          <circle className="eye" cx="25" cy="36" r="2.4" />
          <circle className="eye" cx="39" cy="36" r="2.4" />
        </>
      )}
      {face && mouth && <path className="mouth" d="M28 44 Q32 47.5 36 44" />}
    </svg>
  );
}
