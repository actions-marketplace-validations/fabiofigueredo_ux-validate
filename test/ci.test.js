import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { setLocale } from '../src/i18n.js';
import { buildSarif } from '../src/sarif.js';
import { buildComment, COMMENT_MARKER } from '../src/comment.js';

setLocale('en');

function project() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-ci-'));
  fs.mkdirSync(path.join(repo, '.git'));
  const app = path.join(repo, 'apps/web');
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, 'src/index.html'), '<main>\n  <h1>Shop</h1>\n  <p>Lorem ipsum dolor sit amet</p>\n  <a href="#">Blog</a>\n</main>\n');
  const run = path.join(app, '.ux-validate/runs/r1');
  fs.mkdirSync(run, { recursive: true });
  const finding = (id, severity, extra) => ({
    id,
    severity,
    source: 'check:content',
    category: 'content',
    page: 'http://localhost:3000/index.html',
    title: `Issue ${id} | with pipe <b>`,
    description: 'desc',
    ...extra,
  });
  fs.writeFileSync(
    path.join(run, 'checks.json'),
    JSON.stringify({
      url: 'http://localhost:3000/index.html',
      pages: [{ url: 'http://localhost:3000/index.html' }],
      findings: [
        finding('C001', 'high', { rule: 'leftover-lorem', evidence: { snippet: 'Lorem ipsum dolor sit amet', terms: ['Lorem ipsum'] } }),
        finding('C002', 'low', { source: 'check:axe', category: 'accessibility', rule: 'region', helpUrl: 'https://dequeuniversity.com/rules/axe/region' }),
        finding('C003', 'critical', { source: 'check:links', category: 'navigation', rule: 'empty-link', evidence: { snippet: '<a href="#">Blog</a>' } }),
      ],
    }),
  );
  return { repo, app, run };
}

test('SARIF 2.1.0 com regras estáveis, níveis e caminhos relativos à raiz do repositório', () => {
  const { app, run } = project();
  const sarif = buildSarif({ cwd: app, runDir: run });
  assert.equal(sarif.version, '2.1.0');
  const { driver } = sarif.runs[0].tool;
  assert.equal(driver.name, 'ux-validate');
  assert.deepEqual(driver.rules.map((r) => r.id).sort(), ['axe/region', 'content/leftover-lorem', 'links/empty-link']);
  assert.equal(driver.rules.find((r) => r.id === 'axe/region').helpUri, 'https://dequeuniversity.com/rules/axe/region');

  const byRule = Object.fromEntries(sarif.runs[0].results.map((r) => [r.ruleId, r]));
  assert.equal(byRule['links/empty-link'].level, 'error');
  assert.equal(byRule['axe/region'].level, 'note');
  const loc = byRule['content/leftover-lorem'].locations[0].physicalLocation;
  assert.equal(loc.artifactLocation.uri, 'apps/web/src/index.html', 'caminho a partir da raiz do Git');
  assert.equal(loc.region.startLine, 3, 'linha onde o trecho aparece');
  assert.equal(byRule['links/empty-link'].locations[0].physicalLocation.region.startLine, 4);
  for (const r of sarif.runs[0].results) {
    assert.ok(r.locations.length === 1 && r.partialFingerprints.uxValidate && r.message.text);
  }
});

test('comentário do PR: marcador, contagem, limite --fail-on e escape de Markdown', () => {
  const { run } = project();
  const body = buildComment({ runDir: run, failOn: 'high', artifactUrl: 'https://github.com/o/r/actions/runs/1/artifacts/2', sarifUploaded: true });
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.match(body, /❌ \*\*2 issues\*\* with severity high or higher/);
  assert.match(body, /🔴 Critical: \*\*1\*\* · 🟠 High: \*\*1\*\* · 🟡 Medium: \*\*0\*\* · ⚪ Low: \*\*1\*\*/);
  assert.match(body, /Issue C003 \\\| with pipe &lt;b>/);
  assert.match(body, /\[Full report with screenshots\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\/artifacts\/2\)/);
  assert.match(body, /Security → Code scanning/);
  assert.match(buildComment({ runDir: run, failOn: 'critical' }), /❌ \*\*1 issue\*\*/);
});

test('comentário em português', () => {
  const { run } = project();
  setLocale('pt-BR');
  try {
    const body = buildComment({ runDir: run, failOn: 'critical' });
    assert.match(body, /❌ \*\*1 problema\(s\)\*\* de nível crítico ou mais grave/);
    assert.match(body, /Todos os problemas \(3\)/);
  } finally {
    setLocale('en');
  }
});

test('action.yml declara as entradas e usa as versões atuais das actions oficiais', () => {
  const action = YAML.parse(fs.readFileSync(new URL('../action.yml', import.meta.url), 'utf8'));
  assert.equal(action.runs.using, 'composite');
  for (const input of ['url', 'start', 'fail-on', 'comment', 'sarif', 'upload-sarif', 'language', 'working-directory']) assert.ok(action.inputs[input], input);
  const uses = action.runs.steps.map((s) => s.uses).filter(Boolean);
  assert.deepEqual(uses, ['actions/setup-node@v7', 'actions/upload-artifact@v7', 'github/codeql-action/upload-sarif@v4', 'actions/github-script@v9']);
  const comment = action.runs.steps.find((s) => s.uses === 'actions/github-script@v9');
  assert.match(comment.with.script, /ux-validate-comment/, 'a Action procura o mesmo marcador do comentário');
});

test('SARIF: sem trecho que bata, usa a pasta onde os outros problemas foram localizados', () => {
  const { repo, app, run } = project();
  // Outro index.html no repositório (ex.: site de documentação) e um JSON de exemplo com os mesmos textos.
  fs.mkdirSync(path.join(app, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(app, 'docs/index.html'), '<html lang="en"><p>Docs</p></html>\n');
  fs.writeFileSync(path.join(app, 'sample.json'), JSON.stringify({ snippet: 'Lorem ipsum dolor sit amet', link: '<a href="#">Blog</a>' }));
  const checks = JSON.parse(fs.readFileSync(path.join(run, 'checks.json'), 'utf8'));
  checks.findings.push({ id: 'C004', severity: 'medium', source: 'check:axe', category: 'accessibility', rule: 'html-has-lang', page: 'http://localhost:3000/index.html', title: 'lang', description: 'd', evidence: { snippet: '<html>' } });
  fs.writeFileSync(path.join(run, 'checks.json'), JSON.stringify(checks));
  const sarif = buildSarif({ cwd: app, runDir: run });
  const uris = sarif.runs[0].results.map((r) => r.locations[0].physicalLocation.artifactLocation.uri);
  assert.deepEqual([...new Set(uris)], ['apps/web/src/index.html'], `tudo no arquivo da aplicação: ${uris}`);
  assert.ok(repo);
});
