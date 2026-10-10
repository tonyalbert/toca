/** Versioned, compact avatar recipe; legacy species remain valid. */
export const SPECIES = ['rabbit', 'cat', 'bear'] as const;
export const FURS = ['cream', 'honey', 'cocoa', 'rose', 'lavender', 'mint', 'sky', 'charcoal'] as const;
export const FACES = ['smile', 'happy', 'wink', 'sleepy', 'serious', 'star'] as const;
export const HATS = ['none', 'beanie', 'cap', 'crown', 'flower', 'antenna', 'bow'] as const;
export const GLASSES = ['none', 'round', 'square', 'sun', 'monocle'] as const;
export const OUTFITS = ['none', 'tee', 'hoodie', 'overalls', 'scarf', 'space'] as const;
export const TONES = ['amber', 'coral', 'violet', 'teal', 'blue', 'ink'] as const;
export const BACKGROUNDS = ['plain', 'sand', 'rose', 'lilac', 'mint', 'ocean', 'night', 'sunset'] as const;
export type Species = (typeof SPECIES)[number];
export type Avatar = Species | `v1:${string}`;
export interface AvatarConfig {
  species: Species;
  fur: (typeof FURS)[number];
  face: (typeof FACES)[number];
  hat: (typeof HATS)[number];
  glasses: (typeof GLASSES)[number];
  outfit: (typeof OUTFITS)[number];
  tone: (typeof TONES)[number];
  background: (typeof BACKGROUNDS)[number];
}
export const DEFAULT_AVATAR: AvatarConfig = {
  species: 'rabbit', fur: 'cream', face: 'smile', hat: 'none', glasses: 'none',
  outfit: 'none', tone: 'amber', background: 'plain',
};
export const AVATAR_OPTIONS = { species: SPECIES, fur: FURS, face: FACES, hat: HATS, glasses: GLASSES, outfit: OUTFITS, tone: TONES, background: BACKGROUNDS };
export const AVATAR_PATTERN = `^(rabbit|cat|bear|v1:${Object.values(AVATAR_OPTIONS).map(options => `(${options.join('|')})`).join(':')})(?![\\s\\S])`;
const pattern = new RegExp(AVATAR_PATTERN);
export const isAvatar = (value: unknown): value is Avatar => typeof value === 'string' && value.length <= 120 && pattern.test(value);
export function decodeAvatar(value: string): AvatarConfig {
  if ((SPECIES as readonly string[]).includes(value)) return { ...DEFAULT_AVATAR, species: value as Species };
  if (!isAvatar(value)) return { ...DEFAULT_AVATAR };
  const values = value.split(':').slice(1);
  return Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((key, index) => [key, values[index]])) as unknown as AvatarConfig;
}
export function encodeAvatar(config: AvatarConfig): Avatar {
  const value = `v1:${Object.keys(AVATAR_OPTIONS).map(key => config[key as keyof AvatarConfig]).join(':')}`;
  if (!isAvatar(value)) throw new Error('Avatar inválido');
  return value;
}
export function randomAvatar(): AvatarConfig {
  return Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([key, options]) => [key, options[Math.floor(Math.random() * options.length)]])) as unknown as AvatarConfig;
}
