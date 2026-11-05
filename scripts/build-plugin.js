#!/usr/bin/env node
/**
 * Gera o plugin do Claude Code (pasta plugin/) a partir de source/en e source/plugin.
 *
 *   npm run build:plugin          grava os arquivos
 *   npm run build:plugin -- --check   só confere se o plugin está atualizado (usado nos testes/CI)
 *
 * O plugin é publicado pelo próprio repositório (.claude-plugin/marketplace.json aponta para ./plugin),
 * então os arquivos gerados ficam no Git.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { loadCommands, parseCommand, commandVars } from '../src/adapters/index.js';
import { PLAYWRIGHT_MCP_VERSION } from '../src/adapters/shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN_DIR = path.join(ROOT, 'plugin');
const PLUGIN_NAME = 'ux-validate';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Comandos da CLI fixados na versão do plugin: a skill e a CLI sempre combinam. */
export function pluginVars(version = pkg.version) {
  const cli = `npx -y ux-validate@${version}`;
  return {
    REFERENCES_DIR: '${CLAUDE_PLUGIN_ROOT}/references',
    DICTIONARY: commandVars('en').DICTIONARY,
    CHECK_CMD: `${cli} check`,
    REPORT_CMD: `${cli} report`,
    FIX_CMD: `${cli} fix`,
    PERSONA_VALIDATE_CMD: `${cli} persona validate`,
    PERSONA_EXAMPLES_CMD: `${cli} persona examples`,
    PERSONA_ADD_CMD: `${cli} persona add`,
    INIT_CMD: `${cli} init --tools none`,
    INSTALL_BROWSER_CMD: `${cli} install-browser`,
  };
}

// Instruções que valem para todas as skills do plugin (um idioma só nas instruções; respostas no do projeto).
const LANGUAGE_NOTE = `> **Language:** read \`locale\` in \`ux-validate.config.yml\` (\`en\` or \`pt-BR\`). Talk to the user in that language and write everything that goes into the report (titles, descriptions, suggestions, persona summaries) in that language. Without a config yet, use the language the user writes in.`;
const SETUP_NOTE = `> **Setup:** if \`ux-validate.config.yml\` doesn't exist in the project, follow \`/${PLUGIN_NAME}:ux-setup\` first, then come back to this skill.`;

/** /ux-test → /ux-validate:ux-test (skills de plugin têm o nome do plugin como prefixo). */
function namespaced(body) {
  return body.replace(/(^|[\s`(])\/(ux-(?:test|report|fix|persona|setup))\b/g, (_, before, name) => `${before}/${PLUGIN_NAME}:${name}`);
}

function skill(cmd, version) {
  const frontmatter = YAML.stringify({
    name: cmd.name,
    description: cmd.description,
    'argument-hint': cmd.argumentHint,
    // Os testes abrem navegador e gastam tokens: só rodam quando o usuário chamar.
    'disable-model-invocation': true,
    // A CLI do ux-validate, na versão do plugin, roda sem pedir permissão a cada chamada.
    'allowed-tools': `Bash(npx -y ux-validate@${version} *)`,
  }).trim();
  const notes = cmd.name === 'ux-setup' ? LANGUAGE_NOTE : `${LANGUAGE_NOTE}\n>\n${SETUP_NOTE}`;
  const body = namespaced(cmd.body).replace(/^(# .+\n)/, `$1\n${notes}\n`);
  return `---\n${frontmatter}\n---\n\n${body}`;
}

/** Todos os arquivos do plugin: { caminho relativo à pasta plugin/: conteúdo }. */
export function buildPlugin(version = pkg.version) {
  const values = { ...commandVars('en'), ...pluginVars(version) };
  const commands = loadCommands('en', pluginVars(version));
  const setup = parseCommand(fs.readFileSync(path.join(ROOT, 'source/plugin/ux-setup.md'), 'utf8'), values);
  const files = {};

  files['.claude-plugin/plugin.json'] =
    JSON.stringify(
      {
        name: PLUGIN_NAME,
        version,
        description: 'Persona-based testing of web app content, navigation, interface and accessibility (WCAG, WAI-ARIA, color blindness), with a report and fixes.',
        author: { name: 'Fabio Figueredo', url: 'https://github.com/fabiofigueredo' },
        homepage: 'https://github.com/fabiofigueredo/ux-validate#readme',
        repository: 'https://github.com/fabiofigueredo/ux-validate',
        license: 'MIT',
        keywords: ['ux', 'accessibility', 'a11y', 'wcag', 'persona', 'playwright', 'testing'],
      },
      null,
      2,
    ) + '\n';

  // O navegador que o agente usa para navegar como cada persona.
  files['.mcp.json'] =
    JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['-y', `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`] } } }, null, 2) + '\n';

  for (const cmd of [...commands, setup]) files[`skills/${cmd.name}/SKILL.md`] = skill(cmd, version);

  const refs = path.join(ROOT, 'source/en/references');
  for (const file of fs.readdirSync(refs).sort()) files[`references/${file}`] = fs.readFileSync(path.join(refs, file), 'utf8');

  files['.claude-plugin/icon.png'] = fs.readFileSync(path.join(ROOT, 'source/plugin/icon.png'));

  files['README.md'] = `# ux-validate plugin for Claude Code

ux-validate tests a web app the way real people use it. Your AI agent browses the app as each persona (an older person on a phone, a screen reader user, a color-blind user…), tries to reach their goals and reports where they got stuck, why, and which file to fix. Automated checks cover WCAG and WAI-ARIA accessibility, keyboard use, color blindness, broken links and spelling, and the report gives each persona a score.

Install:

\`\`\`
/plugin marketplace add fabiofigueredo/ux-validate
/plugin install ux-validate@ux-validate
\`\`\`

Then, in your project: \`/ux-validate:ux-setup\` once, and \`/ux-validate:ux-test\` whenever you want to test. Other skills: \`/ux-validate:ux-report\`, \`/ux-validate:ux-fix\` and \`/ux-validate:ux-persona\`. Requires Node.js 20 or later.

These files are generated from the ux-validate repository by \`npm run build:plugin\`; don't edit them by hand. Docs: https://github.com/fabiofigueredo/ux-validate#readme
`;
  return files;
}

/** Diferenças entre o plugin gerado e o que está no disco (arquivos a mais, a menos ou diferentes). */
export function pluginDiff(files = buildPlugin()) {
  const onDisk = new Set();
  const walk = (dir) => {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else onDisk.add(path.relative(PLUGIN_DIR, abs).split(path.sep).join('/'));
    }
  };
  walk(PLUGIN_DIR);
  const diff = [];
  for (const [rel, content] of Object.entries(files)) {
    if (!onDisk.has(rel)) diff.push(`missing: ${rel}`);
    else if (!Buffer.from(content).equals(fs.readFileSync(path.join(PLUGIN_DIR, rel)))) diff.push(`outdated: ${rel}`);
    onDisk.delete(rel);
  }
  for (const rel of onDisk) diff.push(`extra: ${rel}`);
  return diff;
}

function write(files) {
  fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(PLUGIN_DIR, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildPlugin();
  if (process.argv.includes('--check')) {
    const diff = pluginDiff(files);
    if (diff.length) {
      console.error(`plugin/ is out of date. Run "npm run build:plugin".\n  ${diff.join('\n  ')}`);
      process.exit(1);
    }
    console.log('plugin/ is up to date.');
  } else {
    write(files);
    console.log(`plugin/ generated: ${Object.keys(files).length} files (version ${pkg.version}).`);
  }
}
