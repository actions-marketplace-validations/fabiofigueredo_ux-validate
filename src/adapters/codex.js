import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { writeFile } from '../files.js';
import { t } from '../i18n.js';
import { PLAYWRIGHT_MCP, adaptBody } from './shared.js';

/**
 * Codex CLI: cada comando vira uma skill em .agents/skills/<nome>/SKILL.md (invocada como $<nome>),
 * com agents/openai.yaml desligando a invocação automática; o Playwright MCP vai em
 * [mcp_servers.playwright] do .codex/config.toml do projeto (lido quando o projeto é confiável).
 *
 * O SKILL.md do Codex aceita só name, description, license, allowed-tools e metadata no cabeçalho.
 */
export default {
  id: 'codex',
  label: 'Codex CLI',
  available: true,
  invoke: (name) => `$${name}`,

  install({ cwd, commands, force }) {
    const results = [];
    for (const cmd of commands) {
      const dir = `.agents/skills/${cmd.name}`;
      const frontmatter = YAML.stringify({
        name: cmd.name,
        // .agents/skills também é lido por outras ferramentas (ex.: Gemini CLI), que não leem o openai.yaml.
        description: `${cmd.description} ${t('adapters.explicitOnly', { invoke: `$${cmd.name}` })}`,
      }).trim();
      const body = adaptBody(cmd.body, { args: t('adapters.argsFromMessage'), prefix: '$' });
      results.push(writeFile(cwd, `${dir}/SKILL.md`, `---\n${frontmatter}\n---\n\n${body}`, { force }));

      const openai = YAML.stringify({
        interface: {
          display_name: cmd.name,
          short_description: cmd.shortDescription ?? cmd.name,
          default_prompt: `$${cmd.name}`,
        },
        // Testes abrem navegador e gastam tokens: só rodam quando o usuário chamar $<nome>.
        policy: { allow_implicit_invocation: false },
      });
      results.push(writeFile(cwd, `${dir}/agents/openai.yaml`, openai, { force }));
    }
    results.push(registerTomlMcp(cwd));
    return results;
  },
};

function registerTomlMcp(cwd) {
  const rel = '.codex/config.toml';
  const file = path.join(cwd, rel);
  const existed = fs.existsSync(file);
  const current = existed ? fs.readFileSync(file, 'utf8') : '';
  if (/^\s*\[mcp_servers\.playwright\]/m.test(current)) return { rel, status: 'mcpKept' };
  const block =
    '[mcp_servers.playwright]\n' +
    `command = ${JSON.stringify(PLAYWRIGHT_MCP.command)}\n` +
    `args = [${PLAYWRIGHT_MCP.args.map((a) => JSON.stringify(a)).join(', ')}]\n`;
  const prefix = current && !current.endsWith('\n') ? '\n\n' : current ? '\n' : '';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${current}${prefix}${block}`);
  return { rel, status: existed ? 'mcpAdded' : 'created' };
}
