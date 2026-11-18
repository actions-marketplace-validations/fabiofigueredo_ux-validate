import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze } from '../src/report.js';
import { setLocale } from '../src/i18n.js';

// Estes testes conferem as mensagens em português.
setLocale('pt-BR');

const agent = JSON.parse(fs.readFileSync(new URL('../examples/sample-findings.json', import.meta.url)));

const checks = {
  url: 'http://localhost:4321/index.html',
  pages: [],
  findings: [
    { id: 'C011', source: 'check:content', category: 'content', severity: 'high', title: 'Lorem', viewports: [] },
    { id: 'C099', source: 'check:layout', category: 'ui', severity: 'high', title: 'Rolagem', viewports: ['mobile'] },
  ],
};

test('achado do agente esconde a checagem fixa que ele já detalhou', () => {
  const { findings } = analyze(checks, agent);
  assert.ok(!findings.some((f) => f.id === 'C011'));
  assert.ok(findings.some((f) => f.id === 'C099'));
});

test('checagem fixa afeta só as personas do tamanho de tela em que apareceu', () => {
  const { findings } = analyze(checks, agent);
  assert.deepEqual(findings.find((f) => f.id === 'C099').affects, ['dona-maria']);
});

test('críticos vêm primeiro e notas ficam entre 0 e 100', () => {
  const { findings, scores } = analyze(checks, agent);
  assert.equal(findings[0].severity, 'critical');
  for (const s of scores) {
    for (const k of ['content', 'navigation', 'ui', 'overall']) assert.ok(s[k] >= 0 && s[k] <= 100, `${k}=${s[k]}`);
  }
  assert.equal(scores.find((s) => s.persona.id === 'lucas-leitor-de-tela').goalRate, 0);
});

test('sem findings.json, gera notas gerais a partir das checagens', () => {
  const { scores } = analyze(checks, null);
  assert.equal(scores.length, 1);
  assert.equal(scores[0].persona.name, 'Geral (sem persona)');
});

test('report.html só cria links http(s), file ou relativos (bloqueia javascript: vindo das páginas)', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const { buildReport } = await import('../src/report.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-report-'));
  const finding = (id, extra) => ({ id, severity: 'high', source: 'check:content', category: 'content', title: 'T', description: 'D', suggestion: 'S', ...extra });
  fs.writeFileSync(
    path.join(dir, 'checks.json'),
    JSON.stringify({
      url: 'http://localhost/',
      pages: [{ url: 'http://localhost/' }],
      findings: [
        finding('C001', { page: 'javascript:alert(1)', helpUrl: 'JavaScript:alert(2)', evidence: { screenshot: 'data:text/html,<script>alert(3)</script>' } }),
        finding('C002', { page: 'http://localhost/ok', helpUrl: 'https://dequeuniversity.com/rules/axe/x', evidence: { screenshot: 'screenshots/home.png' } }),
      ],
    }),
  );
  const log = console.log;
  console.log = () => {};
  try {
    await buildReport({ cwd: dir, run: dir });
  } finally {
    console.log = log;
  }
  const html = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
  assert.doesNotMatch(html, /href="javascript:|href="JavaScript:|src="data:/i);
  assert.match(html, /href="http:\/\/localhost\/ok"/);
  assert.match(html, /src="screenshots\/home\.png"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('report.html: identidade visual do ux-validate, números principais e plano em lista', async () => {
  const { buildReport } = await import('../src/report.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-design-'));
  const run = path.join(dir, 'run');
  fs.mkdirSync(run);
  fs.writeFileSync(
    path.join(run, 'checks.json'),
    JSON.stringify({ url: 'http://localhost/', pages: [{ url: 'http://localhost/', ok: true, title: 'Acme' }], findings: [{ id: 'C001', category: 'ui', severity: 'high', title: 'Overflow', page: 'http://localhost/plans' }] }),
  );
  fs.writeFileSync(
    path.join(run, 'findings.json'),
    JSON.stringify({ personas: [{ id: 'm', name: 'Margaret', viewport: 'mobile', goals: [{ goal: 'Find the price', outcome: 'fail', steps: 9 }] }], findings: [] }),
  );
  const log = console.log;
  console.log = () => {};
  try {
    await buildReport({ cwd: dir, run });
  } finally {
    console.log = log;
  }
  const html = fs.readFileSync(path.join(run, 'report.html'), 'utf8');
  assert.match(html, /<title>[^<]*Acme<\/title>/);
  assert.match(html, /class="logo"><span class="dots"/);
  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /class="hand"/);
  assert.match(html, /class="kpis"/);
  assert.match(html, /role="img" aria-label="[^"]+ \d+ /, 'nota com texto alternativo');
  assert.match(html, /<ol><li><span><a href="#f-C001">Overflow<\/a>/, 'corrigir primeiro aponta para o problema');
  assert.match(html, /id="f-C001"/);
  assert.match(html, /<small[^>]*>[^<]*\/plans/, 'endereço curto no plano');
  assert.doesNotMatch(html, /prefers-color-scheme:dark/);
});
