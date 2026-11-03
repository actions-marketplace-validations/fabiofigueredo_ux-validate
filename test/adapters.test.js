import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCommands, parseCommand } from '../src/adapters/index.js';
import claudeCode from '../src/adapters/claude-code.js';

test('comandos não deixam placeholders sem substituir', () => {
  for (const cmd of loadCommands()) {
    assert.ok(cmd.name && cmd.description, `frontmatter incompleto em ${cmd.name}`);
    assert.doesNotMatch(cmd.body, /\{\{\w+\}\}/, `placeholder sobrando em ${cmd.name}`);
  }
});

test('adapter do Claude Code cria skills e preserva servidores MCP existentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-validate-'));
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
  claudeCode.install({ cwd: dir, commands: loadCommands(), force: false });

  const skill = fs.readFileSync(path.join(dir, '.claude/skills/persona-test/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: persona-test\n/);
  assert.match(skill, /disable-model-invocation: true/);

  const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers.outro && mcp.mcpServers.playwright);
  fs.rmSync(dir, { recursive: true });
});

test('lê comandos com quebras de linha do Windows (CRLF) e BOM', () => {
  const text = '\uFEFF---\r\nname: exemplo\r\ndescription: teste\r\n---\r\n\r\nRode {{CHECK_CMD}}\r\n';
  const cmd = parseCommand(text);
  assert.equal(cmd.name, 'exemplo');
  assert.equal(cmd.body, 'Rode npx ux-validate check\n');
});
