import YAML from 'yaml';
import { writeFile } from '../files.js';
import { registerJsonMcp } from './shared.js';

/**
 * Claude Code: cada comando vira uma skill em .claude/skills/<nome>/SKILL.md
 * (invocada como /<nome>) e o Playwright MCP é registrado em .mcp.json.
 */
export default {
  id: 'claude-code',
  label: 'Claude Code',
  available: true,
  invoke: (name) => `/${name}`,

  install({ cwd, commands, force }) {
    const results = commands.map((cmd) => {
      const frontmatter = YAML.stringify({
        name: cmd.name,
        description: cmd.description,
        'argument-hint': cmd.argumentHint,
        // Os testes abrem navegador e gastam tokens: só rodam quando o usuário chamar.
        'disable-model-invocation': true,
      }).trim();
      return writeFile(cwd, `.claude/skills/${cmd.name}/SKILL.md`, `---\n${frontmatter}\n---\n\n${cmd.body}`, { force });
    });
    results.push(registerJsonMcp(cwd, '.mcp.json'));
    return results;
  },
};
