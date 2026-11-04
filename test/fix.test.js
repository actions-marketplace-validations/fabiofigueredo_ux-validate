import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fix, applyEdits, locateSource, listSourceFiles } from '../src/fix.js';
import { setLocale } from '../src/i18n.js';

// Estes testes conferem as mensagens em português.
setLocale('pt-BR');

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-fix-'));
  fs.writeFileSync(
    path.join(dir, 'ux-validate.config.yml'),
    'app:\n  url: http://localhost:4321/index.html\nstandalone:\n  provider: anthropic\n  model: claude-opus-5-5\n',
  );
  fs.mkdirSync(path.join(dir, 'site'));
  fs.writeFileSync(
    path.join(dir, 'site/index.html'),
    '<main>\n  <p>Atendimento incrivel.</p>\n  <div onclick="enviar()">Enviar</div>\n  <a href="#">Blog</a> <a href="#">Loja</a>\n</main>\n',
  );
  fs.writeFileSync(path.join(dir, 'site/outra.html'), '<p>Outra página</p>\n');
  const run = path.join(dir, '.ux-validate/runs/r1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(
    path.join(run, 'checks.json'),
    JSON.stringify({
      url: 'http://localhost:4321/index.html',
      pages: [],
      findings: [
        {
          id: 'C001', source: 'check:spelling', category: 'content', severity: 'medium', title: 'Possíveis erros de ortografia',
          page: 'http://localhost:4321/index.html', evidence: { snippet: 'incrivel → incrível', terms: ['incrivel'] },
        },
        {
          id: 'C002', source: 'check:aria', category: 'accessibility', severity: 'high', title: 'Elemento clicável inacessível pelo teclado',
          page: 'http://localhost:4321/index.html', evidence: { selector: 'main > div', snippet: '<div onclick="enviar()">Enviar</div>' },
        },
        {
          id: 'C003', source: 'check:links', category: 'navigation', severity: 'medium', title: 'Link sem destino',
          page: 'http://localhost:4321/index.html', evidence: { snippet: '<a href="#">Blog</a>' },
        },
        { id: 'C004', source: 'check:content', category: 'content', severity: 'low', title: 'Detalhe', evidence: { snippet: 'nada' } },
      ],
    }),
  );
  return { dir, run };
}

test('applyEdits exige trecho único e id enviado', () => {
  const { content, applied, failed } = applyEdits(
    'a b a c',
    [
      { findingId: 'X', find: 'b', replace: 'B' },
      { findingId: 'X', find: 'a', replace: 'A' },
      { findingId: 'X', find: 'z', replace: 'Z' },
      { findingId: 'Y', find: 'c', replace: 'C' },
    ],
    new Set(['X']),
  );
  assert.equal(content, 'a B a c');
  assert.equal(applied.length, 1);
  assert.deepEqual(failed.map((f) => f.reason), [
    'o trecho a substituir aparece mais de uma vez',
    'o trecho a substituir não existe no arquivo',
    'id de problema que não foi enviado para este arquivo',
  ]);
});

test('locateSource acha o arquivo pelos trechos da evidência e ignora sourceHint fora do projeto', () => {
  const { dir } = project();
  const files = listSourceFiles(dir);
  assert.ok(!files.some((f) => f.startsWith('.ux-validate')));
  assert.equal(locateSource(dir, { evidence: { terms: ['incrivel'] } }, files), 'site/index.html');
  assert.equal(locateSource(dir, { sourceHint: { file: 'site/outra.html' } }, files), 'site/outra.html');
  assert.equal(locateSource(dir, { sourceHint: { file: '../../etc/passwd' }, evidence: { snippet: 'Outra página' } }, files), 'site/outra.html');
});

test('fix aplica as correções válidas, guarda backup e registra o resultado', async () => {
  const { dir, run } = project();
  const calls = [];
  const llm = async (standalone, req) => {
    calls.push({ standalone, req });
    return {
      usage: { input: 1200, output: 300 },
      data: {
        edits: [
          { findingId: 'C001', find: 'incrivel', replace: 'incrível', explanation: 'Corrige o acento.' },
          { findingId: 'C002', find: '<div onclick="enviar()">Enviar</div>', replace: '<button type="button" onclick="enviar()">Enviar</button>', explanation: 'Usa botão nativo.' },
          { findingId: 'C003', find: '<a href="#">', replace: '<a href="/blog">', explanation: 'Aponta o link.' },
        ],
        skipped: [],
      },
    };
  };
  const logs = [];
  const report = await fix({ cwd: dir, yes: true, llm, log: (m) => logs.push(m) });

  assert.equal(calls.length, 1, 'um pedido por arquivo');
  assert.match(calls[0].req.prompt, /Atendimento incrivel/);
  assert.ok(!calls[0].req.prompt.includes('C004'), 'gravidade baixa fica de fora por padrão');
  const html = fs.readFileSync(path.join(dir, 'site/index.html'), 'utf8');
  assert.match(html, /Atendimento incrível/);
  assert.match(html, /<button type="button" onclick="enviar\(\)">Enviar<\/button>/);
  assert.match(html, /<a href="#">Blog<\/a>/, 'edição ambígua (aparece duas vezes) não é aplicada');
  assert.match(fs.readFileSync(path.join(run, 'fixes/backup/site/index.html'), 'utf8'), /incrivel/);

  const saved = JSON.parse(fs.readFileSync(path.join(run, 'fixes/fixes.json'), 'utf8'));
  assert.deepEqual(saved.usage, { input: 1200, output: 300 });
  const status = Object.fromEntries(saved.results.map((r) => [r.findingId, r.status]));
  assert.deepEqual(status, { C001: 'applied', C002: 'applied', C003: 'failed' });
  assert.equal(report.results.length, 3);
});

test('fix --dry-run não altera arquivos', async () => {
  const { dir } = project();
  const before = fs.readFileSync(path.join(dir, 'site/index.html'), 'utf8');
  const llm = async () => ({
    usage: { input: 1, output: 1 },
    data: { edits: [{ findingId: 'C001', find: 'incrivel', replace: 'incrível', explanation: 'x' }], skipped: [] },
  });
  await fix({ cwd: dir, yes: true, dryRun: true, ids: 'C001', llm, log: () => {} });
  assert.equal(fs.readFileSync(path.join(dir, 'site/index.html'), 'utf8'), before);
});

test('fix sem modelo configurado explica como configurar', async () => {
  const { dir } = project();
  fs.writeFileSync(path.join(dir, 'ux-validate.config.yml'), 'app:\n  url: http://x\n');
  await assert.rejects(fix({ cwd: dir, yes: true, log: () => {} }), /persona-fix/);
});
