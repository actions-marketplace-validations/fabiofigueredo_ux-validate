import fs from 'node:fs';
import path from 'node:path';

/**
 * Escreve um arquivo sem sobrescrever o que já existe (a não ser com force).
 * O status é uma chave (created, kept, updated), traduzida na hora de exibir.
 */
export function writeFile(cwd, rel, content, { force = false } = {}) {
  const file = path.join(cwd, rel);
  const existed = fs.existsSync(file);
  if (existed && !force) return { rel, status: 'kept' };
  if (existed && fs.readFileSync(file, 'utf8') === content) return { rel, status: 'kept' };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return { rel, status: existed ? 'updated' : 'created' };
}

/**
 * Acrescenta `entry` (uma pasta) ao .gitignore de `cwd`, com um comentário, se ainda não estiver lá.
 * Aceita a pasta escrita com ou sem barra no começo e no fim.
 */
export function ensureGitignore(cwd, entry, comment) {
  const file = path.join(cwd, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const bare = entry.replace(/^\/|\/$/g, '');
  if (current.split(/\r?\n/).some((l) => l.trim().replace(/^\/|\/$/g, '') === bare)) return { rel: '.gitignore', status: 'kept' };
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, `${current}${prefix}${comment}\n${entry}\n`);
  return { rel: '.gitignore', status: current ? 'updated' : 'created' };
}

/** A pasta está dentro de um repositório Git (ela ou uma pasta acima tem .git)? */
export function inGitRepo(cwd) {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}
