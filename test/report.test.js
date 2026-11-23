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
  // O relatório é um site: confere todas as páginas.
  const html = fs.readdirSync(dir).filter((f) => /^report.*\.html$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.doesNotMatch(html, /href="javascript:|href="JavaScript:|src="data:/i);
  assert.match(html, /href="http:\/\/localhost\/ok"/);
  assert.match(html, /src="screenshots\/home\.png"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('relatório em páginas: visão geral, áreas, logo do cliente e rodapé com quem avaliou', async () => {
  setLocale('en');
  const { buildReport } = await import('../src/report.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-site-'));
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  fs.writeFileSync(path.join(dir, 'ux-validate.config.yml'), 'app:\n  url: http://localhost/\nreport:\n  client: Cliente X\n  logo: logo.svg\n');
  const run = path.join(dir, 'run');
  fs.mkdirSync(run);
  fs.writeFileSync(path.join(run, 'report-color-vision.html'), 'antiga'); // página de uma geração anterior
  fs.writeFileSync(
    path.join(run, 'checks.json'),
    JSON.stringify({ url: 'http://localhost/', pages: [{ url: 'http://localhost/', ok: true, title: 'Acme' }], findings: [{ id: 'C001', category: 'ui', severity: 'high', title: 'Overflow', page: 'http://localhost/plans' }] }),
  );
  fs.writeFileSync(
    path.join(run, 'findings.json'),
    JSON.stringify({ agent: { tool: 'claude-code', model: 'claude-opus-5-5' }, personas: [{ id: 'm', name: 'Margaret', viewport: 'mobile', goals: [{ goal: 'Find the price', outcome: 'fail', steps: 9 }] }], findings: [] }),
  );
  const log = console.log;
  console.log = () => {};
  try {
    await buildReport({ cwd: dir, run });
  } finally {
    console.log = log;
  }
  const files = fs.readdirSync(run).filter((f) => /^report/.test(f)).sort();
  assert.deepEqual(files, ['report-issues.html', 'report-logo.svg', 'report-personas.html', 'report.css', 'report.html', 'report.md']);
  const home = fs.readFileSync(path.join(run, 'report.html'), 'utf8');
  assert.match(home, /<title>Overview · validation report · Cliente X<\/title>/);
  assert.match(home, /<img src="report-logo\.svg" alt="Cliente X"/);
  assert.match(home, /<link rel="stylesheet" href="report\.css">/);
  assert.match(home, /<a href="report\.html" aria-current="page">Overview<\/a>/);
  assert.match(home, /<a href="report-issues\.html">Issues<span class="n">1<\/span><\/a>/);
  assert.match(home, /class="kpis"/);
  assert.match(home, /<ol><li><span><a href="report-issues\.html#f-C001">Overflow<\/a>/, 'corrigir primeiro aponta para o problema');
  assert.match(home, /<footer>[\s\S]*Evaluated by claude-code · claude-opus-5-5[\s\S]*Built by ux-validate/, 'quem avaliou fica no rodapé');
  assert.doesNotMatch(home.split('<footer>')[0], /claude-opus-5-5/, 'e não no topo');
  assert.doesNotMatch(home, /prefers-color-scheme:dark/);
  const issues = fs.readFileSync(path.join(run, 'report-issues.html'), 'utf8');
  assert.match(issues, /<details class="finding" id="f-C001"/);
  assert.match(issues, /aria-current="page">Issues/);
  assert.match(fs.readFileSync(path.join(run, 'report-personas.html'), 'utf8'), /id="p-m"/);
});
