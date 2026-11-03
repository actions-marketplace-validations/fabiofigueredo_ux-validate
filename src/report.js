import fs from 'node:fs';
import path from 'node:path';
import { latestRunDir } from './config.js';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LABEL = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' };
const PENALTY = { critical: 30, high: 15, medium: 6, low: 2 };
const CATEGORIES = { content: 'Conteúdo', navigation: 'Navegação', ui: 'Interface' };
const OUTCOME_LABEL = { success: '✅ Conseguiu', partial: '⚠️ Em parte', fail: '❌ Não conseguiu' };

/**
 * Junta checks.json (checagens fixas) e findings.json (avaliação do agente por persona)
 * em report.md e report.html. O formato do findings.json está em source/references/findings-format.md.
 */
export async function buildReport({ cwd, run }) {
  const runDir = run ? path.resolve(cwd, run) : latestRunDir(cwd);
  if (!runDir || !fs.existsSync(runDir)) throw new Error('Nenhuma execução encontrada. Rode /persona-test ou "npx persona-qa check".');

  const checks = readJson(path.join(runDir, 'checks.json'));
  const agent = readJson(path.join(runDir, 'findings.json'));
  if (!checks && !agent) throw new Error(`Nem checks.json nem findings.json em ${runDir}.`);

  const data = analyze(checks, agent);
  fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(data));
  fs.writeFileSync(path.join(runDir, 'report.html'), renderHtml(data));

  console.log(`✔ Relatório gerado:`);
  console.log(`  ${path.relative(cwd, path.join(runDir, 'report.md'))}`);
  console.log(`  ${path.relative(cwd, path.join(runDir, 'report.html'))}`);
  return { runDir, ...data };
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${path.basename(file)} não é um JSON válido: ${err.message}`);
  }
}

export function analyze(checks, agent) {
  const personas = agent?.personas ?? [];
  const checkFindings = (checks?.findings ?? []).map((f) => ({ ...f, origin: 'check' }));
  const agentFindings = (agent?.findings ?? []).map((f) => ({ ...f, origin: 'agent' }));

  // Um problema das checagens fixas que o agente já detalhou não aparece duas vezes.
  const covered = new Set(agentFindings.flatMap((f) => f.relatedChecks ?? []));
  const findings = [...agentFindings, ...checkFindings.filter((f) => !covered.has(f.id))];

  for (const f of findings) {
    f.affects = affectedPersonas(f, personas);
  }
  findings.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (a.origin === b.origin ? 0 : a.origin === 'agent' ? -1 : 1) ||
      b.affects.length - a.affects.length,
  );

  const scores = personas.length
    ? personas.map((p) => ({ persona: p, ...scoreFor(findings.filter((f) => f.affects.includes(p.id)), p) }))
    : [{ persona: { id: '*', name: 'Geral (sem persona)' }, ...scoreFor(findings, null) }];

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
  for (const cat of Object.keys(CATEGORIES)) {
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
  result.overall = Math.round((result.content + result.navigation + result.ui) / 3);
  return result;
}

/* ---------- Markdown ---------- */

function renderMarkdown(d) {
  const lines = [];
  lines.push(`# Relatório persona-qa`, '');
  lines.push(`**Aplicação:** ${d.url ?? '—'}  `);
  lines.push(`**Data:** ${fmtDate(d.createdAt)}  `);
  if (d.agentInfo) lines.push(`**Avaliado por:** ${[d.agentInfo.tool, d.agentInfo.model].filter(Boolean).join(' · ')}  `);
  lines.push(`**Páginas analisadas:** ${d.pages.length || '—'}`, '');

  lines.push('## Notas por persona', '');
  lines.push('| Persona | Geral | Conteúdo | Navegação | Interface | Objetivos cumpridos |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const s of d.scores) {
    lines.push(
      `| ${s.persona.name} | **${s.overall}** | ${s.content} | ${s.navigation} | ${s.ui} | ${s.goalRate ?? '—'}${s.goalRate != null ? '%' : ''} |`,
    );
  }
  lines.push('');

  if (d.personas.length) {
    lines.push('## Objetivos', '');
    for (const p of d.personas) {
      lines.push(`### ${p.name}${p.viewport ? ` · ${p.viewport}` : ''}`, '');
      if (p.summary) lines.push(p.summary, '');
      for (const g of p.goals ?? []) {
        lines.push(`- ${OUTCOME_LABEL[g.outcome] ?? g.outcome} — **${g.goal}** (${g.steps ?? '?'} passos)`);
        if (g.notes) lines.push(`  - ${g.notes}`);
        if (g.blockers?.length) lines.push(`  - Bloqueios: ${g.blockers.join(', ')}`);
      }
      lines.push('');
    }
  }

  const top = d.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  lines.push('## Corrigir primeiro', '');
  if (!top.length) lines.push('Nenhum problema crítico ou alto. 🎉', '');
  top.slice(0, 10).forEach((f, i) => lines.push(`${i + 1}. **[${f.id}] ${f.title}** — ${SEVERITY_LABEL[f.severity]}, ${CATEGORIES[f.category]}`));
  lines.push('');

  for (const [cat, label] of Object.entries(CATEGORIES)) {
    const list = d.findings.filter((f) => f.category === cat);
    lines.push(`## ${label} (${list.length})`, '');
    if (!list.length) lines.push('Nenhum problema encontrado.', '');
    for (const f of list) {
      lines.push(`### [${f.id}] ${f.title}`, '');
      const meta = [
        `**Gravidade:** ${SEVERITY_LABEL[f.severity]}`,
        `**Origem:** ${f.origin === 'agent' ? 'avaliação por persona' : `checagem (${f.source?.replace('check:', '')})`}`,
        f.confidence ? `**Confiança:** ${f.confidence === 'confirmed' ? 'confirmado' : 'provável'}` : null,
        f.affects.length ? `**Personas:** ${f.affects.map((id) => personaName(d, id)).join(', ')}` : null,
        f.viewports?.length ? `**Telas:** ${f.viewports.join(', ')}` : null,
      ].filter(Boolean);
      lines.push(meta.join(' · '), '');
      if (f.page) lines.push(`**Página:** ${f.page}  `);
      if (f.heuristic) lines.push(`**Critério:** ${f.heuristic}  `);
      if (f.sourceHint?.file) lines.push(`**Onde corrigir:** \`${f.sourceHint.file}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}\`  `);
      lines.push('', f.description ?? '', '');
      if (f.evidence?.snippet) lines.push('```', f.evidence.snippet, '```', '');
      if (f.evidence?.selector) lines.push(`Elemento(s): \`${f.evidence.selector}\``, '');
      if (f.evidence?.screenshot) lines.push(`![screenshot](${f.evidence.screenshot})`, '');
      if (f.suggestion) lines.push(`**Como corrigir:** ${f.suggestion}${f.helpUrl ? ` ([referência](${f.helpUrl}))` : ''}`, '');
    }
  }
  return lines.join('\n');
}

/* ---------- HTML ---------- */

function renderHtml(d) {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const scoreClass = (n) => (n >= 85 ? 'good' : n >= 60 ? 'warn' : 'bad');

  const scoreRows = d.scores
    .map(
      (s) => `<tr><th scope="row">${esc(s.persona.name)}</th>
        <td><span class="score ${scoreClass(s.overall)}">${s.overall}</span></td>
        ${['content', 'navigation', 'ui'].map((c) => `<td class="${scoreClass(s[c])}">${s[c]}</td>`).join('')}
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
          <span class="muted">${g.steps ?? '?'} passos</span>${g.notes ? `<div class="muted">${esc(g.notes)}</div>` : ''}</li>`,
        )
        .join('')}</ul></section>`,
    )
    .join('');

  const filters = Object.entries(CATEGORIES)
    .map(([k, v]) => `<button data-filter="${k}">${v} (${d.findings.filter((f) => f.category === k).length})</button>`)
    .join('');

  const items = d.findings
    .map(
      (f) => `<article class="finding" data-category="${esc(f.category)}">
      <header><span class="sev ${esc(f.severity)}">${esc(SEVERITY_LABEL[f.severity])}</span>
        <span class="tag">${esc(CATEGORIES[f.category])}</span>
        <span class="tag">${f.origin === 'agent' ? 'persona' : esc(f.source?.replace('check:', 'checagem: '))}</span>
        <h3>[${esc(f.id)}] ${esc(f.title)}</h3></header>
      <p>${esc(f.description)}</p>
      <dl>
        ${f.page ? `<dt>Página</dt><dd><a href="${esc(f.page)}">${esc(f.page)}</a></dd>` : ''}
        ${f.affects.length ? `<dt>Personas</dt><dd>${esc(f.affects.map((id) => personaName(d, id)).join(', '))}</dd>` : ''}
        ${f.viewports?.length ? `<dt>Telas</dt><dd>${esc(f.viewports.join(', '))}</dd>` : ''}
        ${f.heuristic ? `<dt>Critério</dt><dd>${esc(f.heuristic)}</dd>` : ''}
        ${f.sourceHint?.file ? `<dt>Onde corrigir</dt><dd><code>${esc(f.sourceHint.file)}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}</code></dd>` : ''}
        ${f.evidence?.selector ? `<dt>Elemento</dt><dd><code>${esc(f.evidence.selector)}</code></dd>` : ''}
      </dl>
      ${f.evidence?.snippet ? `<pre>${esc(f.evidence.snippet)}</pre>` : ''}
      ${f.suggestion ? `<p class="fix"><strong>Como corrigir:</strong> ${esc(f.suggestion)}${f.helpUrl ? ` <a href="${esc(f.helpUrl)}" target="_blank" rel="noopener">Referência</a>` : ''}</p>` : ''}
      ${f.evidence?.screenshot ? `<details><summary>Ver screenshot</summary><img loading="lazy" src="${esc(f.evidence.screenshot)}" alt="Screenshot de ${esc(f.page)}"></details>` : ''}
    </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório persona-qa</title>
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
<h1>Relatório persona-qa</h1>
<p class="muted">${esc(d.url ?? '')} · ${esc(fmtDate(d.createdAt))}${d.agentInfo ? ` · ${esc([d.agentInfo.tool, d.agentInfo.model].filter(Boolean).join(' · '))}` : ''} · ${d.pages.length} página(s)</p>
<h2>Notas por persona</h2>
<div style="overflow-x:auto"><table><thead><tr><th>Persona</th><th>Geral</th><th>Conteúdo</th><th>Navegação</th><th>Interface</th><th>Objetivos</th></tr></thead><tbody>${scoreRows}</tbody></table></div>
${goals ? `<h2>Objetivos</h2>${goals}` : ''}
<h2>Problemas (${d.findings.length})</h2>
<div class="filters"><button data-filter="all" aria-pressed="true">Todos</button>${filters}</div>
${items || '<p>Nenhum problema encontrado. 🎉</p>'}
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

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}
