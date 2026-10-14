/** Real Electron renderer + real API routes/CORS, using an isolated in-memory account. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// O teste sobe as rotas reais da API, que fica em outro repositório (privado),
// compilado na pasta ao lado (../api). Sem ela, não há o que testar.
const apiApp = new URL('../../api/dist/app.js', import.meta.url);
if (!existsSync(apiApp)) {
  console.log('• test:avatar precisa da API compilada em ../api (repositório privado): pulando');
  process.exit(0);
}
const { buildApp } = await import(apiApp.href);

const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const { hash } = apiRequire('@node-rs/argon2');
const testPassword = 'avatar-test-only-password';
let user = { id: '00000000-0000-4000-8000-000000000001', username: 'avatar_teste', displayName: 'Avatar Teste', email: 'avatar@example.test', avatar: 'rabbit', passwordHash: await hash(testPassword) };
let savedAvatar = null;
const requests = [];
const simulateOldCors = process.argv.includes('--simulate-old-cors');
const config = {
  port: 0, databaseUrl: '', corsOrigins: ['*'], tokenTtlSeconds: 300,
  livekit: { url: 'ws://localhost', httpUrl: 'http://localhost', apiKey: 'test', apiSecret: 'test' },
  auth: { jwtSecret: 'isolated-electron-avatar-test-secret-32', accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30, rateLimitMax: 100 },
  admin: { user: null, password: null, sessionHours: 12 },
  mail: { resendApiKey: null, from: 'Toca <teste@example.test>' },
};
const api = await buildApp({ config, logger: false, livekit: {}, prisma: {
  user: { findUnique: async () => user, update: async ({ data }) => { user = { ...user, ...data }; savedAvatar = data.avatar; return user; } },
  refreshToken: { create: async () => ({}) },
  friendship: { findMany: async () => [] },
  roomMember: { findMany: async () => [] },
  directThread: { findMany: async () => [] },
} });
api.addHook('onSend', async (req, reply, payload) => {
  requests.push({ method: req.method, url: req.url });
  if (simulateOldCors && req.method === 'OPTIONS') reply.header('access-control-allow-methods', 'GET,HEAD,POST');
  return payload;
});
const temporary = await mkdtemp(join(tmpdir(), 'toca-avatar-test-'));
let vite;
let child;
try {
  await api.listen({ host: '127.0.0.1', port: 0 });
  const apiUrl = `http://localhost:${api.server.address().port}`;
  const source = path => `/@fs/${join(desktop, 'src/renderer', path).replaceAll('\\', '/')}`;
  const originalHtml = await readFile(join(desktop, 'src/renderer/index.html'), 'utf8');
  const csp = originalHtml.match(/content="([^"]*default-src[^"]*)"/)[1];
  await writeFile(join(temporary, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Toca — teste de salvar avatar</title></head><body><div id="root"></div><script type="module" src="/test.tsx"></script></body></html>`);
  await writeFile(join(temporary, 'test.tsx'), `
    import { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { login } from '${source('src/api.ts')}';
    import { SettingsPage } from '${source('src/SettingsPage.tsx')}';
    import { ConfirmProvider } from '${source('src/components/ConfirmDialog.tsx')}';
    import '${source('src/styles/tokens.css')}';
    import '${source('src/styles/components.css')}';
    const account = await login('avatar_teste', '${testPassword}');
    document.documentElement.dataset.theme = 'light';
    function TestProfile() {
      const [me, setMe] = useState(account);
      window.avatarTestAccount = me;
      return <ConfirmProvider><SettingsPage me={me} voice={{ room: null }} section="profile" onSection={() => {}} onMeChange={setMe} onSignOut={() => {}} /></ConfirmProvider>;
    }
    createRoot(document.getElementById('root')).render(<TestProfile />);
  `);
  await writeFile(join(temporary, 'preload.cjs'), `const { contextBridge } = require('electron'); contextBridge.exposeInMainWorld('toca', { saveSession: async () => {}, cancelRecordPushToTalk: async () => {} });`);
  vite = await createServer({
    configFile: false, root: temporary, plugins: [react()],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    resolve: { alias: { react: join(desktop, 'node_modules/react'), 'react-dom': join(desktop, 'node_modules/react-dom'), 'lucide-react': join(desktop, 'node_modules/lucide-react') } },
    server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/user-data/**'] }, fs: { allow: [temporary, desktop] } },
  });
  await vite.listen();
  const rendererUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  await writeFile(join(temporary, 'electron-test.cjs'), `
    const { app, BrowserWindow } = require('electron');
    app.disableHardwareAcceleration();
    app.setPath('userData', ${JSON.stringify(join(temporary, 'user-data'))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ width: 1180, height: 900, title: 'Toca — teste de avatar', webPreferences: { preload: ${JSON.stringify(join(temporary, 'preload.cjs'))}, contextIsolation: true, nodeIntegration: false, sandbox: true } });
      win.webContents.on('console-message', event => { console.log('Renderer:', event.level, event.message); });
      try {
        await win.loadURL(${JSON.stringify(rendererUrl)});
        const result = await win.webContents.executeJavaScript(${JSON.stringify(`(async () => {
          const waitFor = async (check, label) => {
            const start = Date.now();
            while (!check()) { if (Date.now() - start > 15000) throw new Error(label + ': ' + document.body.innerText.slice(-1600)); await new Promise(resolve => setTimeout(resolve, 50)); }
          };
          await waitFor(() => document.querySelector('.avatar-studio'), 'Editor did not render');
          const button = label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label);
          button('Cabeça').click();
          await waitFor(() => button('Coroa'), 'Crown option missing');
          button('Coroa').click();
          await waitFor(() => !button('Salvar avatar').disabled, 'Save did not enable');
          button('Salvar avatar').click();
          await waitFor(() => document.querySelector('${simulateOldCors ? '.notice.error' : '.notice.ok'}'), 'Expected save result missing');
          const result = { avatar: window.avatarTestAccount.avatar, message: document.querySelector('.notice').textContent, saveDisabled: button('Salvar avatar').disabled };
          document.querySelector('.avatar-studio').scrollIntoView({ block: 'center' });
          return result;
        })()`)});
        if (${simulateOldCors ? "result.avatar !== 'rabbit' || !result.message.includes('Sem conexão')" : "!result.avatar.includes(':crown:') || !result.saveDisabled"}) throw new Error('Unexpected save result: ' + JSON.stringify(result));
        console.log('ELECTRON_AVATAR_OK ' + JSON.stringify(result));
        app.exit(0);
      } catch (error) { console.error(error.stack); app.exit(1); }
    });
  `);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(require('electron'), [join(temporary, 'electron-test.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Electron test timed out')); }, 45000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(code, 0, output);
  assert.ok(requests.some(req => req.method === 'OPTIONS' && req.url === '/me'), 'Chromium must perform a CORS preflight');
  if (simulateOldCors) {
    assert.equal(savedAvatar, null);
    assert.ok(!requests.some(req => req.method === 'PATCH' && req.url === '/me'));
    console.log('PASS: reproduced the original CORS failure in real Electron; PATCH never reaches the API.');
  } else {
    assert.match(savedAvatar, /:crown:/);
    assert.ok(requests.some(req => req.method === 'PATCH' && req.url === '/me'));
    console.log('PASS: real Electron window, login, CORS preflight, avatar editor, PATCH /me, saved account and success message.');
  }
} finally {
  if (child && child.exitCode === null) child.kill();
  await vite?.close();
  await api.close();
}
