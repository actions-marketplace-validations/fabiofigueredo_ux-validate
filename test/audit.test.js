import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { setLocale } from '../src/i18n.js';
import { isAllowed, parseRobots } from '../src/robots.js';
import { auditDir, parseAuditUrl } from '../src/audit.js';
import { analyze } from '../src/report.js';
import { UNSAFE_LINK } from '../src/checks.js';

setLocale('en');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-audit-'));
const quiet = async (fn) => {
  const { log, warn } = console;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    return { value: await fn(lines), lines };
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

test('robots.txt: grupo do ux-validate ou *, regra mais longa, curingas e Allow', () => {
  const rules = parseRobots(`
# comentário
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private
Disallow: /*.pdf$
Allow: /private/public
Disallow:
`);
  const ok = (p) => isAllowed(rules, `https://x.com${p}`);
  assert.equal(ok('/'), true);
  assert.equal(ok('/private/data'), false);
  assert.equal(ok('/private/public/page'), true);
  assert.equal(ok('/files/a.pdf'), false);
  assert.equal(ok('/files/a.pdf?x=1'), true);

  const ours = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: ux-validate\nUser-agent: other\nDisallow: /admin\n');
  assert.equal(isAllowed(ours, 'https://x.com/about'), true);
  assert.equal(isAllowed(ours, 'https://x.com/admin/x'), false);
  assert.deepEqual(parseRobots(''), []);
});

test('URL e pasta da auditoria; links que a auditoria não segue', () => {
  assert.equal(parseAuditUrl('www.exemplo.com.br'), 'https://www.exemplo.com.br/');
  assert.equal(parseAuditUrl('http://localhost:4555'), 'http://localhost:4555/');
  assert.throws(() => parseAuditUrl('file:///C:/site/index.html'), /published site/);
  assert.throws(() => parseAuditUrl(''), /site URL/);
  assert.equal(path.basename(auditDir('/x', 'http://localhost:4555/a')), 'localhost-4555');
  assert.equal(path.basename(auditDir('/x', 'https://WWW.Exemplo.com.br/')), 'www.exemplo.com.br');
  for (const text of ['Sign out', 'Sair', 'logout', 'Delete account', 'Excluir conta', 'Cancelar assinatura', 'unsubscribe']) assert.match(text, UNSAFE_LINK, text);
  for (const text of ['Política de cancelamento', 'Saiba mais', 'Contato', 'Login']) assert.doesNotMatch(text, UNSAFE_LINK, text);
});

test('relatório da auditoria: limites e plano para quem mantém o site', () => {
  const checks = {
    mode: 'audit',
    url: 'https://x.com/',
    pages: [],
    skipped: [{ url: 'https://x.com/private', reason: 'robots' }, { url: 'https://x.com/logout', reason: 'unsafe' }],
    findings: [
      { id: 'C001', category: 'ui', severity: 'high', title: 'Overflow', page: 'https://x.com/' },
      { id: 'C002', category: 'content', severity: 'low', title: 'Foreign words', page: 'https://x.com/' },
      { id: 'C003', category: 'content', severity: 'low', title: 'Foreign words', page: 'https://x.com/b' },
    ],
  };
  const agent = {
    limits: ['Checkout: requires login'],
    personas: [{ id: 'm', name: 'M', tasks: [{ id: 't', outcome: 'fail', blockers: ['A001'] }] }],
    findings: [{ id: 'A001', category: 'navigation', severity: 'medium', title: 'Contact hidden', personas: ['m'], page: 'https://x.com/' }],
  };
  const d = analyze(checks, agent);
  assert.equal(d.audit, true);
  assert.deepEqual(d.plan.blocking.map((f) => f.id), ['A001']);
  assert.deepEqual(d.plan.urgent.map((f) => f.id), ['C001']);
  assert.deepEqual(d.plan.others.map((g) => [g.title, g.ids]), [['Foreign words', ['C002', 'C003']]]);
  assert.deepEqual(d.limits, ['Checkout: requires login']);
});

/** Site de teste: robots.txt, links de sair/excluir e um formulário. Registra cada requisição. */
function startSite() {
  const hits = [];
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
  const routes = {
    '/robots.txt': ['text/plain', 'User-agent: *\nDisallow: /private\n'],
    '/': ['text/html', page('Home', '<a href="/contact">Contact</a> <a href="/private/data">Data</a> <a href="/logout">Sign out</a> <a href="/account/delete">Delete account</a>')],
    '/contact': ['text/html', page('Contact', '<form method="post" action="/send"><label>Name <input name="n" required></label><button>Send</button></form>')],
  };
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method, url: req.url, ua: req.headers['user-agent'] ?? '' });
    const r = routes[req.url];
    if (!r) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': r[0] });
    res.end(r[1]);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, hits, url: `http://127.0.0.1:${server.address().port}/` })));
}

test('audit de ponta a ponta: respeita robots.txt, não segue sair/excluir, não envia formulários e se identifica', { timeout: 180000 }, async () => {
  const { audit } = await import('../src/audit.js');
  const { server, hits, url } = await startSite();
  const cwd = tmp();
  try {
    const { value, lines } = await quiet(() =>
      audit({ cwd, url, yes: true, personas: 'margaret', tasks: ['You want to talk to the company.'], viewports: 'desktop', log: console.log }),
    );
    const { dir, runDir, result } = value;

    // O que foi (e o que não foi) visitado.
    const paths = hits.map((h) => h.url);
    assert.ok(paths.includes('/robots.txt') && paths.includes('/contact'));
    for (const p of ['/private/data', '/logout', '/account/delete', '/send']) assert.ok(!paths.includes(p), `não deveria visitar ${p}`);
    assert.ok(hits.every((h) => h.method === 'GET'), 'nenhum formulário enviado');
    assert.ok(hits.every((h) => /ux-validate\/\d/.test(h.ua)), 'toda requisição identificada');
    assert.deepEqual(result.skipped.map((s) => [new URL(s.url).pathname, s.reason]).sort(), [['/account/delete', 'unsafe'], ['/logout', 'unsafe'], ['/private/data', 'robots']]);
    assert.equal(result.mode, 'audit');

    // Pasta do site: configuração, personas, tarefas e a execução com o relatório.
    const config = YAML.parse(fs.readFileSync(path.join(dir, 'ux-validate.config.yml'), 'utf8'));
    assert.equal(config.mode, 'audit');
    assert.equal(config.crawl.delayMs, 1000);
    assert.ok(fs.existsSync(path.join(dir, 'personas/margaret.yml')));
    assert.equal(YAML.parse(fs.readFileSync(path.join(dir, 'tasks.yml'), 'utf8')).length, 1);
    assert.equal(path.dirname(runDir), dir);
    const md = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8');
    assert.match(md, /^# Audit of a published site/);
    assert.match(md, /## Limits of this audit/);
    assert.match(md, /blocked by robots\.txt\*\* \(1\)/);
    assert.match(md, /## Plan for whoever maintains the site/);
    assert.doesNotMatch(md, /ux-fix/);
    assert.match(fs.readFileSync(path.join(runDir, 'checks-brief.md'), 'utf8'), /Not visited \(audit\)/);
    assert.ok(lines.some((l) => /\/ux-audit/.test(l)));

    // Na pasta da auditoria, fix e sarif não se aplicam (não há código).
    const { fix } = await import('../src/fix.js');
    const { writeSarif } = await import('../src/sarif.js');
    await assert.rejects(fix({ cwd: dir }), /audit has none/);
    await assert.rejects(writeSarif({ cwd: dir }), /audit has none/);

    // Rodar de novo reaproveita a pasta e não duplica as tarefas.
    await quiet(() => audit({ cwd, url, yes: true, tasks: ['You want to talk to the company.'], viewports: 'desktop', maxPages: 1, log: console.log }));
    assert.equal(YAML.parse(fs.readFileSync(path.join(dir, 'tasks.yml'), 'utf8')).length, 1);
    assert.equal(fs.readdirSync(dir).filter((f) => /^\d{4}-/.test(f)).length >= 1, true);
  } finally {
    server.close();
  }
});

test('sem --yes fora de um terminal interativo, a auditoria não começa', async () => {
  const { audit } = await import('../src/audit.js');
  const isTTY = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    await assert.rejects(audit({ cwd: tmp(), url: 'https://example.com', log: () => {} }), /--yes/);
  } finally {
    process.stdin.isTTY = isTTY;
  }
});
