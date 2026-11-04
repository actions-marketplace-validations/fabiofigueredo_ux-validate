import { writeFile } from '../files.js';
import { t } from '../i18n.js';
import { adaptBody, registerJsonMcp } from './shared.js';

/**
 * Cursor: comandos personalizados em .cursor/commands/<nome>.md (Markdown puro, invocados como /<nome>)
 * e o Playwright MCP em .cursor/mcp.json.
 */
export default {
  id: 'cursor',
  label: 'Cursor',
  available: true,
  invoke: (name) => `/${name}`,

  install({ cwd, commands, force }) {
    const results = commands.map((cmd) =>
      writeFile(cwd, `.cursor/commands/${cmd.name}.md`, adaptBody(cmd.body, { args: t('adapters.argsFromMessage') }), { force }),
    );
    results.push(registerJsonMcp(cwd, '.cursor/mcp.json'));
    return results;
  },
};
