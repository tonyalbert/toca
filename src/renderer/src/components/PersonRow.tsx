import type { ReactNode } from "react";
import type { Avatar as AvatarKind } from "../api";
import { Avatar, type Presence } from "./Avatar";

/** Linha de uma pessoa: bichinho, nome, @ e um detalhe, com ações à direita */
export function PersonRow({
  avatar,
  name,
  username,
  detail,
  presence,
  small,
  lead,
  onClick,
  children,
}: {
  avatar: AvatarKind;
  name: string;
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
    <li className={`li ${small ? "small" : ""} ${onClick ? "clickable" : ""}`} onClick={onClick}>
      {lead}
      <Avatar kind={avatar} size={small ? 32 : 42} presence={presence} />
      <div className="li-text">
        <strong>{name}</strong>
        <span className="sub">
          @{username}
          {detail && ` · ${detail}`}
        </span>
      </div>
      {children && <div className="acts">{children}</div>}
    </li>
  );
}
