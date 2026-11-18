import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setLocale } from '../src/i18n.js';
import { buildBrief, shortPage } from '../src/brief.js';
import { registerJsonMcp, PLAYWRIGHT_MCP } from '../src/adapters/shared.js';

setLocale('en');

test('caminhos curtos a partir da URL inicial', () => {
  assert.equal(shortPage('http://localhost:3000/plans?x=1', 'http://localhost:3000/'), '/plans?x=1');
  assert.equal(shortPage('file:///C:/site/contato.html', 'file:///C:/site/index.html'), '/contato.html');
  assert.equal(shortPage('http://localhost:3000/#/conta', 'http://localhost:3000/'), '/#/conta');
  assert.equal(shortPage('https://other.example/x', 'http://localhost:3000/'), 'https://other.example/x');
});

test('resumo para o agente: agrupa, encurta e deixa de fora o que o agente não usa', () => {
  const base = 'http://localhost:3000/';
  const contrast = (n, page) => ({
    id: `C00${n}`,
    source: 'check:axe',
    category: 'accessibility',
    severity: 'high',
    rule: 'color-contrast',
    title: 'Elements must meet minimum color contrast ratio thresholds',
    description: 'Long axe description',
    page,
    evidence: { screenshot: 'screenshots/x.png', selector: 'a', snippet: '<a href="/">Home</a>' },
    suggestion: 'Generic suggestion',
    helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
    viewports: ['mobile', 'desktop'],
  });
  const result = {
    url: base,
    viewports: ['mobile', 'desktop'],
    app: { framework: 'react', react: { version: '18.3.1', dev: true } },
    taskWarnings: [{ id: 'price', labels: ['pricing'] }],
    pages: [
      { url: base, status: 200, title: 'Home', ariaTree: 'aria/home.yml' },
      { url: `${base}plans`, status: 200, title: 'Plans | Acme', ariaTree: 'aria/plans.yml' },
    ],
    findings: [
      { id: 'C001', source: 'check:links', category: 'navigation', severity: 'medium', rule: 'broken', title: 'Broken link', description: `Target: ${base}missing`, page: base, viewports: [] },
      ...[2, 3, 4, 5, 6, 7].map((n) => contrast(n, n % 2 ? `${base}plans` : base)),
      { id: 'C008', source: 'check:color', category: 'accessibility', severity: 'critical', rule: 'cvd-state', title: 'State only by color', audience: 'color-blind', page: base, evidence: { snippet: '<button>Tab</button>' }, sourceHint: { file: 'src/Tabs.jsx', line: 12 }, viewports: ['desktop'] },
    ],
  };
  const md = buildBrief(result);
  assert.match(md, /react 18\.3\.1 \(dev\)/);
  assert.match(md, /8 issues: 1 critical, 6 high, 1 medium, 0 low/);
  assert.match(md, /\| \/plans \| Plans \/ Acme \| 200 \| aria\/plans\.yml \|/);
  assert.match(md, /- price: "pricing"/);
  // Mais grave primeiro; o mesmo problema em várias páginas vira um grupo com os ids.
  assert.ok(md.indexOf('State only by color') < md.indexOf('Elements must meet'));
  assert.match(md, /color-contrast\) ×6/);
  assert.match(md, /- C003 \/plans mobile\/desktop: <a href="\/">Home<\/a>/);
  assert.match(md, /…and 2 more: C006, C007/);
  assert.match(md, /only for color-blind/);
  assert.match(md, /→ src\/Tabs\.jsx:12/);
  assert.match(md, /C001 \/: Target: \/missing/);
  // O que só o relatório usa fica no checks.json.
  assert.doesNotMatch(md, /dequeuniversity|screenshots\/x\.png|Generic suggestion/);
  assert.ok(md.length < JSON.stringify(result, null, 2).length / 2);
});

test('MCP do Playwright: atualiza a configuração antiga do ux-validate e mantém a do usuário', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-mcp-'));
  const write = (entry) => fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { playwright: entry } }));
  const read = () => JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers.playwright;
  assert.ok(PLAYWRIGHT_MCP.args.includes('--console-level'));

  write({ command: 'npx', args: ['@playwright/mcp@0.0.83'] });
  registerJsonMcp(dir, '.mcp.json');
  assert.deepEqual(read(), PLAYWRIGHT_MCP);

  const mine = { command: 'npx', args: ['@playwright/mcp@0.0.80', '--headless'] };
  write(mine);
  assert.equal(registerJsonMcp(dir, '.mcp.json').status, 'mcpKept');
  assert.deepEqual(read(), mine);
});
