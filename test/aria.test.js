import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { runAriaChecks } from '../src/aria.js';

const demo = (file) => pathToFileURL(path.resolve('examples/demo-site', file)).href;

async function check(file) {
  const browser = await chromium.launch(
    process.env.UX_VALIDATE_CHROMIUM ? { executablePath: process.env.UX_VALIDATE_CHROMIUM } : {},
  );
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-aria-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(demo(file));
    const findings = [];
    const entry = {};
    await runAriaChecks(page, { base: { page: demo(file) }, add: (f) => findings.push(f), shot: 'x.png', runDir, entry, name: 'pagina' });
    return { findings, titles: findings.map((f) => f.title), entry, runDir };
  } finally {
    await browser.close();
  }
}

test('ajuda.html: detecta widgets sem foco, div clicável, foco invisível e aria-expanded parado', async () => {
  const { titles, findings, entry, runDir } = await check('ajuda.html');
  assert.ok(titles.includes('Widget com papel ARIA que não recebe foco do teclado'));
  assert.ok(titles.includes('Elemento clicável inacessível pelo teclado'));
  assert.ok(titles.includes('Foco do teclado invisível'));
  assert.ok(titles.includes('aria-expanded não acompanha o abrir e fechar'));
  assert.ok(findings.every((f) => f.category === 'accessibility'));
  assert.match(fs.readFileSync(path.join(runDir, entry.ariaTree), 'utf8'), /tablist "Tipo de conta"/);
});

test('contato.html: detecta campos só com placeholder', async () => {
  const { titles } = await check('contato.html');
  assert.ok(titles.includes('Campo de formulário identificado só pelo placeholder'));
});

test('página acessível não gera falsos positivos', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-ok-')), 'ok.html');
  fs.writeFileSync(
    file,
    `<!doctype html><html lang="pt-BR"><body><main><h1>Ok</h1>
     <button aria-expanded="false" aria-controls="p" onclick="const o=p.hidden;p.hidden=!o;this.setAttribute('aria-expanded',String(o))">Detalhes</button>
     <div id="p" hidden>Texto</div>
     <label for="n">Nome</label><input id="n" placeholder="Seu nome">
     <a href="#x">Link</a></main></body></html>`,
  );
  const browser = await chromium.launch(
    process.env.UX_VALIDATE_CHROMIUM ? { executablePath: process.env.UX_VALIDATE_CHROMIUM } : {},
  );
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(file).href);
    const findings = [];
    await runAriaChecks(page, { base: {}, add: (f) => findings.push(f), shot: 'x.png', runDir: path.dirname(file), entry: {}, name: 'ok' });
    assert.deepEqual(findings.map((f) => f.title), []);
  } finally {
    await browser.close();
  }
});
