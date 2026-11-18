import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setLocale } from '../src/i18n.js';

setLocale('en');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-release-'));
const capture = async (fn) => {
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try {
    await fn();
  } finally {
    console.log = log;
  }
  return lines.join('\n');
};

test('check diz qual é o próximo passo da validação completa (fora do CI)', { timeout: 120000 }, async () => {
  const { runChecks } = await import('../src/checks.js');
  const url = pathToFileURL(path.resolve('examples/demo-site/contato.html')).href;
  const ci = process.env.CI;
  try {
    delete process.env.CI;
    const out = await capture(() => runChecks({ cwd: tmp(), url, out: path.join(tmp(), 'run') }));
    assert.match(out, /complete validation, with personas and tasks, run \/ux-test/);
    process.env.CI = 'true';
    const inCi = await capture(() => runChecks({ cwd: tmp(), url, out: path.join(tmp(), 'run') }));
    assert.doesNotMatch(inCi, /run \/ux-test/, 'no CI a dica não aparece');
  } finally {
    if (ci === undefined) delete process.env.CI;
    else process.env.CI = ci;
  }
});

test('relatório só com as checagens automáticas avisa que personas e tarefas não rodaram', async () => {
  const { buildReport } = await import('../src/report.js');
  const run = tmp();
  fs.writeFileSync(path.join(run, 'checks.json'), JSON.stringify({ url: 'http://x/', pages: [], findings: [] }));
  await capture(() => buildReport({ cwd: tmp(), run }));
  assert.match(fs.readFileSync(path.join(run, 'report.md'), 'utf8'), /only the automated checks \(no AI\)/);
  assert.match(fs.readFileSync(path.join(run, 'report.html'), 'utf8'), /only the automated checks \(no AI\)/);

  fs.writeFileSync(path.join(run, 'findings.json'), JSON.stringify({ personas: [{ id: 'm', name: 'M', goals: [] }], findings: [] }));
  await capture(() => buildReport({ cwd: tmp(), run }));
  assert.doesNotMatch(fs.readFileSync(path.join(run, 'report.md'), 'utf8'), /only the automated checks/);
});

test('comment --out confirma o arquivo gravado', async () => {
  const { writeComment } = await import('../src/comment.js');
  const dir = tmp();
  const run = path.join(dir, 'run');
  fs.mkdirSync(run);
  fs.writeFileSync(path.join(run, 'checks.json'), JSON.stringify({ url: 'http://x/', pages: [], findings: [] }));
  const out = await capture(() => writeComment({ cwd: dir, run, out: 'comment.md' }));
  assert.match(out, /Comment written to comment\.md/);
  assert.ok(fs.existsSync(path.join(dir, 'comment.md')));
});

test('versão 1.0.0 igual no pacote, no plugin e no changelog', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const plugin = JSON.parse(fs.readFileSync('plugin/.claude-plugin/plugin.json', 'utf8'));
  assert.equal(plugin.version, pkg.version);
  assert.match(fs.readFileSync('CHANGELOG.md', 'utf8'), new RegExp(`## ${pkg.version.replace(/\./g, '\\.')} `));
  assert.ok(pkg.files.includes('CHANGELOG.md'));
});

test('instruções deixam claro que personas e tarefas precisam de IA; sem ela, só a validação automática', async () => {
  const { t, setLocale: set } = await import('../src/i18n.js');
  for (const [lang, readme, help] of [
    ['en', 'README.md', /requires an AI tool[\s\S]*Without AI, only the automated validation runs/],
    ['pt-BR', 'README.pt-BR.md', /precisa de uma ferramenta de IA[\s\S]*Sem IA, roda só a validação automática/],
  ]) {
    set(lang);
    assert.match(t('cli.help'), help);
    assert.match(t('init.next.aiRequired'), lang === 'en' ? /only tested inside an AI tool/ : /só são testadas dentro de uma ferramenta de IA/);
    const text = fs.readFileSync(readme, 'utf8');
    assert.match(text, lang === 'en' ? /\*\*Important: the persona and task test requires AI\.\*\*/ : /\*\*Importante: o teste com personas e tarefas precisa de IA\.\*\*/);
  }
  set('en');
});
