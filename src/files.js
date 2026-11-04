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
