import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { WORK_DIR } from '../config.js';
import { getLocale } from '../i18n.js';
import { projectDictionary } from '../spelling.js';
import claudeCode from './claude-code.js';
import cursor from './cursor.js';
import codex from './codex.js';
import gemini from './gemini.js';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../source');

/** Pasta com comandos, referências e personas no idioma da ferramenta (source/en, source/pt-BR). */
export function sourceDir(locale = getLocale()) {
  const dir = path.join(SOURCE_ROOT, locale);
  return fs.existsSync(dir) ? dir : path.join(SOURCE_ROOT, 'en');
}

/**
 * Cada adapter traduz os comandos de `source/<idioma>/commands` para o formato de uma ferramenta.
 * Para adicionar uma ferramenta nova, crie um arquivo neste diretório com
 * { id, label, available, invoke(name), install({ cwd, commands, force }) } e registre-o aqui.
 */
export const ADAPTERS = [claudeCode, cursor, codex, gemini];

/** Placeholders que os comandos podem usar; mantém os textos independentes da ferramenta. */
export const commandVars = (locale) => ({
  WORK_DIR,
  REFERENCES_DIR: `${WORK_DIR}/references`,
  DICTIONARY: projectDictionary(locale),
  CHECK_CMD: 'npx ux-validate check',
  REPORT_CMD: 'npx ux-validate report',
  FIX_CMD: 'npx ux-validate fix',
  PERSONA_VALIDATE_CMD: 'npx ux-validate persona validate',
  PERSONA_EXAMPLES_CMD: 'npx ux-validate persona examples',
  PERSONA_ADD_CMD: 'npx ux-validate persona add',
});

/** `overrides` troca valores dos placeholders (ex.: o plugin do Claude Code aponta para os próprios arquivos). */
export function loadCommands(locale = getLocale(), overrides = {}) {
  const dir = path.join(sourceDir(locale), 'commands');
  const values = { ...commandVars(locale), ...overrides };
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      try {
        return parseCommand(fs.readFileSync(path.join(dir, file), 'utf8'), values);
      } catch (err) {
        throw new Error(`${file}: ${err.message}`);
      }
    });
}

/** Lê um comando (frontmatter YAML + corpo em Markdown) e substitui os placeholders. */
export function parseCommand(text, values = commandVars(getLocale())) {
  // No Windows o Git pode converter as quebras de linha para CRLF; normalizamos antes de ler.
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('comando sem frontmatter (bloco entre "---" no início do arquivo)');
  const meta = YAML.parse(match[1]);
  const body = match[2].replace(/\{\{(\w+)\}\}/g, (all, key) => values[key] ?? all);
  return { ...meta, body: body.trim() + '\n' };
}
