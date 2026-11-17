import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { setLocale } from '../src/i18n.js';
import { detectStaticSite, ensureAppRunning, isUp } from '../src/app-server.js';
import { samePage } from '../src/checks.js';

setLocale('en');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-app-'));
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
const serverCommand = (port) => `"${process.execPath}" -e "require('http').createServer((q,r)=>r.end('ok')).listen(${port})"`;

test('sem app.start e sem nada no ar: erro claro, em vez de um "problema crítico" no relatório', async () => {
  const url = `http://localhost:${await freePort()}/`;
  assert.equal(await isUp(url), false);
  await assert.rejects(ensureAppRunning({ url, log: () => {} }), /Nothing is responding at .*Start the app first .*app\.start.*http-server/s);
});

test('com app.start: inicia, espera responder e encerra no fim', { timeout: 60000 }, async () => {
  const port = await freePort();
  const url = `http://localhost:${port}/`;
  const lines = [];
  const app = await ensureAppRunning({ url, start: serverCommand(port), cwd: tmp(), log: (l) => lines.push(l) });
  assert.equal(app.started, true);
  assert.equal(await isUp(url), true);
  assert.match(lines.join('\n'), /Starting the app: .*\n✔ App is up/);
  app.stop();
  for (let i = 0; i < 20 && (await isUp(url, 500)); i++) await new Promise((r) => setTimeout(r, 200));
  assert.equal(await isUp(url, 500), false, 'o servidor foi encerrado');
});

test('aplicação já no ar: não inicia outra; file:// não precisa de servidor', async () => {
  const port = await freePort();
  const app = await ensureAppRunning({ url: `http://localhost:${port}/`, start: serverCommand(port), cwd: tmp(), log: () => {} });
  try {
    const again = await ensureAppRunning({ url: `http://localhost:${port}/`, start: 'exit 1', log: () => {} });
    assert.equal(again.started, false);
  } finally {
    app.stop();
  }
  assert.equal((await ensureAppRunning({ url: 'file:///tmp/x/index.html', log: () => {} })).started, false);
});

test('comando que termina sem subir a aplicação: erro com a saída do comando', { timeout: 30000 }, async () => {
  const url = `http://localhost:${await freePort()}/`;
  await assert.rejects(
    ensureAppRunning({ url, start: `"${process.execPath}" -e "console.error('boom: port in use'); process.exit(1)"`, cwd: tmp(), log: () => {} }),
    /ended before .* responded[\s\S]*boom: port in use/,
  );
});

test('site estático: index.html na raiz ou numa subpasta, inclusive com espaço no nome', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>x</h1>');
  assert.equal(detectStaticSite(root).start, 'npx -y http-server . -p 3000 -c-1');

  const sub = tmp();
  fs.mkdirSync(path.join(sub, 'tenis-landing'));
  fs.writeFileSync(path.join(sub, 'tenis-landing/index.html'), '<h1>x</h1>');
  fs.mkdirSync(path.join(sub, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(sub, 'node_modules/pkg/index.html'), '');
  assert.deepEqual(detectStaticSite(sub), { id: 'static', dir: 'tenis-landing', label: 'Static site (HTML)', url: 'http://localhost:3000', start: 'npx -y http-server tenis-landing -p 3000 -c-1' });

  const spaced = tmp();
  fs.mkdirSync(path.join(spaced, 'meu site'));
  fs.writeFileSync(path.join(spaced, 'meu site/index.html'), '');
  assert.equal(detectStaticSite(spaced).start, 'npx -y http-server "meu site" -p 3000 -c-1');

  assert.equal(detectStaticSite(tmp()), null);
});

test('init sugere servir o site estático quando não há React', async () => {
  const { init } = await import('../src/init.js');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'tenis-landing'));
  fs.writeFileSync(path.join(dir, 'tenis-landing/index.html'), '<h1>x</h1>');
  const log = console.log;
  console.log = () => {};
  try {
    await init({ cwd: dir, yes: true, tools: 'none', personas: 'margaret' });
  } finally {
    console.log = log;
  }
  const config = fs.readFileSync(path.join(dir, 'ux-validate.config.yml'), 'utf8');
  assert.match(config, /url: http:\/\/localhost:3000\n {2}start: npx -y http-server tenis-landing -p 3000 -c-1/);
});

test('"/" e "/index.html" são a mesma página num servidor (não duplica os problemas)', () => {
  assert.equal(samePage('http://localhost:3000/index.html'), samePage('http://localhost:3000/'));
  assert.equal(samePage('http://x.test/blog/index.htm'), 'http://x.test/blog/');
  assert.notEqual(samePage('http://x.test/planos.html'), samePage('http://x.test/'));
  assert.equal(samePage('file:///site/index.html'), 'file:///site/index.html', 'file:// não muda');
});
