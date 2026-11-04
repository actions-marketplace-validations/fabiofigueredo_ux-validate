import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
