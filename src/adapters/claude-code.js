import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { writeFile } from '../files.js';

const PLAYWRIGHT_MCP = { command: 'npx', args: ['@playwright/mcp@latest'] };

/**
 * Claude Code: cada comando vira uma skill em .claude/skills/<nome>/SKILL.md
 * (invocada como /<nome>) e o Playwright MCP é registrado em .mcp.json.
 */
export default {
  id: 'claude-code',
  label: 'Claude Code',
  available: true,

  install({ cwd, commands, force }) {
    const results = commands.map((cmd) => {
      const frontmatter = YAML.stringify({
        name: cmd.name,
        description: cmd.description,
        'argument-hint': cmd.argumentHint,
        // Os testes abrem navegador e gastam tokens: só rodam quando o usuário chamar.
        'disable-model-invocation': true,
      }).trim();
      return writeFile(cwd, `.claude/skills/${cmd.name}/SKILL.md`, `---\n${frontmatter}\n---\n\n${cmd.body}`, {
        force,
      });
    });
    results.push(registerMcp(cwd));
    return results;
  },
};

function registerMcp(cwd) {
  const rel = '.mcp.json';
  const file = path.join(cwd, rel);
  let data = { mcpServers: {} };
  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { rel, status: 'mcpInvalid' };
    }
    data.mcpServers ??= {};
    if (data.mcpServers.playwright) return { rel, status: 'mcpKept' };
  }
  const existed = fs.existsSync(file);
  data.mcpServers.playwright = PLAYWRIGHT_MCP;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return { rel, status: existed ? 'mcpAdded' : 'created' };
}
