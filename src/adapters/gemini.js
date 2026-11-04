import { writeFile } from '../files.js';
import { adaptBody, registerJsonMcp } from './shared.js';

/**
 * Gemini CLI: comandos em .gemini/commands/<nome>.toml (campos `description` e `prompt`, invocados
 * como /<nome>; `{{args}}` recebe o texto digitado depois do comando) e o Playwright MCP em
 * `mcpServers` do .gemini/settings.json do projeto.
 */
export default {
  id: 'gemini',
  label: 'Gemini CLI',
  available: true,
  invoke: (name) => `/${name}`,

  install({ cwd, commands, force }) {
    const results = commands.map((cmd) => {
      const prompt = adaptBody(cmd.body, { args: '`{{args}}`' });
      const toml = `description = ${tomlString(cmd.description)}\nprompt = ${tomlMultiline(prompt)}\n`;
      return writeFile(cwd, `.gemini/commands/${cmd.name}.toml`, toml, { force });
    });
    results.push(registerJsonMcp(cwd, '.gemini/settings.json'));
    return results;
  },
};

/** String básica de uma linha (o JSON.stringify gera escapes válidos em TOML). */
export function tomlString(value) {
  return JSON.stringify(String(value));
}

/** String básica multilinha: escapa barras invertidas e sequências de três aspas. */
export function tomlMultiline(value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"""/g, '""\\"');
  return `"""\n${escaped}"""`;
}
