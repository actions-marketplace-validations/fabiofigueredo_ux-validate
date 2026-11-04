import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { WORK_DIR } from '../config.js';
import { getLocale } from '../i18n.js';
import { projectDictionary } from '../spelling.js';
import claudeCode from './claude-code.js';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../source');

/** Pasta com comandos, referências e personas no idioma da ferramenta (source/en, source/pt-BR). */
export function sourceDir(locale = getLocale()) {
  const dir = path.join(SOURCE_ROOT, locale);
  return fs.existsSync(dir) ? dir : path.join(SOURCE_ROOT, 'en');
}

/**
 * Cada adapter traduz os comandos de `source/<idioma>/commands` para o formato de uma ferramenta.
 * Para adicionar uma ferramenta nova, crie um arquivo neste diretório com
 * { id, label, available, install({ cwd, commands, force }) } e registre-o aqui.
 */
export const ADAPTERS = [
  claudeCode,
  { id: 'cursor', label: 'Cursor', available: false },
  { id: 'codex', label: 'Codex CLI', available: false },
  { id: 'gemini', label: 'Gemini CLI', available: false },
];

/** Placeholders que os comandos podem usar; mantém os textos independentes da ferramenta. */
const vars = (locale) => ({
  WORK_DIR,
  REFERENCES_DIR: `${WORK_DIR}/references`,
  DICTIONARY: projectDictionary(locale),
  CHECK_CMD: 'npx ux-validate check',
  REPORT_CMD: 'npx ux-validate report',
});

export function loadCommands(locale = getLocale()) {
  const dir = path.join(sourceDir(locale), 'commands');
  const values = vars(locale);
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
export function parseCommand(text, values = vars(getLocale())) {
  // No Windows o Git pode converter as quebras de linha para CRLF; normalizamos antes de ler.
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('comando sem frontmatter (bloco entre "---" no início do arquivo)');
  const meta = YAML.parse(match[1]);
  const body = match[2].replace(/\{\{(\w+)\}\}/g, (all, key) => values[key] ?? all);
  return { ...meta, body: body.trim() + '\n' };
}
