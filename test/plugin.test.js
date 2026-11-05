import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { buildPlugin, pluginDiff, PLUGIN_DIR } from '../scripts/build-plugin.js';
import { PLAYWRIGHT_MCP_VERSION } from '../src/adapters/shared.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(PLUGIN_DIR, rel), 'utf8');

test('plugin/ está atualizado em relação a source/ (rode "npm run build:plugin")', () => {
  assert.deepEqual(pluginDiff(), []);
});

test('manifesto, marketplace e MCP do plugin', () => {
  const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.equal(manifest.name, 'ux-validate');
  assert.equal(manifest.version, pkg.version, 'plugin e pacote do npm com a mesma versão');
  const market = JSON.parse(fs.readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'));
  assert.equal(market.plugins[0].name, 'ux-validate');
  assert.equal(market.plugins[0].source, './plugin');
  assert.equal(market.plugins[0].version, undefined, 'a versão fica só no plugin.json');
  const mcp = JSON.parse(read('.mcp.json'));
  assert.deepEqual(mcp.mcpServers.playwright, { command: 'npx', args: ['-y', `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`] });
  const icon = fs.readFileSync(path.join(PLUGIN_DIR, '.claude-plugin/icon.png'));
  assert.equal(icon.subarray(1, 4).toString(), 'PNG');
});

test('skills: frontmatter, nomes com prefixo do plugin, CLI fixada na versão e referências existentes', () => {
  const skills = fs.readdirSync(path.join(PLUGIN_DIR, 'skills')).sort();
  assert.deepEqual(skills, ['ux-fix', 'ux-persona', 'ux-report', 'ux-setup', 'ux-test']);
  for (const name of skills) {
    const text = read(`skills/${name}/SKILL.md`);
    const [, fm, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const meta = YAML.parse(fm);
    assert.equal(meta.name, name);
    assert.ok(meta.description.length > 20, name);
    assert.equal(meta['disable-model-invocation'], true, `${name}: só roda quando chamada`);
    assert.equal(meta['allowed-tools'], `Bash(npx -y ux-validate@${pkg.version} *)`);
    assert.doesNotMatch(body, /\{\{\w+\}\}/, `${name}: marcador sem substituir`);
    assert.doesNotMatch(body, /(^|[\s`(])\/ux-(test|report|fix|persona|setup)\b/m, `${name}: comando sem o prefixo do plugin`);
    assert.match(body, /Language:\*\* read `locale`/, `${name}: instrução de idioma`);
    for (const cmd of body.matchAll(/npx (?:-y )?ux-validate(@[\w.-]+)? /g)) assert.equal(cmd[1], `@${pkg.version}`, `${name}: ${cmd[0]}`);
    for (const ref of body.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(references\/[\w.-]+\.md)/g)) {
      assert.ok(fs.existsSync(path.join(PLUGIN_DIR, ref[1])), `${name}: ${ref[1]}`);
    }
  }
  assert.match(read('skills/ux-test/SKILL.md'), /^# \/ux-validate:ux-test$/m);
  assert.match(read('skills/ux-setup/SKILL.md'), new RegExp(`ux-validate@${pkg.version.replace(/\./g, '\\.')} init --tools none --lang`));
});

test('buildPlugin com outra versão muda a CLI fixada nas skills', () => {
  const files = buildPlugin('9.9.9');
  assert.match(files['skills/ux-test/SKILL.md'], /npx -y ux-validate@9\.9\.9 check/);
  assert.equal(JSON.parse(files['.claude-plugin/plugin.json']).version, '9.9.9');
});

test('init --tools none --url --start: só configuração, personas e referências', async () => {
  const { init } = await import('../src/init.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-plugin-'));
  const log = console.log;
  console.log = () => {};
  try {
    await init({ cwd: dir, yes: true, tools: 'none', personas: 'margaret', url: 'http://localhost:5173', start: 'npm run dev' });
    await assert.rejects(init({ cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-plugin-')), yes: true, tools: 'none', url: 'nope' }), /Invalid URL/);
  } finally {
    console.log = log;
  }
  const config = YAML.parse(fs.readFileSync(path.join(dir, 'ux-validate.config.yml'), 'utf8'));
  assert.deepEqual(config.targets, []);
  assert.deepEqual(config.app, { url: 'http://localhost:5173', start: 'npm run dev' });
  for (const tool of ['.claude', '.cursor', '.agents', '.gemini', '.mcp.json']) assert.ok(!fs.existsSync(path.join(dir, tool)), tool);
  assert.ok(fs.existsSync(path.join(dir, '.ux-validate/personas/margaret.yml')));
});
