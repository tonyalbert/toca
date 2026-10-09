# Redesign do Toca — direção Meia-noite

Arquivos desta pasta:

| Arquivo | O que é |
|---|---|
| `toca-tokens.css` | Variáveis CSS (escuro em `.tk`, claro em `.tk[data-theme="light"]`) e o CSS de todos os componentes. É a fonte da verdade de cores, raios, espaços e sombras. |
| `TocaApp.dc.html` | Protótipo com todas as telas (formato próprio do canvas: `<sc-if>`, `<sc-for>`, `{{...}}`). Use como referência de estrutura, textos e comportamento; não copie o HTML. Os dados e a lógica de exemplo estão no `<script>` no fim. |
| `TocaGuia.dc.html` | Guia de estilo: ícone, cores, tipografia, espaços, raios, sombras e componentes com estados. |
| `icone/` | Ícone do app em SVG: principal, invertido, versão ajustada para 16 px e o arco sozinho em `currentColor`. |

## Onde está cada tela em TocaApp.dc.html

Busque pelo termo da coluna da direita.

| Tela | Busque por |
|---|---|
| Entrar / Criar conta / Código de 6 dígitos / Esqueci a senha | `scr.login`, `scr.cadastro`, `scr.codigo`, `scr.esqueci` |
| Barra lateral (salas, quem está em cada uma, criar sala, amigos, versão) | `class="side"` |
| Sala de voz (cartões, quem fala, mutado, fone desligado) | `view.room` |
| Barra de controles da chamada | `class="ctrl"` |
| Tela compartilhada | `view.share` |
| Seletor de compartilhamento | `ov.picker` |
| Amigos (todos, recebidos, enviados, adicionar por @) | `view.friends` |
| Criar sala | `ov.create` |
| Gerenciar membros | `ov.members` |
| Configurações (perfil, microfone, fone, volume, sair) | `view.config` |
| Nova versão disponível (pílula na barra de título + faixa) | `hasUpdate`, `showBanner` |
| Notificações (pedido de amizade, adicionado a uma sala) | `class="toasts"` |
| Estados vazios | `view.noRooms`, `fr.empty`, `room.alone` |

## Prompt para o Claude Code

```
Quero aplicar o redesign do Toca que está em design/ (leia design/IMPLEMENTAR.md).
É um app Electron + React; mantenha toda a lógica atual (LiveKit, auth,
atualização automática, IPC). Só troca a camada visual e os textos.

1. Tokens: leve as variáveis de design/toca-tokens.css para o CSS global do
   renderer. Tema escuro é o padrão; o claro entra com data-theme="light" no
   <html>, com opção "Escuro / Claro / Sistema" em Configurações > Aparência.
2. Fontes: Sora (títulos) e Manrope (texto), empacotadas localmente
   (@fontsource), sem depender de internet.
3. Ícone: gere build/icon.ico (16, 24, 32, 48, 256) e build/icon.png (512) a
   partir de design/icone/toca-icon.svg, usando toca-icon-16px.svg para 16 px.
   Atualize o electron-builder.yml e o ícone da bandeja.
4. Componentes React reutilizáveis: Button, IconButton, Input, Switch, Avatar
   (bichinho com orelhas de coelho/gato/urso + indicador de presença),
   ParticipantCard (estados: normal, falando, mutado, fone desligado),
   CallControls, Modal, Toast, EmptyState. Ícones com lucide-react.
5. "Falando agora": use o nível de áudio do LiveKit (isSpeaking) para o anel
   âmbar, o equalizador e o texto. Nunca indique estado só por cor.
6. Barra de título própria (frameless) com o ícone, a pílula "Atualizar" quando
   houver update e os botões de janela. Janela mínima 960x600.
7. Faça por etapas e pare para eu revisar: (a) tokens+fontes+ícone,
   (b) login/cadastro/código/esqueci, (c) layout + barra lateral,
   (d) sala de voz + controles, (e) compartilhamento de tela + seletor,
   (f) amigos, criar sala, membros, (g) configurações, avisos e estados vazios.

Antes de começar, leia o projeto e me mostre o plano de arquivos de cada etapa.
```

## Regras que não podem se perder

- Âmbar (`--accent`) só para o que importa agora: quem fala, ação principal, foco e "você". O resto fica neutro.
- No tema claro, âmbar como texto usa `--accent-text` (#8A5A00) para passar no contraste AA.
- Mutado e fone desligado sempre com ícone em selo vermelho; quem fala tem anel, equalizador e o texto "Falando agora".
- Alvos clicáveis de pelo menos 36 px (controles da chamada: 46 px).
- Respeite `prefers-reduced-motion`: o equalizador e o selo AO VIVO param de animar.
