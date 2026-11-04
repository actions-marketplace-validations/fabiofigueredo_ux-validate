import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { setLocale } from '../src/i18n.js';
import { ADAPTERS, loadCommands } from '../src/adapters/index.js';
import cursor from '../src/adapters/cursor.js';
import codex from '../src/adapters/codex.js';
import gemini, { tomlMultiline } from '../src/adapters/gemini.js';
import { adaptBody } from '../src/adapters/shared.js';

setLocale('en');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-tools-'));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const NAMES = ['ux-fix', 'ux-persona', 'ux-report', 'ux-test'];

test('as quatro ferramentas estão disponíveis', () => {
  assert.deepEqual(ADAPTERS.map((a) => [a.id, a.available]), [
    ['claude-code', true],
    ['cursor', true],
    ['codex', true],
    ['gemini', true],
  ]);
});

test('adaptBody troca argumentos e prefixo sem mexer em caminhos', () => {
  const body = '# /ux-test\nArgs: `$ARGUMENTS`\nRun `/ux-fix` (see references/persona-format.md and .ux-validate/personas/).';
  const out = adaptBody(body, { args: 'ARGS', prefix: '$' });
  assert.equal(out, '# $ux-test\nArgs: ARGS\nRun `$ux-fix` (see references/persona-format.md and .ux-validate/personas/).');
  assert.equal(adaptBody(body, { args: 'X' }).split('\n')[0], '# /ux-test');
});

test('Cursor: comandos em Markdown e MCP em .cursor/mcp.json, preservando o que existe', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.cursor'));
  fs.writeFileSync(path.join(dir, '.cursor/mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  cursor.install({ cwd: dir, commands: loadCommands('en'), force: false });

  assert.deepEqual(fs.readdirSync(path.join(dir, '.cursor/commands')).sort(), NAMES.map((n) => `${n}.md`));
  const md = read(dir, '.cursor/commands/ux-test.md');
  assert.match(md, /^# \/ux-test/);
  assert.doesNotMatch(md, /\$ARGUMENTS|^---/);
  assert.match(md, /the text the user wrote together with the command/);
  const mcp = JSON.parse(read(dir, '.cursor/mcp.json'));
  assert.ok(mcp.mcpServers.other && mcp.mcpServers.playwright);
});

test('Gemini CLI: comandos TOML com {{args}} e MCP no settings.json do projeto', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.gemini'));
  fs.writeFileSync(path.join(dir, '.gemini/settings.json'), JSON.stringify({ theme: 'Dark' }));
  gemini.install({ cwd: dir, commands: loadCommands('pt-BR'), force: false });

  const toml = read(dir, '.gemini/commands/ux-test.toml');
  assert.match(toml, /^description = "Testa conteúdo/);
  assert.match(toml, /\nprompt = """\n# \/ux-test\n/);
  assert.match(toml, /Argumentos recebidos: `\{\{args\}\}`/);
  assert.ok(toml.trimEnd().endsWith('"""'));
  const settings = JSON.parse(read(dir, '.gemini/settings.json'));
  assert.equal(settings.theme, 'Dark');
  assert.ok(settings.mcpServers.playwright);
});

test('tomlMultiline escapa barra invertida e três aspas', () => {
  assert.equal(tomlMultiline('a\\b """c"""'), '"""\na\\\\b ""\\"c""\\""""');
});

test('Codex CLI: skills em .agents/skills, só chamadas explicitamente, e MCP no config.toml', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.codex'));
  fs.writeFileSync(path.join(dir, '.codex/config.toml'), 'model = "x"');
  codex.install({ cwd: dir, commands: loadCommands('en'), force: false });

  for (const name of NAMES) {
    const skill = read(dir, `.agents/skills/${name}/SKILL.md`);
    const front = YAML.parse(skill.match(/^---\n([\s\S]*?)\n---/)[1]);
    assert.deepEqual(Object.keys(front).sort(), ['description', 'name'], 'o Codex só aceita campos conhecidos');
    assert.equal(front.name, name);
    assert.match(front.description, new RegExp(`explicitly invokes \\$${name}\\.$`));
    assert.doesNotMatch(skill, /\$ARGUMENTS|[\s`(]\/ux-(?:test|report|fix|persona)\b/);

    const openai = YAML.parse(read(dir, `.agents/skills/${name}/agents/openai.yaml`));
    assert.equal(openai.policy.allow_implicit_invocation, false);
    assert.equal(openai.interface.default_prompt, `$${name}`);
    assert.ok(openai.interface.short_description.length < 60);
  }
  assert.match(read(dir, '.agents/skills/ux-test/SKILL.md'), /^# \$ux-test$/m);

  const config = read(dir, '.codex/config.toml');
  assert.match(config, /^model = "x"\n\n\[mcp_servers\.playwright\]\ncommand = "npx"\nargs = \["@playwright\/mcp@latest"\]\n$/);
  codex.install({ cwd: dir, commands: loadCommands('en'), force: true });
  assert.equal(read(dir, '.codex/config.toml'), config, 'rodar de novo não duplica o servidor');
});

test('init --tools instala várias ferramentas e recusa nomes desconhecidos', async () => {
  const { init } = await import('../src/init.js');
  const dir = tmp();
  const log = console.log;
  console.log = () => {};
  try {
    await init({ cwd: dir, yes: true, tools: 'cursor,gemini' });
    await assert.rejects(init({ cwd: dir, yes: true, tools: 'vim' }), /Unknown AI tool: vim/);
  } finally {
    console.log = log;
  }
  assert.ok(fs.existsSync(path.join(dir, '.cursor/commands/ux-test.md')));
  assert.ok(fs.existsSync(path.join(dir, '.gemini/commands/ux-test.toml')));
  assert.ok(!fs.existsSync(path.join(dir, '.claude')));
  assert.match(read(dir, 'ux-validate.config.yml'), /targets:\n {2}- cursor\n {2}- gemini/);
});

test('init remove os comandos antigos (persona-*) gerados pelo ux-validate e mantém os do usuário', async () => {
  const { init } = await import('../src/init.js');
  const dir = tmp();
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  put('.claude/skills/persona-test/SKILL.md', 'Run `npx ux-validate check`');
  put('.agents/skills/persona-fix/SKILL.md', 'see .ux-validate/references');
  put('.agents/skills/persona-fix/agents/openai.yaml', 'policy: {}');
  put('.gemini/commands/persona-report.toml', 'prompt = "npx ux-validate report"');
  put('.cursor/commands/persona-new.md', 'my own command, unrelated');
  const log = console.log;
  console.log = () => {};
  try {
    await init({ cwd: dir, yes: true, tools: 'claude-code' });
  } finally {
    console.log = log;
  }
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/persona-test')));
  assert.ok(!fs.existsSync(path.join(dir, '.agents/skills/persona-fix')));
  assert.ok(!fs.existsSync(path.join(dir, '.gemini/commands/persona-report.toml')));
  assert.ok(fs.existsSync(path.join(dir, '.cursor/commands/persona-new.md')), 'arquivo que não é do ux-validate fica');
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/ux-test/SKILL.md')));
});

test('init --personas escolhe as pré-definidas; "none" deixa o passo para o ux-test', async () => {
  const { init } = await import('../src/init.js');
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  const some = tmp();
  const none = tmp();
  try {
    await init({ cwd: some, yes: true, tools: 'claude-code', personas: 'margaret,raj-dev' });
    await init({ cwd: none, yes: true, tools: 'claude-code', personas: 'none' });
    await assert.rejects(init({ cwd: tmp(), yes: true, personas: 'bob' }), /Invalid value for --personas: bob/);
  } finally {
    console.log = log;
  }
  assert.deepEqual(fs.readdirSync(path.join(some, '.ux-validate/personas')).sort(), ['margaret.yml', 'raj-dev.yml']);
  assert.ok(!fs.existsSync(path.join(none, '.ux-validate/personas')));
  assert.ok(lines.some((l) => /No personas in \.ux-validate\/personas\/ yet/.test(l)));
  const skill = read(none, '.claude/skills/ux-test/SKILL.md');
  assert.match(skill, /`npx ux-validate persona examples`/);
  assert.match(skill, /`npx ux-validate persona add <ids>`/);
});
