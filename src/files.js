import fs from 'node:fs';
import path from 'node:path';

/** Escreve um arquivo sem sobrescrever o que já existe (a não ser com force). */
export function writeFile(cwd, rel, content, { force = false } = {}) {
  const file = path.join(cwd, rel);
  const existed = fs.existsSync(file);
  if (existed && !force) return { rel, status: 'mantido' };
  if (existed && fs.readFileSync(file, 'utf8') === content) return { rel, status: 'mantido' };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return { rel, status: existed ? 'atualizado' : 'criado' };
}
