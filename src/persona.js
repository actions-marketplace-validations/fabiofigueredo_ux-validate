import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { confirm, input, select } from '@inquirer/prompts';
import { VIEWPORTS, loadConfig } from './config.js';
import { t, getLocale } from './i18n.js';
import { sourceDir } from './adapters/index.js';

/**
 * Criação e validação de personas.
 * Os valores das características são gravados no idioma da ferramenta, mas os dois idiomas são aceitos
 * (o agente trata `low` e `baixa` como a mesma coisa).
 */

export const TRAITS = {
  tech_literacy: { en: ['low', 'medium', 'high'], 'pt-BR': ['baixa', 'média', 'alta'] },
  vision: {
    en: ['normal', 'reduced', 'color-blind', 'screen-reader'],
    'pt-BR': ['normal', 'reduzida', 'daltonismo', 'leitor-de-tela'],
  },
  patience: { en: ['low', 'medium', 'high'], 'pt-BR': ['baixa', 'média', 'alta'] },
  reading_level: { en: ['basic', 'intermediate', 'advanced'], 'pt-BR': ['básico', 'intermediário', 'avançado'] },
};
const DEFAULT_TRAIT = { tech_literacy: 1, vision: 0, patience: 1, reading_level: 1 };
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Dona Maria" -> "dona-maria" */
export function slugify(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function personasDir(cwd, configPath) {
  let dir = '.ux-validate/personas';
  try {
    dir = loadConfig(cwd, configPath).personas ?? dir;
  } catch {
    // Sem configuração: usa a pasta padrão.
  }
  return path.resolve(cwd, dir);
}

function contentLanguage(cwd, configPath) {
  try {
    return loadConfig(cwd, configPath).language;
  } catch {
    return getLocale();
  }
}

/** Monta o objeto da persona na ordem dos campos do formato documentado. */
export function buildPersona(a) {
  const persona = {
    id: a.id,
    name: a.name,
    ...(a.description ? { description: a.description } : {}),
    viewport: a.viewport,
    traits: {
      tech_literacy: a.traits.tech_literacy,
      vision: a.traits.vision,
      patience: a.traits.patience,
      language: a.traits.language,
      reading_level: a.traits.reading_level,
    },
    goals: a.goals,
    ...(a.expectations?.length ? { expectations: a.expectations } : {}),
  };
  return persona;
}

export function renderPersona(persona) {
  return `${t('persona.fileHeader')}\n${YAML.stringify(persona, { lineWidth: 100 })}`;
}

/** Assistente interativo: `ux-validate persona new`. */
export async function newPersona({ cwd, configPath, force = false, log = console.log }) {
  const dir = personasDir(cwd, configPath);
  const locale = getLocale();
  log(`\n${t('persona.title')}\n${t('persona.intro')}\n`);

  const name = await input({ message: t('persona.nameQ'), required: true });
  const id = await input({
    message: t('persona.idQ'),
    default: slugify(name),
    validate: (value) => {
      if (!ID_PATTERN.test(value)) return t('persona.idInvalid');
      if (!force && fs.existsSync(path.join(dir, `${value}.yml`))) return t('persona.idExists', { id: value });
      return true;
    },
  });
  const description = await input({ message: t('persona.descriptionQ') });
  const viewport = await select({
    message: t('persona.viewportQ'),
    default: 'mobile',
    choices: Object.keys(VIEWPORTS).map((v) => ({ name: t(`persona.viewports.${v}`), value: v })),
  });

  const traits = {};
  for (const trait of Object.keys(TRAITS)) {
    const values = TRAITS[trait][locale] ?? TRAITS[trait].en;
    traits[trait] = await select({
      message: t(`persona.traits.${trait}.question`),
      default: values[DEFAULT_TRAIT[trait]],
      choices: values.map((value, i) => ({ name: t(`persona.traits.${trait}.options`)[i], value })),
    });
  }
  traits.language = await input({ message: t('persona.languageQ'), default: contentLanguage(cwd, configPath) });

  log(`\n${t('persona.goalsHint')}`);
  const goals = await collect((n) => t('persona.goalQ', { n }), { min: 1 });
  log(`\n${t('persona.expectationsHint')}`);
  const expectations = await collect((n) => t('persona.expectationQ', { n }), { min: 0 });

  const persona = buildPersona({ id, name, description, viewport, traits, goals, expectations });
  const content = renderPersona(persona);
  log(`\n${t('persona.preview')}\n\n${content}`);
  if (!(await confirm({ message: t('persona.saveQ'), default: true }))) {
    log(t('persona.cancelled'));
    return null;
  }

  const file = path.join(dir, `${id}.yml`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content);
  log(`\n${t('persona.saved', { file: path.relative(cwd, file) })}`);
  log(t('persona.next', { id }));
  return { file, persona };
}

async function collect(message, { min }) {
  const items = [];
  for (;;) {
    const required = items.length < min;
    const value = (await input({ message: message(items.length + 1), required })).trim();
    if (!value) return items;
    items.push(value);
  }
}

/** Personas pré-definidas que acompanham o ux-validate, no idioma da ferramenta. */
export function loadPresets(locale = getLocale()) {
  const dir = path.join(sourceDir(locale), 'personas');
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((file) => {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      return { file, content, persona: YAML.parse(content) };
    });
}

/** Ficha de uma persona para o terminal: quem é, aparelho, características, objetivos e expectativas. */
export function describePersona(p) {
  const locale = getLocale();
  const label = (trait, value) => {
    const values = TRAITS[trait];
    let i = values[locale]?.indexOf(value) ?? -1;
    if (i < 0) i = values.en.indexOf(value);
    if (i < 0) i = values['pt-BR'].indexOf(value);
    const option = i >= 0 ? t(`persona.traits.${trait}.options`)[i] : value;
    return `${t(`persona.labels.${trait}`)}: ${option}`;
  };
  const lines = [`● ${p.name} (${p.id})`];
  if (p.description) lines.push(...wrap(String(p.description).trim(), 4));
  if (p.viewport) lines.push(`    ${t('persona.labels.viewport')}: ${t(`persona.viewports.${p.viewport}`)}`);
  for (const trait of Object.keys(TRAITS)) {
    if (p.traits?.[trait] != null) lines.push(`    ${label(trait, String(p.traits[trait]))}`);
  }
  if (p.goals?.length) {
    lines.push(`    ${t('persona.labels.goals')}:`);
    for (const g of p.goals) lines.push(`      - ${g}`);
  }
  if (p.expectations?.length) {
    lines.push(`    ${t('persona.labels.expectations')}:`);
    for (const e of p.expectations) lines.push(`      - ${e}`);
  }
  return lines.join('\n');
}

function wrap(text, indent, width = 96) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && indent + line.length + word.length + 1 > width) {
      out.push(' '.repeat(indent) + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(' '.repeat(indent) + line);
  return out;
}

/** `ux-validate persona examples`: mostra as personas pré-definidas e suas características. */
export function showPresets({ log = console.log } = {}) {
  const presets = loadPresets();
  log(`\n${t('persona.presets.title')}\n`);
  for (const { persona } of presets) log(`${describePersona(persona)}\n`);
  log(t('persona.presets.howToAdd', { ids: presets.map((p) => p.persona.id).join(' ') }));
  return presets;
}

/**
 * `ux-validate persona add <ids…|all>`: copia personas pré-definidas para a pasta do projeto.
 * Não sobrescreve arquivos existentes sem `force`.
 */
export function addPresets({ cwd, configPath, ids = [], force = false, log = console.log }) {
  const presets = loadPresets();
  const all = presets.map((p) => p.persona.id);
  const wanted = !ids.length || ids.includes('all') ? all : ids;
  const unknown = wanted.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(t('persona.presets.unknown', { list: unknown.join(', '), valid: all.join(', ') }));

  const dir = personasDir(cwd, configPath);
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  for (const { file, content, persona } of presets) {
    if (!wanted.includes(persona.id)) continue;
    const target = path.join(dir, file);
    const rel = path.relative(cwd, target).split(path.sep).join('/');
    if (fs.existsSync(target) && !force) {
      results.push({ rel, status: 'kept' });
      continue;
    }
    fs.writeFileSync(target, content);
    results.push({ rel, status: 'created' });
  }
  for (const r of results) log(`  ${t(`status.${r.status}`).padEnd(10)} ${r.rel}`);
  return results;
}

/** Quantas personas o projeto já tem. */
export function countPersonas(cwd, configPath) {
  const dir = personasDir(cwd, configPath);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).length : 0;
}

/** Confere um arquivo de persona. Devolve os erros e avisos encontrados. */
export function validatePersona(file) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { errors: [t('persona.validate.parseError', { message: err.message })], warnings };
  }
  if (!data || typeof data !== 'object') return { errors: [t('persona.validate.notObject')], warnings };

  for (const field of ['id', 'name', 'viewport', 'goals']) {
    if (data[field] == null || data[field] === '') errors.push(t('persona.validate.missingField', { field }));
  }
  if (data.id != null && !ID_PATTERN.test(String(data.id))) errors.push(t('persona.validate.invalidId', { id: data.id }));
  if (data.id && path.basename(file, path.extname(file)) !== String(data.id)) {
    warnings.push(t('persona.validate.idMismatch', { id: data.id, file: path.basename(file) }));
  }
  if (data.viewport != null && !VIEWPORTS[data.viewport]) {
    errors.push(t('persona.validate.invalidViewport', { value: data.viewport, valid: Object.keys(VIEWPORTS).join(', ') }));
  }
  if (data.goals != null) {
    const ok = Array.isArray(data.goals) && data.goals.length > 0 && data.goals.every((g) => typeof g === 'string' && g.trim());
    if (!ok) errors.push(t('persona.validate.goals'));
  }
  if (data.expectations != null && !(Array.isArray(data.expectations) && data.expectations.every((e) => typeof e === 'string'))) {
    errors.push(t('persona.validate.expectations'));
  }
  for (const [trait, values] of Object.entries(TRAITS)) {
    const value = data.traits?.[trait];
    if (value == null) {
      warnings.push(t('persona.validate.missingTrait', { trait }));
      continue;
    }
    const valid = [...values.en, ...values['pt-BR']];
    if (!valid.includes(String(value))) errors.push(t('persona.validate.invalidTrait', { trait, value, valid: values[getLocale()]?.join(', ') ?? values.en.join(', ') }));
  }
  return { errors, warnings };
}

/** `ux-validate persona validate [arquivos...]`: sem arquivos, confere todas as personas do projeto. */
export function validatePersonas({ cwd, configPath, files = [], log = console.log }) {
  let targets = files.map((f) => path.resolve(cwd, f));
  if (!targets.length) {
    const dir = personasDir(cwd, configPath);
    targets = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(dir, f)) : [];
    if (!targets.length) throw new Error(t('persona.validate.noneFound', { dir: path.relative(cwd, dir) || '.' }));
  }

  const ids = new Map();
  let failed = 0;
  for (const file of targets) {
    const rel = path.relative(cwd, file);
    if (!fs.existsSync(file)) {
      failed++;
      log(`✖ ${rel}: ${t('persona.validate.fileMissing')}`);
      continue;
    }
    const { errors, warnings } = validatePersona(file);
    const id = (() => {
      try {
        return YAML.parse(fs.readFileSync(file, 'utf8'))?.id;
      } catch {
        return null;
      }
    })();
    if (id && ids.has(id)) errors.push(t('persona.validate.duplicateId', { id, other: ids.get(id) }));
    if (id) ids.set(id, rel);

    if (errors.length) failed++;
    log(`${errors.length ? '✖' : '✔'} ${rel}`);
    for (const e of errors) log(`    ✖ ${e}`);
    for (const w of warnings) log(`    ⚠ ${w}`);
  }
  log(`\n${t('persona.validate.summary', { ok: targets.length - failed, total: targets.length })}`);
  if (failed) throw new Error(t('persona.validate.failed', { n: failed }));
  return { total: targets.length, failed };
}
