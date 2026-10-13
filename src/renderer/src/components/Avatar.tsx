import { useState, type CSSProperties } from 'react';
import { photoUrl, type Avatar as AvatarKind, type Friend, type Photo, type Profile, type RoomInfo } from '../api';
import { decodeAvatar, type Species } from '../avatar';

export const AVATAR_LABELS: Record<Species, string> = { rabbit: 'Coelho', cat: 'Gato', bear: 'Urso' };
export const FUR_COLORS = { cream: '#f4e7cf', honey: '#eab969', cocoa: '#ac7759', rose: '#efabb8', lavender: '#b6a5e7', mint: '#97d6ba', sky: '#9ecbe9', charcoal: '#627084' };
export const TONE_COLORS = { amber: '#ffc83a', coral: '#ed7880', violet: '#9984df', teal: '#53bfa7', blue: '#689de0', ink: '#344052' };
export const BG_COLORS = { plain: 'var(--card-2)', sand: '#e4d5b9', rose: '#eed0d8', lilac: '#d6cceb', mint: '#bdded0', ocean: '#245978', night: '#22263e', sunset: '#bd6779' };
/** Como alguém aparece: o bichinho e, se tiver, a foto */
export interface Look {
  avatar: AvatarKind;
  photo?: Photo | null;
}
export const lookOf = (u: Look): Look => ({ avatar: u.avatar, photo: u.photo ?? null });
export function avatarMap(me: Profile, friends: Friend[], rooms: RoomInfo[]): Map<string, Look> {
  const map = new Map<string, Look>([[me.id, lookOf(me)]]);
  for (const f of friends) map.set(f.id, lookOf(f));
  for (const r of rooms) for (const m of r.members) map.set(m.id, lookOf(m));
  return map;
}
export type Presence = 'online' | 'call' | 'offline';
export function Avatar({ kind = 'rabbit', photo, size, mine, presence, talking }: {
  kind?: AvatarKind; photo?: Photo | null; size: number; mine?: boolean; presence?: Presence; talking?: boolean;
}) {
  // Foto que não carregou (sem rede, apagada): volta o bichinho
  const [failed, setFailed] = useState<string | null>(null);
  const pres = presence && <span className={`pres ${presence === 'online' ? 'on' : presence === 'call' ? 'call' : ''}`} />;
  if (photo && failed !== photo.id) {
    return (
      <span className={`avw avatar-photo ${talking ? 'talk' : ''}`} style={{ width: size, height: size }}>
        <img className="avatar-img" src={photoUrl(photo)} alt="" draggable={false} onError={() => setFailed(photo.id)} />
        {/* GIF: parado (o quadro acima); só se mexe enquanto a pessoa fala, começando do início */}
        {photo.animated && talking && <img className="avatar-img" src={photoUrl(photo, true)} alt="" draggable={false} />}
        {pres}
      </span>
    );
  }
  const config = decodeAvatar(kind);
  return (
    <span className={`avw avatar-custom ${talking ? 'talk' : ''}`} style={{ width: size, height: size, background: BG_COLORS[config.background] }}>
      <AvatarShape kind={kind} size={Math.round(size * .94)} mine={mine} small={size < 38} />
      {pres}
    </span>
  );
}

/**
 * O bichinho. small: carinha simplificada, com olhos e boca maiores, para
 * continuar dando para ver o rosto nas listas (bochecha e nariz somem).
 */
export function AvatarShape({ kind, size, mine, small = false }: {
  kind: AvatarKind; size: number; mine?: boolean; small?: boolean;
}) {
  const c = decodeAvatar(kind);
  const fur = FUR_COLORS[c.fur];
  const tone = TONE_COLORS[c.tone];
  const dark = '#293044';
  const stroke = { stroke: dark, strokeWidth: 2.3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const legacyMine = mine && !kind.startsWith('v1:');
  const skin = legacyMine ? FUR_COLORS.honey : fur;
  // Olhos e traços maiores quando o bichinho é pequeno
  const k = small ? 1.7 : 1;
  const line = 3 * k;
  return (
    <svg className="avatar-art" width={size} height={size} viewBox={size < 48 ? '0 0 100 88' : '0 0 100 104'} aria-hidden="true" style={{ '--avatar-fur': skin } as CSSProperties}>
      <g {...stroke}>
        {c.species === 'rabbit' && <g fill={skin}>
          <rect x="27" y="5" width="15" height="41" rx="8" transform="rotate(-9 34 45)" />
          <rect x="58" y="5" width="15" height="41" rx="8" transform="rotate(9 66 45)" />
          <path d="M33 15 L36 33 M67 15 L64 33" stroke="#db98a6" strokeWidth="5" />
        </g>}
        {c.species === 'cat' && <g fill={skin}>
          <path d="M21 48 L22 17 L44 36 Z M79 48 L78 17 L56 36 Z" />
          <path d="M27 35 L27 25 L36 35 M73 35 L73 25 L64 35" stroke="#db98a6" strokeWidth="4" />
        </g>}
        {c.species === 'bear' && <g fill={skin}>
          <circle cx="25" cy="32" r="13" /><circle cx="75" cy="32" r="13" />
          <circle cx="25" cy="32" r="6" fill="#db98a6" stroke="none" /><circle cx="75" cy="32" r="6" fill="#db98a6" stroke="none" />
        </g>}
        <path d="M25 101 L27 87 Q30 73 50 73 Q70 73 73 87 L75 101" fill={c.outfit === 'none' ? skin : tone} />
        {c.outfit === 'tee' && <path d="M31 81 L23 88 L31 93 M69 81 L77 88 L69 93 M44 80 Q50 88 56 80" fill="none" />}
        {c.outfit === 'hoodie' && <g fill="none"><path d="M36 80 Q50 96 64 80 M43 89 L43 94 M57 89 L57 94 M42 99 Q50 93 58 99" /><circle cx="43" cy="95" r="1" /><circle cx="57" cy="95" r="1" /></g>}
        {c.outfit === 'overalls' && <g><path d="M34 79 L34 90 L66 90 L66 79 M34 90 L34 101 L66 101 L66 90" fill="#497697" /><circle cx="37" cy="90" r="2" fill="#f7d87b" /><circle cx="63" cy="90" r="2" fill="#f7d87b" /></g>}
        {c.outfit === 'space' && <g><path d="M32 83 L38 98 L62 98 L68 83" fill="#e0e6ee" /><rect x="43" y="87" width="14" height="9" rx="2" fill={tone} /><circle cx="47" cy="91" r="1" fill={dark} stroke="none" /></g>}
        <path d="M20 54 Q20 30 50 30 Q80 30 80 54 L78 65 Q75 82 50 82 Q25 82 22 65 Z" fill={skin} />
        <g fill={dark} stroke="none">
          {(c.face === 'smile' || c.face === 'serious') && <><ellipse cx="38" cy="54" rx={3 * k} ry={4 * k} /><ellipse cx="62" cy="54" rx={3 * k} ry={4 * k} /></>}
          {c.face === 'wink' && <><ellipse cx="38" cy="54" rx={3 * k} ry={4 * k} /><path d="M58 55 Q62 50 66 55" fill="none" stroke={dark} strokeWidth={line} /></>}
          {c.face === 'happy' && <path d="M34 54 Q38 48 42 54 M58 54 Q62 48 66 54" fill="none" stroke={dark} strokeWidth={line} />}
          {c.face === 'sleepy' && <path d="M34 53 Q38 57 42 53 M58 53 Q62 57 66 53" fill="none" stroke={dark} strokeWidth={line} />}
          {c.face === 'star' && <><path d="M38 48 L40 52 L45 53 L41 56 L42 61 L38 58 L34 61 L35 56 L31 53 L36 52 Z" /><path d="M62 48 L64 52 L69 53 L65 56 L66 61 L62 58 L58 61 L59 56 L55 53 L60 52 Z" /></>}
          {!small && <>
            <ellipse cx="29" cy="64" rx="5" ry="2.5" fill="#df91a2" opacity=".55" /><ellipse cx="71" cy="64" rx="5" ry="2.5" fill="#df91a2" opacity=".55" />
            <path d="M47 62 Q50 65 53 62" fill="none" stroke={dark} strokeWidth="2" />
          </>}
          {c.face === 'happy'
            ? <path d={small ? 'M41 66 Q50 81 59 66 Z' : 'M43 68 Q50 79 57 68 Z'} />
            : <path d={c.face === 'serious' ? (small ? 'M43 69 L57 69' : 'M45 70 L55 70') : small ? 'M42 66 Q50 74 58 66' : 'M44 68 Q50 73 56 68'} fill="none" stroke={dark} strokeWidth={small ? 4.5 : 2.5} />}
        </g>
        {c.species === 'cat' && !small && <path d="M26 60 L17 58 M26 65 L17 67 M74 60 L83 58 M74 65 L83 67" opacity=".5" />}
        {c.glasses === 'round' && <g fill="none"><circle cx="37" cy="54" r="9" /><circle cx="63" cy="54" r="9" /><path d="M46 54 Q50 50 54 54 M28 51 L23 49 M72 51 L77 49" /></g>}
        {c.glasses === 'square' && <g fill="none"><rect x="27" y="46" width="20" height="16" rx="3" /><rect x="53" y="46" width="20" height="16" rx="3" /><path d="M47 52 L53 52" /></g>}
        {c.glasses === 'sun' && <g fill={dark}><path d="M26 47 L47 47 L45 60 L29 60 Z M53 47 L74 47 L71 60 L55 60 Z" /><path d="M47 51 L53 51" /><path d="M31 50 L36 56 M59 50 L64 56" stroke="#c9e2ed" strokeWidth="2" /></g>}
        {c.glasses === 'monocle' && <g fill="none" stroke="#ba8a35"><circle cx="63" cy="54" r="10" /><path d="M71 62 Q79 73 73 83" /></g>}
        {c.outfit === 'scarf' && <g fill={tone}><path d="M28 76 Q50 86 72 76 L69 85 Q50 92 31 85 Z" /><path d="M58 84 L66 85 L65 100 L57 98 Z" /></g>}
        {c.hat === 'beanie' && <g fill={tone}><path d="M25 37 Q25 16 50 16 Q75 16 75 37 Z" /><rect x="23" y="33" width="54" height="10" rx="4" /><circle cx="50" cy="14" r="6" /><path d="M36 24 L34 32 M50 22 L50 32 M64 24 L66 32" opacity=".35" /></g>}
        {c.hat === 'cap' && <g fill={tone}><path d="M25 36 Q26 19 51 19 Q72 19 74 36 Z" /><path d="M45 34 L79 34 Q87 36 83 42 L47 40 Z" /><path d="M50 21 L50 32" opacity=".4" /></g>}
        {c.hat === 'crown' && <g fill="#ffd25e"><path d="M31 33 L27 17 L42 24 L50 12 L58 24 L73 17 L69 33 Z" /><path d="M32 33 L68 33" /><circle cx="50" cy="27" r="3" fill={tone} stroke="none" /></g>}
        {c.hat === 'flower' && <g strokeWidth="1.5"><path d="M65 34 Q77 22 84 32 Q80 39 68 38" fill="#79bd8a" /><g fill={tone}><circle cx="70" cy="25" r="5" /><circle cx="76" cy="30" r="5" /><circle cx="73" cy="37" r="5" /><circle cx="65" cy="37" r="5" /><circle cx="63" cy="29" r="5" /></g><circle cx="69" cy="31" r="4" fill="#ffe3a1" /></g>}
        {c.hat === 'antenna' && <g><path d="M50 30 L50 16 L59 10" fill="none" /><circle cx="61" cy="8" r="5" fill={tone} /></g>}
        {c.hat === 'bow' && <g fill={tone}><path d="M50 29 Q30 16 33 34 Q34 42 50 32 Q67 42 67 34 Q70 16 50 29 Z" /><circle cx="50" cy="31" r="4" /></g>}
      </g>
    </svg>
  );
}
