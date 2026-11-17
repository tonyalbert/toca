import type { ReactNode } from "react";
import { StyledName, type NameStyle } from "../nameStyle";
import type { Avatar as AvatarKind, Photo } from "../api";
import { Avatar, type Presence } from "./Avatar";

/** Linha de uma pessoa: bichinho, nome, @ e um detalhe, com ações à direita */
export function PersonRow({
  avatar,
  photo,
  name,
  nameStyle,
  username,
  detail,
  presence,
  small,
  lead,
  onClick,
  children,
}: {
  avatar: AvatarKind;
  photo?: Photo | null;
  name: string;
  /** Cor, degradê e efeito do nome */
  nameStyle?: NameStyle | null;
  username: string;
  /** Depois do @ (ex.: "Online", "quer ser seu amigo") */
  detail?: string;
  presence?: Presence;
  /** Versão compacta (janelas) */
  small?: boolean;
  /** Antes do bichinho (ex.: caixa de marcar) */
  lead?: ReactNode;
  /** A linha inteira clicável */
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <li
      className={`li ${small ? "small" : ""} ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      // Linha inteira clicável também pelo teclado (com caixa de marcar, o foco fica nela)
      {...(onClick && !lead
        ? {
            role: "button",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
    >
      {lead}
      <Avatar kind={avatar} photo={photo} size={small ? 32 : 42} presence={presence} />
      <div className="li-text">
        <strong>
          <StyledName name={name} nameStyle={nameStyle} />
        </strong>
        <span className="sub">
          @{username}
          {detail && ` · ${detail}`}
        </span>
      </div>
      {children && <div className="acts">{children}</div>}
    </li>
  );
}
