import fs from 'node:fs';
import path from 'node:path';
import { latestRunDir } from './config.js';
import { t, getLocale, formatDate } from './i18n.js';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const PENALTY = { critical: 30, high: 15, medium: 6, low: 2 };
const CATEGORY_KEYS = ['content', 'navigation', 'ui', 'accessibility'];
// Rótulos no idioma atual da ferramenta (lidos na hora, porque o idioma pode mudar entre execuções).
const SEVERITY_LABEL = new Proxy({}, { get: (_, k) => t('report.severities')[k] });
const CATEGORIES = new Proxy({}, { get: (_, k) => t('report.categories')[k] });
const OUTCOME_LABEL = new Proxy({}, { get: (_, k) => t('report.outcomes')[k] });
const categoryEntries = () => CATEGORY_KEYS.map((k) => [k, CATEGORIES[k]]);

/**
 * Junta checks.json (checagens fixas) e findings.json (avaliação do agente por persona)
 * em report.md e report.html. O formato do findings.json está em source/references/findings-format.md.
 */
export async function buildReport({ cwd, run }) {
  const runDir = run ? path.resolve(cwd, run) : latestRunDir(cwd);
  if (!runDir || !fs.existsSync(runDir)) throw new Error(t('report.noRun'));

  const checks = readJson(path.join(runDir, 'checks.json'));
  const agent = readJson(path.join(runDir, 'findings.json'));
  if (!checks && !agent) throw new Error(t('report.noData', { dir: runDir }));

  const data = analyze(checks, agent);
  fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(data));
  fs.writeFileSync(path.join(runDir, 'report.html'), renderHtml(data));

  console.log(t('report.generated'));
  console.log(`  ${path.relative(cwd, path.join(runDir, 'report.md'))}`);
  console.log(`  ${path.relative(cwd, path.join(runDir, 'report.html'))}`);
  return { runDir, ...data };
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(t('report.invalidJson', { file: path.basename(file), message: err.message }));
  }
}

export function analyze(checks, agent) {
  const personas = agent?.personas ?? [];
  const checkFindings = (checks?.findings ?? []).map((f) => ({ ...f, origin: 'check' }));
  const agentFindings = (agent?.findings ?? []).map((f) => ({ ...f, origin: 'agent' }));

  // Um problema das checagens fixas que o agente já detalhou não aparece duas vezes.
  const covered = new Set(agentFindings.flatMap((f) => f.relatedChecks ?? []));
  const findings = [...agentFindings, ...checkFindings.filter((f) => !covered.has(f.id))];

  const ariaTrees = Object.fromEntries((checks?.pages ?? []).filter((p) => p.ariaTree).map((p) => [p.url, p.ariaTree]));
  for (const f of findings) {
    f.affects = affectedPersonas(f, personas);
    if (f.category === 'accessibility' && ariaTrees[f.page]) f.ariaTree = ariaTrees[f.page];
  }
  findings.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (a.origin === b.origin ? 0 : a.origin === 'agent' ? -1 : 1) ||
      b.affects.length - a.affects.length,
  );

  const scores = personas.length
    ? personas.map((p) => ({ persona: p, ...scoreFor(findings.filter((f) => f.affects.includes(p.id)), p) }))
    : [{ persona: { id: '*', name: t('report.generalPersona') }, ...scoreFor(findings, null) }];

  return {
    url: checks?.url ?? agent?.url,
    createdAt: agent?.createdAt ?? checks?.createdAt,
    agentInfo: agent?.agent,
    pages: checks?.pages ?? [],
    personas,
    findings,
    scores,
  };
}

function affectedPersonas(f, personas) {
  if (f.personas?.length) return f.personas;
  // Checagem fixa: afeta as personas que usam o tamanho de tela em que o problema apareceu.
  return personas.filter((p) => !f.viewports?.length || f.viewports.includes(p.viewport)).map((p) => p.id);
}

function scoreFor(findings, persona) {
  const result = {};
  for (const cat of CATEGORY_KEYS) {
    const penalty = findings.filter((f) => f.category === cat).reduce((sum, f) => sum + (PENALTY[f.severity] ?? 0), 0);
    // Curva decrescente: cada problema pesa, mas a nota não zera com poucos itens e ainda diferencia "ruim" de "péssimo".
    result[cat] = Math.round(100 * Math.exp(-penalty / 100));
  }
  const goals = persona?.goals ?? [];
  if (goals.length) {
    const done = goals.reduce((s, g) => s + (g.outcome === 'success' ? 1 : g.outcome === 'partial' ? 0.5 : 0), 0);
    result.goalRate = Math.round((done / goals.length) * 100);
    // Navegação pesa metade pelos problemas encontrados e metade por conseguir cumprir os objetivos.
    result.navigation = Math.round((result.navigation + result.goalRate) / 2);
  }
  result.overall = Math.round(CATEGORY_KEYS.reduce((sum, c) => sum + result[c], 0) / CATEGORY_KEYS.length);
  return result;
}

/* ---------- Markdown ---------- */

function renderMarkdown(d) {
  const lines = [];
  lines.push(`# ${t('report.title')}`, '');
  lines.push(`**${t('report.app')}:** ${d.url ?? '—'}  `);
  lines.push(`**${t('report.date')}:** ${formatDate(d.createdAt)}  `);
  if (d.agentInfo) lines.push(`**${t('report.evaluatedBy')}:** ${[d.agentInfo.tool, d.agentInfo.model].filter(Boolean).join(' · ')}  `);
  lines.push(`**${t('report.pagesAnalyzed')}:** ${d.pages.length || '—'}`, '');

  lines.push(`## ${t('report.scoresTitle')}`, '');
  lines.push(`| ${t('report.persona')} | ${t('report.overall')} | ${categoryEntries().map(([, v]) => v).join(' | ')} | ${t('report.goalsDone')} |`);
  lines.push(`|---|---:|${CATEGORY_KEYS.map(() => '---:').join('|')}|---:|`);
  for (const s of d.scores) {
    lines.push(
      `| ${s.persona.name} | **${s.overall}** | ${CATEGORY_KEYS.map((c) => s[c]).join(' | ')} | ${s.goalRate ?? '—'}${s.goalRate != null ? '%' : ''} |`,
    );
  }
  lines.push('');

  if (d.personas.length) {
    lines.push(`## ${t('report.goals')}`, '');
    for (const p of d.personas) {
      lines.push(`### ${p.name}${p.viewport ? ` · ${p.viewport}` : ''}`, '');
      if (p.summary) lines.push(p.summary, '');
      for (const g of p.goals ?? []) {
        lines.push(`- ${OUTCOME_LABEL[g.outcome] ?? g.outcome} — **${g.goal}** (${g.steps ?? '?'} ${t('report.steps')})`);
        if (g.notes) lines.push(`  - ${g.notes}`);
        if (g.blockers?.length) lines.push(`  - ${t('report.blockers')}: ${g.blockers.join(', ')}`);
      }
      lines.push('');
    }
  }

  const top = d.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  lines.push(`## ${t('report.fixFirst')}`, '');
  if (!top.length) lines.push(t('report.noTop'), '');
  top.slice(0, 10).forEach((f, i) => lines.push(`${i + 1}. **[${f.id}] ${f.title}** — ${SEVERITY_LABEL[f.severity]}, ${CATEGORIES[f.category]}`));
  lines.push('');

  if (d.findings.length) {
    lines.push(`> ${t('report.applyFixes')}`, '');
  }

  for (const [cat, label] of categoryEntries()) {
    const list = d.findings.filter((f) => f.category === cat);
    lines.push(`## ${label} (${list.length})`, '');
    if (!list.length) lines.push(t('report.noIssues'), '');
    for (const f of list) {
      lines.push(`### [${f.id}] ${f.title}`, '');
      const meta = [
        `**${t('report.severity')}:** ${SEVERITY_LABEL[f.severity]}`,
        `**${t('report.origin')}:** ${f.origin === 'agent' ? t('report.originAgent') : t('report.originCheck', { name: f.source?.replace('check:', '') })}`,
        f.confidence ? `**${t('report.confidence')}:** ${f.confidence === 'confirmed' ? t('report.confirmed') : t('report.likely')}` : null,
        f.affects.length ? `**${t('report.personas')}:** ${f.affects.map((id) => personaName(d, id)).join(', ')}` : null,
        f.viewports?.length ? `**${t('report.screens')}:** ${f.viewports.join(', ')}` : null,
      ].filter(Boolean);
      lines.push(meta.join(' · '), '');
      if (f.page) lines.push(`**${t('report.page')}:** ${f.page}  `);
      if (f.heuristic) lines.push(`**${t('report.criterion')}:** ${f.heuristic}  `);
      if (f.sourceHint?.file) lines.push(`**${t('report.whereToFix')}:** \`${f.sourceHint.file}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}\`  `);
      if (f.react?.components?.length) lines.push(`**${t('report.component')}:** \`${f.react.components.join(' › ')}\`  `);
      lines.push('', f.description ?? '', '');
      if (f.evidence?.snippet) lines.push('```', f.evidence.snippet, '```', '');
      if (f.evidence?.selector) lines.push(`${t('report.elements')}: \`${f.evidence.selector}\``, '');
      if (f.ariaTree) lines.push(`${t('report.ariaTree')}: [${f.ariaTree}](${f.ariaTree})`, '');
      if (f.evidence?.screenshot) lines.push(`![screenshot](${f.evidence.screenshot})`, '');
      if (f.suggestion) lines.push(`**${t('report.howToFix')}:** ${f.suggestion}${f.helpUrl ? ` ([${t('report.reference')}](${f.helpUrl}))` : ''}`, '');
    }
  }
  return lines.join('\n');
}

/* ---------- HTML ---------- */

function renderHtml(d) {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // URLs vêm das páginas testadas e do findings.json do agente: só http(s), file e caminhos relativos
  // viram link (bloqueia javascript:, data: etc. no relatório aberto no navegador).
  const url = (u) => {
    const s = String(u ?? '').trim();
    return /^(https?:|file:)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s) ? esc(s) : '#';
  };
  const scoreClass = (n) => (n >= 85 ? 'good' : n >= 60 ? 'warn' : 'bad');

  const scoreRows = d.scores
    .map(
      (s) => `<tr><th scope="row">${esc(s.persona.name)}</th>
        <td><span class="score ${scoreClass(s.overall)}">${s.overall}</span></td>
        ${CATEGORY_KEYS.map((c) => `<td class="${scoreClass(s[c])}">${s[c]}</td>`).join('')}
        <td>${s.goalRate != null ? `${s.goalRate}%` : '—'}</td></tr>`,
    )
    .join('');

  const goals = d.personas
    .map(
      (p) => `<section class="card"><h3>${esc(p.name)} <small>${esc(p.viewport ?? '')}</small></h3>
      ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
      <ul class="goals">${(p.goals ?? [])
        .map(
          (g) => `<li class="${esc(g.outcome)}"><strong>${esc(OUTCOME_LABEL[g.outcome] ?? g.outcome)}</strong> ${esc(g.goal)}
          <span class="muted">${g.steps ?? '?'} ${t('report.steps')}</span>${g.notes ? `<div class="muted">${esc(g.notes)}</div>` : ''}</li>`,
        )
        .join('')}</ul></section>`,
    )
    .join('');

  const filters = categoryEntries()
    .map(([k, v]) => `<button data-filter="${k}">${v} (${d.findings.filter((f) => f.category === k).length})</button>`)
    .join('');

  const items = d.findings
    .map(
      (f) => `<article class="finding" data-category="${esc(f.category)}">
      <header><span class="sev ${esc(f.severity)}">${esc(SEVERITY_LABEL[f.severity])}</span>
        <span class="tag">${esc(CATEGORIES[f.category])}</span>
        <span class="tag">${f.origin === 'agent' ? t('report.tagPersona') : esc(t('report.tagCheck', { name: f.source?.replace('check:', '') }))}</span>
        <h3>[${esc(f.id)}] ${esc(f.title)}</h3></header>
      <p>${esc(f.description)}</p>
      <dl>
        ${f.page ? `<dt>${t('report.page')}</dt><dd><a href="${url(f.page)}">${esc(f.page)}</a></dd>` : ''}
        ${f.affects.length ? `<dt>${t('report.personas')}</dt><dd>${esc(f.affects.map((id) => personaName(d, id)).join(', '))}</dd>` : ''}
        ${f.viewports?.length ? `<dt>${t('report.screens')}</dt><dd>${esc(f.viewports.join(', '))}</dd>` : ''}
        ${f.heuristic ? `<dt>${t('report.criterion')}</dt><dd>${esc(f.heuristic)}</dd>` : ''}
        ${f.sourceHint?.file ? `<dt>${t('report.whereToFix')}</dt><dd><code>${esc(f.sourceHint.file)}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}</code></dd>` : ''}
        ${f.react?.components?.length ? `<dt>${t('report.component')}</dt><dd><code>${esc(f.react.components.join(' › '))}</code></dd>` : ''}
        ${f.evidence?.selector ? `<dt>${t('report.element')}</dt><dd><code>${esc(f.evidence.selector)}</code></dd>` : ''}
        ${f.ariaTree ? `<dt>${t('report.screenReader')}</dt><dd><a href="${url(f.ariaTree)}">${t('report.ariaTree')}</a></dd>` : ''}
      </dl>
      ${f.evidence?.snippet ? `<pre>${esc(f.evidence.snippet)}</pre>` : ''}
      ${f.suggestion ? `<p class="fix"><strong>${t('report.howToFix')}:</strong> ${esc(f.suggestion)}${f.helpUrl ? ` <a href="${url(f.helpUrl)}" target="_blank" rel="noopener noreferrer">${t('report.referenceHtml')}</a>` : ''}</p>` : ''}
      ${f.evidence?.screenshot ? `<details><summary>${t('report.seeScreenshot')}</summary><img loading="lazy" src="${url(f.evidence.screenshot)}" alt="${esc(t('report.screenshotOf', { page: f.page }))}"></details>` : ''}
    </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${getLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('report.title')}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--text:#1d1d1b;--muted:#6b6b66;--line:#e3e3de;--good:#1a7f4b;--warn:#a15c00;--bad:#b42318;--accent:#3b4ccf}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--text:#ecece8;--muted:#a3a39c;--line:#33332f;--good:#4ec98a;--warn:#f0b041;--bad:#f97066;--accent:#8b98ff}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,sans-serif;background:var(--bg);color:var(--text)}
main{max-width:1000px;margin:0 auto;padding:32px 16px 64px}h1{margin:0 0 4px}h2{margin:40px 0 12px}
.muted,small{color:var(--muted)}.card h3{margin-top:0}.card,.finding{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;margin:12px 0}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:right}th[scope=row],thead th:first-child{text-align:left}
td.good{color:var(--good)}td.warn{color:var(--warn)}td.bad{color:var(--bad)}
.score{display:inline-block;min-width:44px;text-align:center;font-weight:700;border-radius:6px;padding:2px 8px;color:#fff}
.score.good{background:var(--good)}.score.warn{background:var(--warn)}.score.bad{background:var(--bad)}
.goals{list-style:none;padding:0;margin:0}.goals li{padding:6px 0;border-top:1px solid var(--line)}
.finding header{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.finding h3{flex-basis:100%;margin:6px 0 0;font-size:17px}
.sev,.tag{font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;border:1px solid var(--line)}
.sev.critical{background:var(--bad);color:#fff;border:0}.sev.high{color:var(--bad);border-color:var(--bad)}
.sev.medium{color:var(--warn);border-color:var(--warn)}.sev.low{color:var(--muted)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:8px 0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
pre{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;font-size:13px;white-space:pre-wrap}
.fix{border-left:3px solid var(--accent);padding-left:10px}img{max-width:100%;border:1px solid var(--line);border-radius:6px;margin-top:8px}
a{color:var(--accent)}.filters{display:flex;flex-wrap:wrap;gap:8px}.filters button{font:inherit;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}
.filters button[aria-pressed=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
</style></head><body><main>
<h1>${t('report.title')}</h1>
<p class="muted">${esc(d.url ?? '')} · ${esc(formatDate(d.createdAt))}${d.agentInfo ? ` · ${esc([d.agentInfo.tool, d.agentInfo.model].filter(Boolean).join(' · '))}` : ''} · ${t('report.pagesCount', { n: d.pages.length })}</p>
<h2>${t('report.scoresTitle')}</h2>
<div style="overflow-x:auto"><table><thead><tr><th>${t('report.persona')}</th><th>${t('report.overall')}</th>${categoryEntries().map(([, c]) => `<th>${c}</th>`).join('')}<th>${t('report.goals')}</th></tr></thead><tbody>${scoreRows}</tbody></table></div>
${goals ? `<h2>${t('report.goals')}</h2>${goals}` : ''}
<h2>${t('report.issues')} (${d.findings.length})</h2>
<div class="filters"><button data-filter="all" aria-pressed="true">${t('report.all')}</button>${filters}</div>
${d.findings.length ? `<p class="card">${t('report.applyFixesHtml')}</p>` : ''}
${items || `<p>${t('report.noIssuesHtml')}</p>`}
</main>
<script>
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b));
  document.querySelectorAll('.finding').forEach(f=>f.hidden=b.dataset.filter!=='all'&&f.dataset.category!==b.dataset.filter);
}));
</script></body></html>`;
}

function personaName(d, id) {
  return d.personas.find((p) => p.id === id)?.name ?? id;
}
