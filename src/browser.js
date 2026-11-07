import path from 'node:path';
import { createRequire } from 'node:module';

/** Caminho do cli.js do Playwright que o ux-validate usa (não está nos "exports" do pacote). */
export function playwrightCli() {
  return path.join(path.dirname(createRequire(import.meta.url).resolve('playwright')), 'cli.js');
}

/**
 * Argumentos para instalar o Chromium com o Playwright do ux-validate.
 * O Playwright avisa "rode npm install" quando o script está numa pasta "_npx" (caso do plugin do
 * Claude Code, que roda "npx -y ux-validate@…"). Aqui o aviso é falso: o ux-validate depende do
 * Playwright e instala o navegador da versão dele. Carregar o cli.js com outro nome de script evita o aviso.
 */
export function installBrowserArgs(cli = playwrightCli(), extra = []) {
  const loader = `process.argv.splice(1, 0, 'ux-validate-install-browser'); require(${JSON.stringify(cli)});`;
  return ['-e', loader, 'install', 'chromium', ...extra];
}
