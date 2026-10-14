# App web do Toca (app-toca.rabbitapps.com.br): a interface do desktop como
# site estático, servido pelo nginx. No Coolify: build pack "Dockerfile"
# (arquivo padrão, /Dockerfile), porta 80. O app de Windows não usa este arquivo.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Sem os scripts de instalação: o Electron e os módulos nativos não são
# usados no build web
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:web

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/headers.conf /etc/nginx/snippets/toca-headers.conf
COPY --from=build /app/dist-web /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -qO- http://127.0.0.1/health || exit 1
