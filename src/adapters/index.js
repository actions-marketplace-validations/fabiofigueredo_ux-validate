import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { WORK_DIR } from '../config.js';
import claudeCode from './claude-code.js';

export const SOURCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../source');

/**
 * Cada adapter traduz os comandos de `source/commands` para o formato de uma ferramenta.
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
const VARS = {
  WORK_DIR,
  REFERENCES_DIR: `${WORK_DIR}/references`,
  CHECK_CMD: 'npx ux-validate check',
  REPORT_CMD: 'npx ux-validate report',
};

export function loadCommands() {
  const dir = path.join(SOURCE_DIR, 'commands');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!match) throw new Error(`Comando sem frontmatter: ${file}`);
      const meta = YAML.parse(match[1]);
      const body = match[2].replace(/\{\{(\w+)\}\}/g, (all, key) => VARS[key] ?? all);
      return { ...meta, body: body.trim() + '\n' };
    });
}
