import fs from 'node:fs';
import path from 'node:path';

/** Servidor MCP do Playwright: o navegador que o agente usa para navegar como cada persona. */
// Versão fixa: com @latest, cada abertura da ferramenta baixaria e executaria a versão mais nova publicada,
// sem revisão. Atualize aqui (e rode o init de novo) quando quiser uma versão nova.
export const PLAYWRIGHT_MCP_VERSION = '0.0.83';
export const PLAYWRIGHT_MCP = { command: 'npx', args: [`@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`] };

/**
 * Registra o Playwright MCP num arquivo JSON com `mcpServers` (Claude Code, Cursor, Gemini CLI),
 * preservando o resto do arquivo. Status: chaves traduzidas na hora de exibir.
 */
export function registerJsonMcp(cwd, rel) {
  const file = path.join(cwd, rel);
  let data = {};
  const existed = fs.existsSync(file);
  if (existed) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { rel, status: 'mcpInvalid' };
    }
  }
  data.mcpServers ??= {};
  if (data.mcpServers.playwright) return { rel, status: 'mcpKept' };
  data.mcpServers.playwright = PLAYWRIGHT_MCP;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return { rel, status: existed ? 'mcpAdded' : 'created' };
}

/** Troca o marcador de argumentos e o prefixo dos comandos (/ux-x → $ux-x no Codex). */
export function adaptBody(body, { args, prefix = '/' }) {
  let out = body.replaceAll('`$ARGUMENTS`', args).replaceAll('$ARGUMENTS', args);
  // Função de substituição: com uma string, um prefixo "$" seria lido como padrão especial ($$, $1…).
  if (prefix !== '/') out = out.replace(/(^|[\s`(])\/(ux-(?:test|report|fix|persona))\b/g, (_, before, name) => `${before}${prefix}${name}`);
  return out;
}
