/**
 * Novidades de cada versão (Configurações → Novidades). Ao lançar uma versão,
 * acrescente a entrada dela no topo, com o mesmo número do package.json:
 * é ela que aparece no aviso "O Toca foi atualizado".
 */
export interface Release {
  version: string;
  /** AAAA-MM-DD */
  date: string;
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.8.0",
    date: "2026-10-14",
    items: [
      "Esqueceu a senha? Na tela de entrar, clique em \"Esqueci a senha\": chega um código no seu e-mail para você criar uma nova e já entrar.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-10-13",
    items: [
      "Sessão de cinema: na chamada, assistam juntos um vídeo do YouTube ou um arquivo do PC, tudo sincronizado.",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-10-13",
    items: ["Atalhos de teclado para microfone, fone, câmera, tela e sair da chamada, mesmo com o jogo em foco."],
  },
  {
    version: "1.6.0",
    date: "2026-10-13",
    items: [
      "Temas de cores novos (Configurações → Aparência).",
      "Foto ou GIF de perfil no lugar do bichinho.",
      "Adms na sala e transferência de dono.",
      "Link de convite para entrar na sala.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-13",
    items: ["Imagens no chat: anexe, cole com Ctrl+V ou arraste para a conversa."],
  },
  {
    version: "1.4.0",
    date: "2026-10-10",
    items: [
      "Chat em cada sala e mensagens diretas entre amigos.",
      "Atualizações automáticas, sem interromper a chamada.",
    ],
  },
  {
    version: "1.3.2",
    date: "2026-10-10",
    items: ["Monte o seu bichinho: espécie, cor, carinha, chapéu, óculos, roupa e fundo."],
  },
  {
    version: "1.3.0",
    date: "2026-10-10",
    items: [
      "Tela de configurações: perfil, voz e vídeo, notificações e aparência.",
      "Apertar para falar, com atalho que funciona com o Toca em segundo plano.",
    ],
  },
];

/** Compara "1.10.0" com "1.9.2" número a número */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Só as versões até a instalada (uma entrada escrita antes do lançamento não aparece) */
export const releasesUpTo = (version: string) => CHANGELOG.filter((r) => compareVersions(r.version, version) <= 0);

const SEEN_KEY = "toca.news.seen";

/** Última versão cujas novidades a pessoa já viu (null: primeira vez que abre o Toca) */
export function seenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // sem armazenamento: o aviso só volta a aparecer
  }
}
