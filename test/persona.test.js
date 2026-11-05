import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { setLocale } from '../src/i18n.js';
import { slugify, buildPersona, renderPersona, validatePersona, validatePersonas } from '../src/persona.js';
import { sourceDir } from '../src/adapters/index.js';

setLocale('en');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-persona-'));
const write = (dir, name, data) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : YAML.stringify(data));
  return file;
};
const valid = {
  id: 'ana',
  name: 'Ana',
  viewport: 'mobile',
  traits: { tech_literacy: 'low', vision: 'reduzida', patience: 'medium', language: 'pt-BR', reading_level: 'basic' },
  goals: ['Find the price'],
};

test('slugify gera ids válidos a partir do nome', () => {
  assert.equal(slugify('Dona Maria'), 'dona-maria');
  assert.equal(slugify('  João  da Silva!! '), 'joao-da-silva');
  assert.equal(slugify('Raj (dev)'), 'raj-dev');
});

test('renderPersona gera um arquivo que passa na validação', () => {
  const dir = tmp();
  const persona = buildPersona({ ...valid, description: '', expectations: [] });
  const file = write(dir, 'ana.yml', renderPersona(persona));
  assert.deepEqual(validatePersona(file), { errors: [], warnings: [] });
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^# Persona created/);
  assert.ok(!/description:|expectations:/.test(text), 'campos vazios ficam de fora');
});

test('aceita valores de características nos dois idiomas e aponta os inválidos', () => {
  const dir = tmp();
  const { errors } = validatePersona(write(dir, 'x.yml', { ...valid, id: 'x', viewport: 'watch', goals: [], traits: { ...valid.traits, patience: 'zero' } }));
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => /viewport "watch"/.test(e)));
  assert.ok(errors.some((e) => /goals/.test(e)));
  assert.ok(errors.some((e) => /"zero" for patience/.test(e)));
});

test('campos obrigatórios, id inválido, YAML quebrado e aviso de nome diferente', () => {
  const dir = tmp();
  assert.ok(validatePersona(write(dir, 'a.yml', { name: 'A' })).errors.some((e) => /missing: id/.test(e)));
  assert.ok(validatePersona(write(dir, 'b.yml', { ...valid, id: 'Ana Maria' })).errors.some((e) => /invalid id/.test(e)));
  assert.match(validatePersona(write(dir, 'c.yml', 'id: [oops')).errors[0], /invalid YAML/);
  assert.ok(validatePersona(write(dir, 'd.yml', valid)).warnings.some((w) => /differs from the file name/.test(w)));
});

test('validatePersonas confere a pasta inteira e detecta ids repetidos', () => {
  const cwd = tmp();
  const dir = path.join(cwd, '.ux-validate/personas');
  fs.mkdirSync(dir, { recursive: true });
  write(dir, 'ana.yml', valid);
  write(dir, 'ana-2.yml', valid);
  const logs = [];
  assert.throws(() => validatePersonas({ cwd, log: (m) => logs.push(m) }), /1 persona/);
  assert.ok(logs.some((l) => /also used by/.test(l)));
});

test('as personas de exemplo dos dois idiomas são válidas', () => {
  for (const locale of ['en', 'pt-BR']) {
    const dir = path.join(sourceDir(locale), 'personas');
    for (const file of fs.readdirSync(dir)) {
      const { errors, warnings } = validatePersona(path.join(dir, file));
      assert.deepEqual(errors, [], `${locale}/${file}`);
      assert.deepEqual(warnings, [], `${locale}/${file}`);
    }
  }
});

test('sem personas, explica como criar', () => {
  assert.throws(() => validatePersonas({ cwd: tmp(), log: () => {} }), /persona new/);
});

test('personas pré-definidas: ficha com as características e cópia para o projeto', async () => {
  const { loadPresets, describePersona, addPresets, showPresets } = await import('../src/persona.js');
  const presets = loadPresets('en');
  assert.deepEqual(presets.map((p) => p.persona.id), ['lucas-screen-reader', 'margaret', 'raj-dev', 'tom-color-blind']);
  const card = describePersona(presets.find((p) => p.persona.id === 'margaret').persona);
  assert.match(card, /● Margaret \(margaret\)/);
  assert.match(card, /Device: Phone \(mobile\)/);
  assert.match(card, /Vision: Reduced/);
  assert.match(describePersona(presets.find((p) => p.persona.id === 'tom-color-blind').persona), /Vision: Color-blind: can't rely on color alone/);
  assert.match(card, /Goals:\n {6}- Understand what the company offers/);

  setLocale('pt-BR');
  try {
    // Valores em inglês também aparecem com o rótulo traduzido.
    assert.match(describePersona({ ...valid, traits: { ...valid.traits, vision: 'screen-reader' } }), /Visão: Leitor de tela/);
    const out = [];
    showPresets({ log: (l) => out.push(l) });
    assert.match(out.join('\n'), /Dona Maria \(dona-maria\)[\s\S]*npx ux-validate persona add all/);
  } finally {
    setLocale('en');
  }

  const dir = tmp();
  const results = addPresets({ cwd: dir, ids: ['margaret'], log: () => {} });
  assert.deepEqual(results, [{ rel: '.ux-validate/personas/margaret.yml', status: 'created' }]);
  assert.equal(addPresets({ cwd: dir, ids: ['all'], log: () => {} }).filter((r) => r.status === 'kept').length, 1);
  assert.throws(() => addPresets({ cwd: dir, ids: ['nobody'], log: () => {} }), /Unknown predefined persona: nobody/);
});
