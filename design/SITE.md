# Página de download do Toca

Referência: `TocaSite.dc.html` (página) + `toca-site.css` (estilos da página) + `toca-tokens.css` (cores e componentes). Mesmo estilo Meia-noite do app, escuro por padrão.

## Seções

1. Barra fixa: ícone + "toca", links (Como é, Começar, Perguntas) e botão Baixar.
2. Topo: "A sala da turma, sempre aberta.", subtítulo, botão "Baixar para Windows", linha "Versão 0.9.2 · Windows 10 e 11" e a tela real do app (sala Sofá) com arcos âmbar ao fundo.
3. Como é: 3 cartões (salas fixas, som limpo e tela nítida, tela compartilhada com som) + 4 menores (bichinhos, amigos por @usuário, só entra quem você chamou, escuro e claro).
4. Começar: 3 passos (baixar, criar conta com código, chamar a turma).
5. Perguntas: Mac/celular, amigos precisam instalar, aviso do Windows (SmartScreen), som do PC.
6. Chamada final e rodapé "Toca é um app da Rabbit".

## Prompt para o Claude Code

```
Crie a página de download do Toca seguindo design/TocaSite.dc.html,
design/toca-site.css e design/toca-tokens.css (leia design/SITE.md).

- Página estática em uma pasta nova site/ (HTML + CSS, sem framework),
  pronta para publicar no Coolify da minha VPS.
- Fontes Sora e Manrope, ícone e favicon a partir de design/icone/.
- No lugar da prévia do app, use um print PNG da sala de voz (deixe
  site/assets/app.png como placeholder e me avise para eu trocar).
- Todos os botões "Baixar" apontam para o instalador mais recente.
  Leia o electron-builder.yml para descobrir onde os builds são
  publicados e monte a URL; se não der, use uma constante
  DOWNLOAD_URL no topo do HTML e me diga para preencher.
- Versão mostrada na página: lida do package.json no build, ou constante.
- Tema escuro padrão, claro via prefers-color-scheme.
- Responsiva até 360 px de largura, contraste AA, foco visível.
```

Confira antes de publicar: as respostas sobre Mac/celular ("só Windows por enquanto") e o aviso do SmartScreen assumem que o instalador não é assinado. Ajuste se isso mudar.
