import fs from 'node:fs';
import path from 'node:path';
import { SEVERITY_ORDER, latestRunDir } from './config.js';
import { analyze } from './report.js';
import { t, formatDate } from './i18n.js';

/**
 * Resumo em Markdown para comentário de pull request. A primeira linha é um marcador invisível
 * para a Action encontrar e atualizar o mesmo comentário em vez de criar um novo a cada push.
 */

export const COMMENT_MARKER = '<!-- ux-validate-comment -->';
const MAX_LENGTH = 60000; // o GitHub aceita até 65.536 caracteres por comentário
const ICON = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const CATEGORY_KEYS = ['content', 'navigation', 'ui', 'accessibility'];

export function buildComment({ runDir, artifactUrl, sarifUploaded = false, failOn }) {
  const checks = readJson(path.join(runDir, 'checks.json'));
  const agent = readJson(path.join(runDir, 'findings.json'));
  if (!checks && !agent) throw new Error(t('report.noData', { dir: runDir }));
  const d = analyze(checks, agent);
  const sev = t('report.severities');
  const cat = t('report.categories');
  const count = (s) => d.findings.filter((f) => f.severity === s).length;

  const lines = [COMMENT_MARKER, `## ${t('comment.title')}`, ''];
  lines.push(`${d.url ?? '—'} · ${t('report.pagesCount', { n: d.pages.length })} · ${formatDate(d.createdAt)}`, '');

  if (!d.findings.length) {
    lines.push(t('comment.noIssues'));
  } else {
    const blocking = failOn ? d.findings.filter((f) => SEVERITY_ORDER.indexOf(f.severity) <= SEVERITY_ORDER.indexOf(failOn)).length : 0;
    if (failOn) lines.push(blocking ? t('comment.failing', { n: blocking, severity: sev[failOn] }) : t('comment.passing', { severity: sev[failOn] }), '');
    lines.push(SEVERITY_ORDER.map((s) => `${ICON[s]} ${sev[s]}: **${count(s)}**`).join(' · '), '');

    lines.push(`| ${t('report.persona')} | ${t('report.overall')} | ${CATEGORY_KEYS.map((k) => cat[k]).join(' | ')} |`);
    lines.push(`|---|---:|${CATEGORY_KEYS.map(() => '---:').join('|')}|`);
    for (const s of d.scores) lines.push(`| ${s.persona.name} | **${s.overall}** | ${CATEGORY_KEYS.map((k) => s[k]).join(' | ')} |`);
    lines.push('');

    const top = d.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 10);
    if (top.length) {
      lines.push(`### ${t('report.fixFirst')}`, '');
      for (const f of top) lines.push(`- ${ICON[f.severity]} **${esc(f.title)}** — ${cat[f.category]}${where(f)}`);
      lines.push('');
    }

    const rows = d.findings.map(
      (f) => `| ${ICON[f.severity]} ${sev[f.severity]} | ${cat[f.category]} | ${esc(f.title)} | ${f.page ? pagePath(f.page) : '—'} |`,
    );
    lines.push(`<details><summary>${t('comment.allIssues', { n: d.findings.length })}</summary>`, '');
    lines.push(`| ${t('report.severity')} | ${t('comment.category')} | ${t('comment.issue')} | ${t('report.page')} |`, '|---|---|---|---|');
    let body = lines.join('\n');
    let added = 0;
    for (const row of rows) {
      if (body.length + row.length > MAX_LENGTH - 2000) break;
      body += `\n${row}`;
      added++;
    }
    if (added < rows.length) body += `\n\n${t('comment.truncated', { n: rows.length - added })}`;
    lines.length = 0;
    lines.push(body, '', '</details>', '');
  }

  const links = [];
  if (artifactUrl) links.push(t('comment.fullReport', { url: artifactUrl }));
  if (sarifUploaded) links.push(t('comment.codeScanning'));
  if (links.length) lines.push(links.join(' · '), '');
  lines.push(`<sub>${t('comment.footer')}</sub>`);
  return lines.join('\n');
}

export async function writeComment({ cwd, run, out, artifactUrl, sarifUploaded, failOn }) {
  const runDir = run ? path.resolve(cwd, run) : latestRunDir(cwd);
  if (!runDir || !fs.existsSync(runDir)) throw new Error(t('report.noRun'));
  const text = buildComment({ runDir, artifactUrl, sarifUploaded, failOn });
  if (out) {
    const file = path.resolve(cwd, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  } else {
    console.log(text);
  }
  return text;
}

function where(f) {
  const page = f.page ? ` · ${pagePath(f.page)}` : '';
  const file = f.sourceHint?.file ? ` · \`${f.sourceHint.file}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}\`` : '';
  return page + file;
}

function pagePath(url) {
  try {
    const u = new URL(url);
    return `\`${u.pathname || '/'}\``;
  } catch {
    return `\`${url}\``;
  }
}

/** Evita que títulos quebrem a tabela ou virem menções/HTML no Markdown do GitHub. */
function esc(text) {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/@/g, '@​');
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
