import { SEVERITY_ORDER } from './config.js';
import { t } from './i18n.js';

/**
 * Resumo do checks.json para o agente (checks-brief.md): o mesmo conteúdo que ele precisa para
 * navegar como as personas, em poucas linhas. Problemas iguais em várias páginas viram um grupo,
 * as URLs ficam curtas e saem os campos que o relatório usa, mas o agente não (capturas de tela,
 * links de documentação, sugestões genéricas). O checks.json continua com tudo, consultado por id.
 */

const MAX_INSTANCES = 4;
const clip = (s, n) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** Caminho da página relativo à pasta da URL inicial ("/", "/planos.html", "#/conta"). */
export function shortPage(url, base) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const b = new URL(base);
    if (u.origin !== b.origin && u.protocol !== 'file:') return url;
    const dir = b.pathname.replace(/[^/]*$/, '');
    const rel = u.pathname.startsWith(dir) ? `/${u.pathname.slice(dir.length)}` : u.pathname;
    return `${rel}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

export function buildBrief(result) {
  const base = result.url;
  const page = (u) => shortPage(u, base);
  // URLs completas dentro dos textos (ex.: "Destino: http://localhost:3000/x") também ficam curtas.
  const baseDir = String(base).replace(/[^/]*$/, '');
  const short = (s) => (baseDir.length > 8 ? String(s ?? '').split(baseDir).join('/') : String(s ?? ''));
  const findings = result.findings ?? [];
  const lines = [];
  const count = (s) => findings.filter((f) => f.severity === s).length;

  lines.push(`# ${t('brief.title')}`, '');
  const react = result.app?.react;
  lines.push(
    `${t('brief.url')}: ${base} · ${t('brief.viewports')}: ${(result.viewports ?? []).join(', ')}` +
      (result.app ? ` · ${result.app.framework}${react?.version ? ` ${react.version}` : ''} (${react?.dev ? 'dev' : 'production build'})` : ''),
  );
  lines.push(
    t('checks.summary', { total: findings.length, critical: count('critical'), high: count('high'), medium: count('medium'), low: count('low') }).trim().replace(/^✔\s*/, ''),
  );
  lines.push(t('brief.details'), '');

  lines.push(`## ${t('brief.pages')}`, '', `| ${t('brief.page')} | ${t('brief.pageTitle')} | status | ${t('brief.aria')} |`, '|---|---|---|---|');
  for (const p of result.pages ?? []) {
    lines.push(`| ${page(p.url)} | ${clip(p.title, 50).replace(/\|/g, '/')} | ${p.status ?? '-'}${p.soft404 ? ' (soft 404)' : ''} | ${p.ariaTree ?? '-'} |`);
  }
  lines.push('');

  if (result.taskWarnings?.length) {
    lines.push(`## ${t('brief.taskWarnings')}`, '');
    for (const w of result.taskWarnings) lines.push(`- ${w.id}: ${w.labels.map((l) => `"${l}"`).join(', ')}`);
    lines.push('');
  }

  // Agrupa o mesmo problema (mesma origem, regra e título) visto em várias páginas ou elementos.
  const groups = new Map();
  for (const f of findings) {
    const key = [f.source, f.rule ?? '', f.title].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const rank = (s) => {
    const i = SEVERITY_ORDER.indexOf(s);
    return i < 0 ? 99 : i;
  };
  const sorted = [...groups.values()].sort((a, b) => rank(a[0].severity) - rank(b[0].severity) || b.length - a.length);

  lines.push(`## ${t('brief.issues')}`, '');
  if (!sorted.length) lines.push(t('brief.none'));
  for (const group of sorted) {
    const f = group[0];
    const tags = [f.severity, f.category, f.source?.replace(/^check:/, ''), f.rule, f.audience ? `${t('brief.only')} ${f.audience}` : null].filter(Boolean);
    lines.push(`- **${clip(f.title, 100)}** (${tags.join(' · ')})${group.length > 1 ? ` ×${group.length}` : ''}`);
    for (const x of group.slice(0, MAX_INSTANCES)) {
      const where = [page(x.page), x.viewports?.length ? x.viewports.join('/') : null].filter(Boolean).join(' ');
      const what = x.evidence?.snippet ?? x.description;
      const hint = x.sourceHint?.file ? ` → ${x.sourceHint.file}${x.sourceHint.line ? `:${x.sourceHint.line}` : ''}` : x.react?.components?.length ? ` → <${x.react.components[0]}>` : '';
      lines.push(`  - ${x.id} ${where}: ${clip(short(what), 120)}${hint}`);
    }
    if (group.length > MAX_INSTANCES) lines.push(`  - ${t('brief.more', { n: group.length - MAX_INSTANCES, ids: group.slice(MAX_INSTANCES).map((x) => x.id).join(', ') })}`);
  }
  return `${lines.join('\n')}\n`;
}
