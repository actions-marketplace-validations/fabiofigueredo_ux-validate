import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { analyzeColors, contrast, deltaE, runColorVisionChecks, simulate } from '../src/color.js';
import { analyze } from '../src/report.js';
import { setLocale } from '../src/i18n.js';

setLocale('en');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test('simulação: preto, branco e cinzas não mudam; vermelho escurece na protanopia', () => {
  for (const type of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']) {
    assert.deepEqual(simulate([0, 0, 0], type), [0, 0, 0]);
    assert.deepEqual(simulate([255, 255, 255], type), [255, 255, 255]);
    const gray = simulate([128, 128, 128], type);
    assert.ok(gray.every((v) => Math.abs(v - 128) <= 1), `${type}: ${gray}`);
  }
  const red = simulate([255, 0, 0], 'protanopia');
  assert.ok(red[0] < 150, 'quem tem protanopia vê o vermelho bem mais escuro');
  const gray = simulate([255, 0, 0], 'achromatopsia');
  assert.equal(gray[0], gray[1]);
});

test('contraste do WCAG e diferença de cor (CIEDE2000)', () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(contrast([10, 20, 30], [10, 20, 30]), 1);
  assert.ok(deltaE([255, 255, 255], [255, 255, 255]) < 1e-9);
  // Par de referência de Sharma et al. (2005) convertido de L*a*b*: diferença perceptível, não enorme.
  assert.ok(deltaE(hex('#43a047'), hex('#e53935')) > 50, 'verde e vermelho: muito diferentes normalmente');
  assert.ok(deltaE(simulate(hex('#43a047'), 'deuteranopia'), simulate(hex('#e53935'), 'deuteranopia')) < 7, 'quase iguais com deuteranopia');
});

test('analyzeColors: texto, indicadores e estado só pela cor (sem navegador)', () => {
  const issues = analyzeColors({
    texts: [
      { selector: 'p.error', text: 'Payment failed', fg: hex('#ff3b30'), bg: hex('#1c1c1e'), large: false },
      { selector: 'p.ok', text: 'All good', fg: [0, 0, 0], bg: [255, 255, 255], large: false },
      { selector: 'p.low', text: 'Low for everyone', fg: hex('#999999'), bg: [255, 255, 255], large: false },
    ],
    indicators: [
      { selector: 'tr:nth-of-type(1) .dot', group: 'table', color: hex('#43a047') },
      { selector: 'tr:nth-of-type(2) .dot', group: 'table', color: hex('#e53935') },
      { selector: 'tr:nth-of-type(3) .dot', group: 'table', color: hex('#43a047') },
    ],
    groups: [
      [
        { text: 'All', fg: [255, 255, 255], bg: hex('#43a047'), border: null },
        { text: 'Overdue', fg: [255, 255, 255], bg: hex('#e53935'), border: null },
        { text: 'Paid', fg: [255, 255, 255], bg: hex('#43a047'), border: null },
      ],
      // Categorias (cada item de uma cor): não é um estado.
      [
        { text: 'A', fg: [0, 0, 0], bg: hex('#43a047'), border: null },
        { text: 'B', fg: [0, 0, 0], bg: hex('#e53935'), border: null },
      ],
    ],
  });
  assert.deepEqual(issues.contrast.map((i) => [i.selector, i.type]), [['p.error', 'protanopia']]);
  assert.equal(issues.indicators.length, 1, 'o mesmo par de cores conta uma vez');
  assert.equal(issues.indicators[0].type, 'deuteranopia');
  assert.deepEqual(issues.state.map((i) => i.odd.text), ['Overdue']);
});

test('página real: encontra os três problemas, ignora os controles e gera as capturas simuladas', { timeout: 60000 }, async () => {
  const browser = await chromium.launch(process.env.UX_VALIDATE_CHROMIUM ? { executablePath: process.env.UX_VALIDATE_CHROMIUM } : {});
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-color-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const url = pathToFileURL(path.resolve('test/fixtures/color-vision.html')).href;
    await page.goto(url);
    const found = [];
    const entry = {};
    await runColorVisionChecks(page, { base: { page: url }, add: (f) => found.push(f), shot: 'screenshots/x.png', runDir, name: 'orders', entry });
    const byRule = Object.fromEntries(found.map((f) => [f.rule, f]));
    assert.deepEqual(Object.keys(byRule).sort(), ['cvd-contrast', 'cvd-indicators', 'cvd-state']);
    for (const f of found) assert.equal(f.audience, 'color-blind');

    assert.match(byRule['cvd-contrast'].evidence.snippet, /Payment failed/);
    assert.doesNotMatch(byRule['cvd-contrast'].evidence.snippet, /Need help/, 'texto branco no fundo escuro continua legível');
    assert.match(byRule['cvd-state'].description, /"Overdue"/);
    assert.doesNotMatch(byRule['cvd-state'].evidence.snippet, /Month/, 'aba marcada por borda e negrito não é problema');
    assert.equal(byRule['cvd-indicators'].evidence.selector.split(' | ').length, 2, 'só as bolinhas sem texto ao lado');

    assert.deepEqual(Object.keys(entry.colorVision), ['normal', 'protanopia', 'deuteranopia', 'tritanopia']);
    for (const file of Object.values(entry.colorVision)) assert.ok(fs.statSync(path.join(runDir, file)).size > 1000, file);
    // A evidência mostra a página como a pessoa daltônica a vê.
    assert.equal(byRule['cvd-state'].evidence.screenshot, entry.colorVision.deuteranopia);
  } finally {
    await browser.close();
  }
});

test('relatório: problemas de cor contam só para personas com daltonismo', () => {
  const checks = {
    url: 'http://localhost/',
    pages: [{ url: 'http://localhost/', colorVision: { normal: 'color-vision/home-normal.jpg', deuteranopia: 'color-vision/home-deuteranopia.jpg' } }],
    findings: [
      { id: 'C001', severity: 'high', source: 'check:color', category: 'accessibility', audience: 'color-blind', rule: 'cvd-state', page: 'http://localhost/', title: 'T', description: 'D' },
      { id: 'C002', severity: 'high', source: 'check:axe', category: 'accessibility', rule: 'image-alt', page: 'http://localhost/', title: 'T', description: 'D' },
    ],
  };
  const agent = { personas: [{ id: 'tom', name: 'Tom', viewport: 'desktop' }, { id: 'ana', name: 'Ana', viewport: 'desktop' }] };
  const traits = { tom: { vision: 'color-blind' }, ana: { vision: 'normal' } };
  const d = analyze(checks, agent, { traits });
  assert.deepEqual(d.findings.find((f) => f.id === 'C001').affects, ['tom']);
  assert.deepEqual(d.findings.find((f) => f.id === 'C002').affects, ['tom', 'ana']);
  const score = (id) => d.scores.find((s) => s.persona.id === id).accessibility;
  assert.ok(score('tom') < score('ana'), 'a nota de acessibilidade do Tom cai mais');
  // Valor em português também vale.
  assert.deepEqual(analyze(checks, agent, { traits: { tom: { vision: 'daltonismo' }, ana: {} } }).findings.find((f) => f.id === 'C001').affects, ['tom']);
});
