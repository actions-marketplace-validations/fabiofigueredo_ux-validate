import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setLocale } from '../src/i18n.js';
import { normalize, slug } from '../src/checks.js';
import { classifyConsole, decodeMappings, detectFramework, originalPosition, projectFrame, projectPath } from '../src/react.js';
import { searchTerms } from '../src/fix.js';

setLocale('en');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-react-'));

test('rotas de hash (#/planos) contam como páginas; âncoras comuns não', () => {
  assert.equal(normalize('http://x.test/#/planos'), 'http://x.test/#/planos');
  assert.equal(normalize('http://x.test/#!/planos'), 'http://x.test/#!/planos');
  assert.equal(normalize('http://x.test/sobre#equipe'), 'http://x.test/sobre');
  assert.equal(slug('http://x.test/#/planos/pro'), 'planos-pro');
  assert.equal(slug('http://x.test/'), 'home');
});

test('pilha do React 19: ignora o React e dependências e acha o arquivo do projeto', () => {
  const stack = [
    'Error: react-stack-top-frame',
    '    at exports.jsxDEV (http://localhost:5173/@fs/app/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:196:25)',
    '    at Plans (http://localhost:5173/src/Plans.jsx?t=99:30:19)',
    '    at renderWithHooks (http://localhost:5173/@fs/app/node_modules/.vite/deps/react-dom_client.js?v=1:4397:19)',
  ].join('\n');
  assert.deepEqual(projectFrame(stack), { url: 'http://localhost:5173/src/Plans.jsx?t=99', line: 30, column: 19 });

  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.writeFileSync(path.join(cwd, 'src/Plans.jsx'), '');
  assert.equal(projectPath(cwd, 'http://localhost:5173/src/Plans.jsx?t=99'), 'src/Plans.jsx');
  assert.equal(projectPath(cwd, 'webpack-internal:///(app-pages-browser)/./src/Plans.jsx'), 'src/Plans.jsx');
  assert.equal(projectPath(cwd, path.join(cwd, 'src/Plans.jsx')), 'src/Plans.jsx');
  assert.equal(projectPath(cwd, 'http://localhost:5173/src/Missing.jsx'), null);
  assert.equal(projectPath(cwd, '/etc/passwd'), null, 'fora do projeto não vale');
});

test('source map: decodifica VLQ e devolve a linha original', () => {
  // Linha gerada 1 → original linha 1; linha gerada 3 → original linha 2 (fonte 0), coluna 4.
  const map = { version: 3, sources: ['src/App.jsx'], mappings: 'AAAA;;IACA' };
  assert.deepEqual(decodeMappings(map.mappings), [[[0, 0, 0, 0]], [], [[4, 0, 1, 0]]]);
  assert.deepEqual(originalPosition(map, 3, 10), { source: 'src/App.jsx', line: 2 });
  assert.deepEqual(originalPosition({ ...map, sourceRoot: '/app' }, 1, 1), { source: '/app/src/App.jsx', line: 1 });
});

test('avisos do React no console viram categorias próprias', () => {
  const { react, other } = classifyConsole([
    'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys\n\nCheck the render method of `Plans`.',
    'In HTML, <div> cannot be a descendant of <p>.',
    'An error occurred in the <Account> component. Consider adding an error boundary',
    "Hydration failed because the server rendered HTML didn't match the client.",
    'TypeError: x is undefined',
  ]);
  const byKey = Object.fromEntries(react.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(byKey).sort(), ['hydration', 'key', 'nesting', 'renderError']);
  assert.deepEqual([...byKey.key.components], ['Plans']);
  assert.deepEqual([...byKey.renderError.components], ['Account']);
  assert.deepEqual(other, ['TypeError: x is undefined']);
});

test('init sugere URL e comando do servidor de desenvolvimento do framework', () => {
  const pkg = (deps, scripts) => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: deps, scripts }));
    return detectFramework(dir);
  };
  assert.deepEqual(pkg({ react: '19', vite: '8' }, { dev: 'vite' }), { id: 'vite', label: 'React · Vite', url: 'http://localhost:5173', start: 'npm run dev' });
  assert.equal(pkg({ react: '19', next: '16' }, { dev: 'next dev -p 4000' }).url, 'http://localhost:4000');
  assert.equal(pkg({ react: '18', 'react-scripts': '5' }, { start: 'react-scripts start' }).start, 'npm start');
  assert.equal(pkg({ vue: '3', vite: '8' }, { dev: 'vite' }), null, 'sem React, nada muda');
  assert.equal(detectFramework(tmp()), null);
});

test('busca no código: class do HTML também procura className do JSX', () => {
  const terms = searchTerms({ evidence: { snippet: '<button class="assinar">Assinar</button>' } });
  assert.ok(terms.includes('className="assinar"'));
});

// --- Aplicação React de verdade (Vite em modo de desenvolvimento) ---

const demoDir = path.resolve('examples/react-demo');
let server;
let baseUrl;

before(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ root: demoDir, configFile: path.join(demoDir, 'vite.config.js'), logLevel: 'silent', server: { port: 5299, strictPort: false } });
  await server.listen();
  baseUrl = server.resolvedUrls.local[0];
});

after(async () => {
  await server?.close();
});

test('app React (Vite): componentes, arquivo e linha, SPA e avisos do React', { timeout: 180000 }, async () => {
  const { runChecks } = await import('../src/checks.js');
  const { buildSarif } = await import('../src/sarif.js');
  const out = tmp();
  const log = console.log;
  console.log = () => {};
  let result;
  try {
    ({ result } = await runChecks({ cwd: demoDir, url: baseUrl, out }));
  } finally {
    console.log = log;
  }
  const rule = (r) => result.findings.filter((f) => f.rule === r);
  const one = (r) => {
    const list = rule(r);
    assert.equal(list.length >= 1, true, `esperava ${r}`);
    return list[0];
  };

  assert.equal(result.app.framework, 'react');
  assert.equal(result.app.react.dev, true);

  // Liga o problema ao componente e à linha do JSX original (via source map do Vite).
  const lorem = one('leftover-lorem');
  assert.deepEqual(lorem.react.components.slice(0, 2), ['Home', 'App']);
  assert.deepEqual(lorem.sourceHint, { file: 'src/App.jsx', line: 9 });
  const contrast = one('color-contrast');
  assert.deepEqual(contrast.sourceHint, { file: 'src/Plans.jsx', line: 18 });

  // <div onClick> do React não tem atributo onclick no HTML.
  assert.deepEqual(one('clickable').sourceHint, { file: 'src/App.jsx', line: 10 });

  // Avisos do React e erro de renderização que deixa a tela em branco.
  assert.deepEqual(one('react-key').react.components, ['Plans']);
  assert.deepEqual(one('react-renderError').react.components, ['Account']);
  assert.match(one('blank-page').page, /\/conta$/);
  assert.equal(rule('page-has-heading-one').length, 0, 'página em branco não gera ruído do axe');

  // Rota inexistente: o servidor responde 200, mas a aplicação mostra "não encontrada".
  const blog = result.pages.find((p) => p.url.endsWith('/blog'));
  assert.equal(blog.soft404, true);
  assert.match(one('broken-internal-link').evidence.snippet, /\/blog/);

  // Troca de rota sem recarregar: foco e título.
  one('route-change-not-announced');
  one('route-title-unchanged');

  // O SARIF aponta para o arquivo do componente.
  const sarif = buildSarif({ cwd: demoDir, runDir: out });
  const loc = sarif.runs[0].results.find((r) => r.ruleId === 'content/leftover-lorem').locations[0].physicalLocation;
  assert.equal(loc.artifactLocation.uri, 'examples/react-demo/src/App.jsx');
  assert.equal(loc.region.startLine, 9);
});

test('site sem SPA: a checagem de troca de rota não navega de verdade (não trava ao fechar a aba)', { timeout: 60000 }, async () => {
  const { chromium } = await import('playwright');
  const { pathToFileURL } = await import('node:url');
  const { checkClientNavigation } = await import('../src/react.js');
  const browser = await chromium.launch(process.env.UX_VALIDATE_CHROMIUM ? { executablePath: process.env.UX_VALIDATE_CHROMIUM } : {});
  try {
    const page = await browser.newPage();
    const start = pathToFileURL(path.resolve('examples/demo-site/index.html')).href;
    await page.goto(start);
    const found = [];
    const result = await checkClientNavigation(page, { base: { page: start }, add: (f) => found.push(f) });
    assert.equal(result, null, 'link comum: o teste não se aplica');
    assert.equal(found.length, 0);
    assert.equal(page.url(), start, 'continua na mesma página');
    const t0 = Date.now();
    await page.close();
    assert.ok(Date.now() - t0 < 5000, 'fechar a aba é imediato');
  } finally {
    await browser.close();
  }
});
