import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t, setLocale, detectLocale, normalizeLocale, LOCALES } from '../src/i18n.js';
import { loadCommands, sourceDir } from '../src/adapters/index.js';
import { analyze } from '../src/report.js';
import { applyEdits } from '../src/fix.js';

const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

test('os dois catálogos têm exatamente as mesmas chaves', () => {
  assert.deepEqual(keys(LOCALES.en).sort(), keys(LOCALES['pt-BR']).sort());
});

test('detecta o idioma pelo ambiente, com inglês como padrão', () => {
  assert.equal(detectLocale({ LANG: 'pt_BR.UTF-8' }), 'pt-BR');
  assert.equal(detectLocale({ LANG: 'en_US.UTF-8' }), 'en');
  assert.equal(detectLocale({ UX_VALIDATE_LOCALE: 'pt', LANG: 'en_US' }), 'pt-BR');
  assert.equal(normalizeLocale('fr'), null);
});

test('mensagens com parâmetros e plural nos dois idiomas', () => {
  setLocale('en');
  assert.equal(t('checks.console.description', { n: 1 }), '1 error while loading the page. Features may be broken.');
  assert.equal(t('fix.confirmWrite', { n: 2, file: 'a.html' }), 'Save 2 fixes to a.html?');
  setLocale('pt-BR');
  assert.equal(t('fix.confirmWrite', { n: 2, file: 'a.html' }), 'Gravar 2 correção(ões) em a.html?');
  setLocale('xx');
  assert.equal(t('report.title'), 'ux-validate report', 'idioma desconhecido cai no inglês');
});

test('comandos e referências existem nos dois idiomas, com os mesmos arquivos', () => {
  for (const sub of ['commands', 'references', 'personas']) {
    const en = fs.readdirSync(path.join(sourceDir('en'), sub)).length;
    const pt = fs.readdirSync(path.join(sourceDir('pt-BR'), sub)).length;
    assert.equal(en, pt, sub);
  }
  assert.deepEqual(fs.readdirSync(path.join(sourceDir('en'), 'commands')), fs.readdirSync(path.join(sourceDir('pt-BR'), 'commands')));
  const en = loadCommands('en').find((c) => c.name === 'persona-test');
  const pt = loadCommands('pt-BR').find((c) => c.name === 'persona-test');
  assert.match(en.body, /Step 1: prepare/);
  assert.match(en.body, /\.ux-validate\/dictionary\.txt/);
  assert.match(pt.body, /Passo 1: preparar/);
  assert.match(pt.body, /\.ux-validate\/dicionario\.txt/);
});

test('relatório e fix em inglês', () => {
  setLocale('en');
  const { scores } = analyze({ findings: [], pages: [] }, null);
  assert.equal(scores[0].persona.name, 'Overall (no persona)');
  const { failed } = applyEdits('a a', [{ findingId: 'X', find: 'a', replace: 'b' }], new Set(['X']));
  assert.equal(failed[0].reason, 'the text to replace appears more than once');
});

test('init em inglês grava config, dicionário e personas em inglês', async () => {
  setLocale('en');
  const { init } = await import('../src/init.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-init-en-'));
  const logs = [];
  const original = console.log;
  console.log = (m) => logs.push(m);
  try {
    await init({ cwd: dir, yes: true });
  } finally {
    console.log = original;
  }
  const config = fs.readFileSync(path.join(dir, 'ux-validate.config.yml'), 'utf8');
  assert.match(config, /^locale: en$/m);
  assert.match(config, /^language: en$/m);
  assert.ok(fs.existsSync(path.join(dir, '.ux-validate/dictionary.txt')));
  assert.ok(fs.existsSync(path.join(dir, '.ux-validate/personas/margaret.yml')));
  assert.match(fs.readFileSync(path.join(dir, '.claude/skills/persona-fix/SKILL.md'), 'utf8'), /Applies the fixes/);
  assert.ok(logs.some((l) => /Next steps/.test(l)));
});
