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
npm run build:web   # app web em dist-web/ (ver "App web" abaixo)
```

Para apontar para outra API, copie `.env.example` para `.env` e troque `VITE_API_URL`.
Endereços `localhost` já são liberados pela política de segurança da página
(`src/renderer/index.html`); outro domínio precisa ser acrescentado lá.

## App web (navegador)

A mesma interface roda no navegador, em **https://app-toca.rabbitapps.com.br**. O código descobre
onde está rodando em `src/renderer/src/platform/`: no Electron usa `window.toca` (preload); no
navegador usa as versões web (sessão em cookie httpOnly da API, seletor de tela do navegador,
apertar para falar só com a aba em foco). Atalhos globais, bandeja e atualização automática só
existem no app para Windows.

```bash
npm run dev:web     # http://localhost:5173 (a API precisa liberar essa origem, ver abaixo)
npm run build:web   # gera dist-web/ (site estático + version.json)
```

Quando sai um build novo, quem está com o app aberto vê o botão "Atualizar" (recarrega a página,
esperando a chamada acabar).

### Publicar no Coolify

1. **DNS**: um registro `A` (ou `CNAME`) de `app-toca.rabbitapps.com.br` para o servidor do Coolify
   (pule se já existir um curinga `*.rabbitapps.com.br`).
2. **Novo recurso** → *Public/Private Repository* → este repositório, branch `main`.
3. **Build pack**: *Dockerfile*; **Dockerfile location**: `/Dockerfile.web`; **porta**: `80`.
4. **Domínio**: `https://app-toca.rabbitapps.com.br` (o Coolify gera o certificado HTTPS).
5. **Deploy**. O nginx (`nginx/`) serve o app com cache longo para `assets/`, sem cache para
   `index.html` e `version.json`, e cabeçalhos de segurança; a CSP fica no `index.html`.
6. **Na API** (variáveis de ambiente), e depois *Redeploy*:
   - `APP_ORIGINS=https://app-toca.rabbitapps.com.br`: origens que podem guardar a sessão em
     cookie httpOnly e receber `credentials` no CORS.
   - `CORS_ORIGINS`: se não for `*`, acrescente `https://app-toca.rabbitapps.com.br`.

Para desenvolver contra uma API local, use `APP_ORIGINS=http://localhost:5173` nela e
`VITE_API_URL=http://localhost:3000` aqui (os dois em `localhost`, para o cookie valer).

## App de Windows: casca do app web

O app de Windows abre **https://app-toca.rabbitapps.com.br** (como o Discord) e só acrescenta o que
é nativo: atalhos globais e apertar para falar com o jogo em foco, bandeja, seletor de tela com o
som do PC, links `toca://` e a atualização da própria casca (electron-updater). Mudança só na
interface vai pro ar com o deploy do app web, sem versão nova do desktop.

- `src/main/shell.ts`: endereço do app, bloqueio de navegação (outros sites abrem no navegador),
  conferência de quem chama o `ipcMain` e a tela "sem conexão".
- O preload só entrega `window.toca` para o endereço do app.
- Em desenvolvimento, `npm run dev` abre o Vite local; `TOCA_APP_URL=http://localhost:4173` aponta
  para outro endereço (o app instalado sempre usa o oficial).

**Regra:** função nativa nova (preload/main) precisa de versão nova da casca, e a interface deve
funcionar sem ela: use `native.x()` e `features` de `src/renderer/src/platform/`, que caem na
versão web quando a casca instalada ainda não tem a função.

## Organização

```
src/main/       processo principal do Electron: janela, bandeja, atalhos globais,
                atualizações, protocolo toca:// (links de convite), captura de tela
src/preload/    ponte segura entre o Electron e a interface
src/renderer/   interface em React (a mesma do app web)
  src/platform/        o que muda entre o Electron e o navegador
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
