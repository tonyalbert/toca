# Toca — app para Windows

O Toca é um app de chamada de voz para grupos de amigos e casais: salas fixas que ficam
sempre abertas, tela compartilhada com som, chat, sessão de cinema (YouTube ou arquivo do PC,
sincronizado para todo mundo) e bichinhos personalizáveis como avatar.

Este repositório é o **app de computador** (Electron + React + LiveKit). Para só usar o Toca,
baixe o instalador em **[toca.rabbitapps.com.br](https://toca.rabbitapps.com.br)**.

![Galeria de avatares](docs/avatar-gallery.png)

## Como o app se conecta

O app é um cliente. Contas, amigos, salas e mensagens ficam na **API do Toca**, que é um
projeto separado e **não é código aberto**. Por padrão, o app conecta na API oficial
(`https://api-toca.rabbitapps.com.br`); a voz, o vídeo e a tela passam pelo servidor
[LiveKit](https://livekit.io), com o acesso liberado pela API.

Ou seja: compilando este código, você entra com a sua conta normal do Toca e conversa com as
mesmas pessoas do app oficial.

## Rodando em desenvolvimento

Precisa de **Windows 10 ou 11** e **Node.js 22 ou mais novo**.

```bash
npm install
npm run dev
```

O `npm run dev` também compila o `toca-audio-capture.exe` (captura do som do PC ao
compartilhar a tela), usando o compilador C# que já vem no Windows: não precisa instalar
Visual Studio nem .NET SDK.

Outros comandos:

```bash
npm run typecheck   # confere os tipos (processo principal e interface)
npm run build       # compila para out/
npm run dist        # gera o instalador em dist/ (sem publicar)
```

Para apontar para outra API, copie `.env.example` para `.env` e troque `VITE_API_URL`.
Endereços `localhost` já são liberados pela política de segurança da página
(`src/renderer/index.html`); outro domínio precisa ser acrescentado lá.

## Organização

```
src/main/       processo principal do Electron: janela, bandeja, atalhos globais,
                atualizações, protocolo toca:// (links de convite), captura de tela
src/preload/    ponte segura entre o Electron e a interface
src/renderer/   interface em React
  src/api.ts           chamadas à API do Toca
  src/realtime.ts      WebSocket de eventos (amigos, salas, mensagens)
  src/useVoiceRoom.ts  chamada de voz (LiveKit)
  src/cinema.ts        sessão de cinema sincronizada
  src/changelog.ts     novidades de cada versão (aba Novidades)
src/shared/     tipos usados pelos dois lados
native/         captura de áudio do Windows (C#)
design/         protótipos e tokens visuais
```

## Contribuindo

Issues e pull requests são bem-vindos. Antes de algo grande, abra uma issue para conversar
sobre a ideia: algumas mudanças dependem da API, que é mantida à parte.

Encontrou uma falha de segurança? Não abra uma issue pública: use
**Security → Report a vulnerability** aqui no GitHub.

## Licença

O código está sob a [GNU GPL v3](LICENSE): você pode usar, estudar, modificar e distribuir,
desde que versões modificadas que você distribuir também tenham o código aberto sob a mesma
licença.

O nome **Toca**, o logo e o ícone não fazem parte da licença. Se publicar uma versão
modificada, use outro nome e outro ícone, para ninguém confundir com o app oficial.
