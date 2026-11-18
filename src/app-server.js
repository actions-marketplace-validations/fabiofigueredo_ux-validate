import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { t } from './i18n.js';

/**
 * Garante que a aplicação está no ar antes das checagens.
 * - Se a URL já responde, não faz nada.
 * - Se não responde e há `app.start`, inicia o comando, espera a URL responder e devolve `stop()`.
 * - Se não responde e não há `app.start`, para com uma mensagem clara (em vez de registrar um
 *   "problema crítico" falso no relatório).
 */

/** A URL responde? Qualquer resposta HTTP conta (até 404): significa que há um servidor ali. */
export async function isUp(url, timeout = 3000, headers = {}) {
  try {
    await fetch(url, { method: 'GET', redirect: 'manual', headers, signal: AbortSignal.timeout(timeout) });
    return true;
  } catch {
    return false;
  }
}

function stopProcess(child) {
  if (!child || child.exitCode != null) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM'); // o grupo inteiro: o shell e o servidor que ele iniciou
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // já terminou
    }
  }
}

export async function ensureAppRunning({ url, start, cwd, timeout = 60000, log = console.log }) {
  if (!/^https?:/i.test(url)) return { started: false, stop: () => {} }; // file:// não precisa de servidor
  if (await isUp(url)) return { started: false, stop: () => {} };
  if (!start) throw new Error(t('app.notRunning', { url }));

  log(t('app.starting', { command: start }));
  const output = [];
  const child = spawn(start, { cwd, shell: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (d) => output.push(String(d)));
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  // Encerra o servidor se o ux-validate for interrompido (Ctrl+C) ou terminar com erro.
  const cleanup = () => stopProcess(child);
  process.once('exit', cleanup);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isUp(url, 2000)) {
      log(t('app.started', { url }));
      return {
        started: true,
        stop: () => {
          process.removeListener('exit', cleanup);
          stopProcess(child);
        },
      };
    }
    if (exited) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  stopProcess(child);
  process.removeListener('exit', cleanup);
  const tail = output.join('').trim().split('\n').slice(-8).join('\n');
  throw new Error(t(exited ? 'app.exited' : 'app.timeout', { url, command: start, seconds: Math.round(timeout / 1000) }) + (tail ? `\n\n${tail}` : ''));
}

const STATIC_DIRS = ['public', 'site', 'www', 'docs', 'dist', 'build', 'src'];
const SKIP = new Set(['node_modules', '.git', '.ux-validate', '.claude', '.cursor', '.agents', '.gemini', 'coverage']);

/**
 * Site só com HTML (sem framework): procura um index.html na raiz ou numa subpasta e sugere servir
 * essa pasta com http-server. Devolve null se não encontrar.
 */
export function detectStaticSite(cwd) {
  let dir = null;
  if (fs.existsSync(path.join(cwd, 'index.html'))) dir = '.';
  else {
    const subdirs = fs
      .readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
      .map((e) => e.name)
      .filter((name) => fs.existsSync(path.join(cwd, name, 'index.html')))
      .sort((a, b) => {
        const ia = STATIC_DIRS.indexOf(a);
        const ib = STATIC_DIRS.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
    dir = subdirs[0] ?? null;
  }
  if (!dir) return null;
  const folder = /\s/.test(dir) ? `"${dir}"` : dir;
  return {
    id: 'static',
    dir,
    label: t('app.staticLabel'),
    url: 'http://localhost:3000',
    start: `npx -y http-server ${folder} -p 3000 -c-1`,
  };
}
