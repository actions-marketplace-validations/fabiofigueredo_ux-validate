import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { latestRunDir, loadConfig } from './config.js';
import { t, getLocale, formatDate } from './i18n.js';
import { createRequire } from 'node:module';
import { loadTasks, tasksFor } from './tasks.js';

const VERSION = createRequire(import.meta.url)('../package.json').version;

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
export async function buildReport({ cwd, run, log = console.log }) {
  const runDir = run ? path.resolve(cwd, run) : latestRunDir(cwd);
  if (!runDir || !fs.existsSync(runDir)) throw new Error(t('report.noRun'));

  const checks = readJson(path.join(runDir, 'checks.json'));
  const agent = readJson(path.join(runDir, 'findings.json'));
  if (!checks && !agent) throw new Error(t('report.noData', { dir: runDir }));

  const data = analyze(checks, agent, { traits: personaTraits(cwd), tasks: projectTasks(cwd) });
  fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(data));
  fs.writeFileSync(path.join(runDir, 'report.html'), renderHtml(data));

  log(t('report.generated'));
  log(`  ${path.relative(cwd, path.join(runDir, 'report.md'))}`);
  log(`  ${path.relative(cwd, path.join(runDir, 'report.html'))}`);
  return { runDir, ...data };
}

/** Características das personas (traits), lidas dos arquivos do projeto: o findings.json não as repete. */
function personaTraits(cwd) {
  const traits = {};
  try {
    const dir = path.resolve(cwd, loadConfig(cwd, undefined, { optional: true }).personas);
    for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (!/\.ya?ml$/.test(file)) continue;
      const p = YAML.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (p?.id) traits[p.id] = p.traits ?? {};
    }
  } catch {
    // Sem configuração ou persona inválida: segue sem as características.
  }
  return traits;
}

const COLOR_BLIND = new Set(['color-blind', 'daltonismo']);

function projectTasks(cwd) {
  try {
    return loadTasks(cwd).tasks;
  } catch {
    return [];
  }
}

const OUTCOME_ICON = { success: '✅', partial: '⚠️', fail: '❌' };

/** Tabela de tarefas: cada tarefa do projeto × as personas a que ela se aplica, com o resultado de cada uma. */
function taskMatrix(tasks, personas) {
  const defs = [...tasks];
  // Tarefas que o agente registrou mas não estão no arquivo (ex.: arquivo mudou depois do teste).
  for (const p of personas) for (const r of p.tasks ?? []) if (r.id && !defs.some((d) => d.id === r.id)) defs.push({ id: r.id, task: r.task ?? r.id });
  return defs.map((task) => ({
    ...task,
    results: personas.map((p) => ({
      persona: p,
      applies: tasksFor([task], p.id).length > 0,
      result: (p.tasks ?? []).find((r) => r.id === task.id) ?? null,
    })),
  }));
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(t('report.invalidJson', { file: path.basename(file), message: err.message }));
  }
}

export function analyze(checks, agent, { traits = {}, tasks = [] } = {}) {
  const personas = agent?.personas ?? [];
  const checkFindings = (checks?.findings ?? []).map((f) => ({ ...f, origin: 'check' }));
  const agentFindings = (agent?.findings ?? []).map((f) => ({ ...f, origin: 'agent' }));

  // Um problema das checagens fixas que o agente já detalhou não aparece duas vezes.
  const covered = new Set(agentFindings.flatMap((f) => f.relatedChecks ?? []));
  const findings = [...agentFindings, ...checkFindings.filter((f) => !covered.has(f.id))];

  const ariaTrees = Object.fromEntries((checks?.pages ?? []).filter((p) => p.ariaTree).map((p) => [p.url, p.ariaTree]));
  for (const f of findings) {
    f.affects = affectedPersonas(f, personas, traits);
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
    tasks: taskMatrix(tasks, personas),
    taskWarnings: checks?.taskWarnings ?? [],
    traits,
    audit: checks?.mode === 'audit',
    skipped: checks?.skipped ?? [],
    limits: Array.isArray(agent?.limits) ? agent.limits.filter((x) => typeof x === 'string') : [],
    plan: auditPlan(findings, personas),
  };
}

/**
 * Plano para quem mantém um site publicado (auditoria): o que impede as personas de concluir
 * objetivos e tarefas, depois os problemas críticos e altos, e o resto agrupado por tipo de problema.
 */
function auditPlan(findings, personas) {
  const blockerIds = new Set(personas.flatMap((p) => [...(p.goals ?? []), ...(p.tasks ?? [])].flatMap((g) => g.blockers ?? [])));
  const blocking = findings.filter((f) => blockerIds.has(f.id));
  const urgent = findings.filter((f) => !blockerIds.has(f.id) && (f.severity === 'critical' || f.severity === 'high'));
  const groups = new Map();
  for (const f of findings.filter((f) => !blockerIds.has(f.id) && f.severity !== 'critical' && f.severity !== 'high')) {
    const g = groups.get(f.title) ?? { title: f.title, severity: f.severity, category: f.category, ids: [] };
    g.ids.push(f.id);
    groups.set(f.title, g);
  }
  return { blocking, urgent, others: [...groups.values()] };
}

/** Limites da auditoria: o que não foi visitado (robots.txt, links de sair/excluir) e o que o agente não pôde testar. */
function auditLimits(d) {
  const byReason = (reason) => d.skipped.filter((s) => s.reason === reason).map((s) => s.url);
  return [
    { label: t('report.audit.skippedRobots'), items: byReason('robots') },
    { label: t('report.audit.skippedUnsafe'), items: byReason('unsafe') },
    { label: t('report.audit.agentLimits'), items: d.limits },
  ].filter((x) => x.items.length);
}

function affectedPersonas(f, personas, traits) {
  if (f.personas?.length) return f.personas;
  // Checagem de visão de cores: só conta para as personas com daltonismo (quando conhecemos as características).
  if (f.audience === 'color-blind' && Object.keys(traits).length) {
    return personas.filter((p) => COLOR_BLIND.has(String(traits[p.id]?.vision ?? ''))).map((p) => p.id);
  }
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
  // Objetivos da persona e tarefas do projeto contam juntos.
  const goals = [...(persona?.goals ?? []), ...(persona?.tasks ?? [])].filter((g) => g.outcome);
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
  lines.push(`# ${t(d.audit ? 'report.audit.title' : 'report.title')}`, '');
  lines.push(`**${t(d.audit ? 'report.audit.site' : 'report.app')}:** ${d.url ?? '—'}  `);
  lines.push(`**${t('report.date')}:** ${formatDate(d.createdAt)}  `);
  if (d.agentInfo) lines.push(`**${t('report.evaluatedBy')}:** ${[d.agentInfo.tool, d.agentInfo.model].filter(Boolean).join(' · ')}  `);
  lines.push(`**${t('report.pagesAnalyzed')}:** ${d.pages.length || '—'}`, '');
  if (!d.personas.length) lines.push(`> ${t(d.audit ? 'report.audit.onlyChecks' : 'report.onlyChecks')}`, '');
  if (d.audit) {
    lines.push(`## ${t('report.audit.limitsTitle')}`, '', t('report.audit.limitsIntro'), '');
    for (const { label, items } of auditLimits(d)) {
      lines.push(`**${label}** (${items.length})`, '');
      for (const item of items.slice(0, 20)) lines.push(`- ${item}`);
      if (items.length > 20) lines.push(`- ${t('report.audit.andMore', { n: items.length - 20 })}`);
      lines.push('');
    }
  }

  lines.push(`## ${t('report.scoresTitle')}`, '');
  lines.push(`| ${t('report.persona')} | ${t('report.overall')} | ${categoryEntries().map(([, v]) => v).join(' | ')} | ${t('report.goalsDone')} |`);
  lines.push(`|---|---:|${CATEGORY_KEYS.map(() => '---:').join('|')}|---:|`);
  for (const s of d.scores) {
    lines.push(
      `| ${s.persona.name} | **${s.overall}** | ${CATEGORY_KEYS.map((c) => s[c]).join(' | ')} | ${s.goalRate ?? '—'}${s.goalRate != null ? '%' : ''} |`,
    );
  }
  lines.push('');

  if (d.tasks.length && d.personas.length) {
    lines.push(`## ${t('report.tasksTitle')}`, '', `_${t('report.tasksIntro')}_`, '');
    lines.push(`| ${t('report.task')} | ${d.personas.map((p) => p.name).join(' | ')} |`, `|---|${d.personas.map(() => ':---:').join('|')}|`);
    for (const task of d.tasks) {
      const cells = task.results.map((r) => (!r.applies ? '—' : r.result ? `${OUTCOME_ICON[r.result.outcome] ?? '?'} ${r.result.steps ?? '?'}` : t('report.notTested')));
      lines.push(`| ${task.task.replace(/\|/g, '\\|')} | ${cells.join(' | ')} |`);
    }
    lines.push('', `${t('report.tasksLegend')}`, '');
    for (const task of d.tasks) {
      lines.push(`### ${task.task}`, '');
      if (task.success) lines.push(`**${t('report.successCriterion')}:** ${task.success}  `);
      for (const { persona, result } of task.results.filter((r) => r.result)) {
        const fc = result.firstClick;
        const extra = [
          fc?.label ? `${t('report.firstClick')}: "${fc.label}"${fc.onPath === false ? ` (${t('report.offPath')})` : fc.onPath ? ` (${t('report.onPath')})` : ''}` : null,
          result.backtracks ? `${t('report.backtracks')}: ${result.backtracks}` : null,
        ].filter(Boolean).join(' · ');
        lines.push(`- **${persona.name}** — ${OUTCOME_LABEL[result.outcome] ?? result.outcome} (${result.steps ?? '?'} ${t('report.steps')})${extra ? ` · ${extra}` : ''}`);
        if (result.notes) lines.push(`  - ${result.notes}`);
        if (result.lostAt?.screenshot) lines.push(`  - ${t('report.lostAt')}: [${result.lostAt.page ?? result.lostAt.screenshot}](${result.lostAt.screenshot})`);
      }
      lines.push('');
    }
    for (const w of d.taskWarnings) lines.push(`> ${t('tasks.leading', { id: w.id, labels: w.labels.map((l) => `"${l}"`).join(', ') })}`, '');
  }

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

  const cvPages = d.pages.filter((p) => p.colorVision);
  if (cvPages.length) {
    lines.push(`## ${t('report.colorVision')}`, '', t('report.colorVisionIntro'), '');
    for (const p of cvPages) {
      const links = Object.entries(p.colorVision).map(([type, file]) => `[${t(`colorVision.shortTypes.${type}`)}](${file})`);
      lines.push(`- ${p.url}: ${links.join(' · ')}`);
    }
    lines.push('');
  }

  const item = (f) => `**[${f.id}] ${f.title}** — ${SEVERITY_LABEL[f.severity]}, ${CATEGORIES[f.category]}${f.page ? ` · ${f.page}` : ''}`;
  if (d.audit) {
    lines.push(`## ${t('report.audit.planTitle')}`, '', t('report.audit.planIntro'), '');
    const sections = [
      [t('report.audit.planBlocking'), d.plan.blocking.map(item)],
      [t('report.audit.planUrgent'), d.plan.urgent.map(item)],
      [t('report.audit.planOthers'), d.plan.others.map((g) => `**${g.title}** — ${SEVERITY_LABEL[g.severity]}, ${CATEGORIES[g.category]} (${g.ids.join(', ')})`)],
    ];
    sections.forEach(([title, list], i) => {
      lines.push(`### ${i + 1}. ${title}`, '');
      if (!list.length) lines.push(t('report.audit.planNone'));
      list.forEach((x) => lines.push(`- ${x}`));
      lines.push('');
    });
  } else {
    const top = d.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    lines.push(`## ${t('report.fixFirst')}`, '');
    if (!top.length) lines.push(t('report.noTop'), '');
    top.slice(0, 10).forEach((f, i) => lines.push(`${i + 1}. **[${f.id}] ${f.title}** — ${SEVERITY_LABEL[f.severity]}, ${CATEGORIES[f.category]}`));
    lines.push('');

    if (d.findings.length) {
      lines.push(`> ${t('report.applyFixes')}`, '');
    }
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
  const H = (key, params) => t(`report.html.${key}`, params);
  // Rótulo manuscrito + título de seção, como no site do ux-validate.
  const head = (hand, title, id, intro = '') =>
    `<div class="section-head"><div><span class="hand">${esc(hand)}</span><h2 id="${id}">${title}</h2></div>${intro ? `<p class="muted">${esc(intro)}</p>` : ''}</div>`;
  const TINTS = ['l', 'p', 'y', 'w'];
  const ring = (n, size = 96) => {
    const r = size * 0.4167;
    const c = 2 * Math.PI * r;
    const v = Math.max(0, Math.min(100, Number(n) || 0));
    return `<div class="ring" role="img" aria-label="${esc(H('scoreAria', { n: v }))}"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(17,17,17,.12)" stroke-width="10"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" stroke-dasharray="${((v / 100) * c).toFixed(1)} ${c.toFixed(1)}"/></svg><b>${v}</b></div>`;
  };
  const sev = (s) => `<span class="sev ${esc(s)}">${esc(SEVERITY_LABEL[s] ?? s)}</span>`;
  const out = (result) => `<span class="out ${esc(result.outcome)}">${esc(OUTCOME_LABEL[result.outcome] ?? result.outcome)} · ${result.steps ?? '?'}</span>`;
  const shortUrl = (u) => {
    try {
      const x = new URL(u);
      const base = new URL(d.url);
      return x.origin === base.origin ? `${x.pathname}${x.search}${x.hash}` : u;
    } catch {
      return u;
    }
  };

  // Nome do site: o título da página inicial, ou o endereço.
  let host = d.url ?? '';
  try {
    host = new URL(d.url).host || host;
  } catch {
    // mantém a URL
  }
  const siteName = d.pages.find((p) => p.ok && p.title)?.title || host || t('report.title');

  // Números principais.
  const tested = d.tasks.flatMap((task) => task.results.filter((r) => r.applies && r.result));
  const goalsAll = d.personas.flatMap((p) => p.goals ?? []);
  const count = (s) => d.findings.filter((f) => f.severity === s).length;
  const avg = d.scores.length ? Math.round(d.scores.reduce((s, x) => s + x.overall, 0) / d.scores.length) : 0;
  const kpis = [
    ['l', avg, H('kpiScore')],
    ...(tested.length ? [['p', H('kpiOf', { n: tested.filter((r) => r.result.outcome === 'success').length, total: tested.length }), H('kpiTasks')]] : []),
    ...(goalsAll.length ? [['y', goalsAll.filter((g) => g.outcome === 'fail').length, H('kpiGoalsFailed')]] : [['y', d.pages.length, H('kpiPages')]]),
    ['w', d.findings.length, H('kpiIssues', { critical: count('critical'), high: count('high') })],
  ];

  // Notas por persona.
  const who = (p) => {
    const tr = d.traits?.[p.id] ?? {};
    return [
      p.viewport ? H(`device.${p.viewport}`) : null,
      tr.vision && !['normal'].includes(String(tr.vision)) ? `${H('vision')}: ${tr.vision}` : null,
      tr.tech_literacy ? `${H('tech')}: ${tr.tech_literacy}` : null,
    ].filter(Boolean).join(' · ');
  };
  const scoreCards = d.scores
    .map((s, i) => {
      const line = s.persona.id === '*' ? '' : who(s.persona);
      return `<article class="card persona ${TINTS[i % TINTS.length]}">${ring(s.overall)}<div><h3>${esc(s.persona.name)}</h3>${line ? `<p class="who">${esc(line)}</p>` : ''}
<ul class="bars">${CATEGORY_KEYS.map((c) => `<li><span>${esc(CATEGORIES[c])}</span><span class="bar" aria-hidden="true"><i style="width:${s[c]}%"></i></span><b>${s[c]}</b></li>`).join('')}</ul>
${s.goalRate != null ? `<p class="goal-rate">${esc(H('goalRate', { n: s.goalRate }))}</p>` : ''}</div></article>`;
    })
    .join('');

  // Tarefas: tabela tarefa × persona e onde cada persona se perdeu.
  const tasksHtml =
    d.tasks.length && d.personas.length
      ? `<section aria-labelledby="t-tasks">${head(H('hand.tasks'), t('report.tasksTitle'), 't-tasks', t('report.tasksIntro'))}
<div class="table-wrap"><table class="tasks"><thead><tr><th scope="col" class="left">${t('report.task')}</th>${d.personas.map((p) => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${d.tasks
          .map(
            (task) =>
              `<tr><th scope="row">${esc(task.task)}</th>${task.results
                .map((r) => (!r.applies ? '<td class="muted">—</td>' : r.result ? `<td>${out(r.result)}</td>` : `<td class="muted">${esc(t('report.notTested'))}</td>`))
                .join('')}</tr>`,
          )
          .join('')}</tbody></table></div>
<p class="legend">${esc(t('report.tasksLegend'))}</p>
${d.taskWarnings.map((w) => `<p class="apply">${esc(t('tasks.leading', { id: w.id, labels: w.labels.map((l) => `"${l}"`).join(', ') }))}</p>`).join('')}
<div class="lost">${d.tasks
          .flatMap((task) =>
            task.results
              .filter((r) => r.result && r.result.outcome !== 'success')
              .map(({ persona, result }) => {
                const fc = result.firstClick;
                const meta = [
                  fc?.label ? `${t('report.firstClick')}: “${fc.label}”${fc.onPath === false ? ` (${t('report.offPath')})` : fc.onPath ? ` (${t('report.onPath')})` : ''}` : null,
                  result.backtracks ? `${t('report.backtracks')}: ${result.backtracks}` : null,
                ].filter(Boolean).join(' · ');
                return `<div class="card"><h3>${esc(task.task)}</h3><p>${out(result)} <strong>${esc(persona.name)}</strong></p>${meta ? `<p class="first">${esc(meta)}</p>` : ''}${task.success ? `<p class="first">${t('report.successCriterion')}: ${esc(task.success)}</p>` : ''}${result.notes ? `<p>${esc(result.notes)}</p>` : ''}${result.lostAt?.screenshot ? `<details><summary>${t('report.lostAt')}</summary><img loading="lazy" src="${url(result.lostAt.screenshot)}" alt="${esc(t('report.lostAt'))}: ${esc(persona.name)}"></details>` : ''}</div>`;
              }),
          )
          .join('')}</div></section>`
      : '';

  // Objetivos de cada persona.
  const goals = d.personas.length
    ? `<section aria-labelledby="t-goals">${head(H('hand.goals'), t('report.goals'), 't-goals')}<div class="goals-grid">${d.personas
        .map(
          (p, i) => `<article class="card goals-card ${TINTS[i % TINTS.length]}"><h3>${esc(p.name)}${p.viewport ? ` <span class="tag">${esc(H(`device.${p.viewport}`))}</span>` : ''}</h3>
${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
<ul class="goals">${(p.goals ?? [])
            .map(
              (g) => `<li><span class="out ${esc(g.outcome)}">${esc(OUTCOME_LABEL[g.outcome] ?? g.outcome)}</span> <span>${esc(g.goal)} <small class="muted">· ${g.steps ?? '?'} ${t('report.steps')}</small>${g.notes ? `<small class="muted note">${esc(g.notes)}</small>` : ''}</span></li>`,
            )
            .join('')}</ul></article>`,
        )
        .join('')}</div></section>`
    : '';

  // Corrigir primeiro (projeto) ou o plano para quem mantém o site (auditoria).
  const planItem = (f) =>
    `<li><span><a href="#f-${esc(f.id)}">${esc(f.title)}</a><small>${esc([CATEGORIES[f.category], f.affects.map((id) => personaName(d, id)).join(', '), f.sourceHint?.file ? `${f.sourceHint.file}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}` : f.page ? shortUrl(f.page) : null].filter(Boolean).join(' · '))}</small></span>${sev(f.severity)}</li>`;
  const top = d.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 10);
  const firstHtml = d.audit
    ? `<section aria-labelledby="t-first"><div class="band"><span class="hand">${esc(H('hand.plan'))}</span><h2 id="t-first">${t('report.audit.planTitle')}</h2><p class="note">${esc(t('report.audit.planIntro'))}</p>
<h3>1. ${esc(t('report.audit.planBlocking'))}</h3>${d.plan.blocking.length ? `<ol>${d.plan.blocking.map(planItem).join('')}</ol>` : `<p class="note">${esc(t('report.audit.planNone'))}</p>`}
<h3>2. ${esc(t('report.audit.planUrgent'))}</h3>${d.plan.urgent.length ? `<ol>${d.plan.urgent.map(planItem).join('')}</ol>` : `<p class="note">${esc(t('report.audit.planNone'))}</p>`}
<h3>3. ${esc(t('report.audit.planOthers'))}</h3>${d.plan.others.length ? `<ol>${d.plan.others.map((g) => `<li><span>${esc(g.title)}<small>${esc(CATEGORIES[g.category])} · ${g.ids.map((id) => `<a href="#f-${esc(id)}">${esc(id)}</a>`).join(', ')}</small></span>${sev(g.severity)}</li>`).join('')}</ol>` : `<p class="note">${esc(t('report.audit.planNone'))}</p>`}
</div></section>`
    : `<section aria-labelledby="t-first"><div class="band"><span class="hand">${esc(H('hand.first'))}</span><h2 id="t-first">${t('report.fixFirst')}</h2>${top.length ? `<ol>${top.map(planItem).join('')}</ol>` : `<p class="note">${esc(t('report.noTop'))}</p>`}</div></section>`;

  // Limites da auditoria.
  const limits = d.audit ? auditLimits(d) : [];
  const limitsHtml = d.audit
    ? `<section aria-labelledby="t-limits">${head(H('hand.limits'), t('report.audit.limitsTitle'), 't-limits', t('report.audit.limitsIntro'))}${
        limits.length
          ? `<div class="limits">${limits.map(({ label, items }) => `<div class="card"><h3>${esc(label)} <span class="tag">${items.length}</span></h3><ul>${items.slice(0, 20).map((x) => `<li>${esc(shortUrl(x))}</li>`).join('')}${items.length > 20 ? `<li class="muted">${esc(t('report.audit.andMore', { n: items.length - 20 }))}</li>` : ''}</ul></div>`).join('')}</div>`
          : ''
      }</section>`
    : '';

  // Como cada página aparece para cada tipo de daltonismo (capturas simuladas pelo Chromium).
  const cvPages = d.pages.filter((p) => p.colorVision);
  const colorVision = cvPages.length
    ? `<section aria-labelledby="t-cv">${head(H('hand.cv'), t('report.colorVision'), 't-cv', t('report.colorVisionIntro'))}${cvPages
        .map((p) => {
          const issues = d.findings.filter((f) => f.audience === 'color-blind' && f.page === p.url).length;
          const figures = Object.entries(p.colorVision)
            .map(([type, file]) => {
              const label = esc(t(`colorVision.shortTypes.${type}`));
              return `<figure><figcaption>${label}</figcaption><a href="${url(file)}"><img loading="lazy" src="${url(file)}" alt="${esc(t('report.colorVisionAlt', { page: p.url, type: t(`colorVision.shortTypes.${type}`) }))}"></a></figure>`;
            })
            .join('');
          return `<div class="card cv-page"><h3>${esc(shortUrl(p.url))} <span class="tag">${esc(t('report.colorVisionIssues', { n: issues }))}</span></h3><div class="cv">${figures}</div></div>`;
        })
        .join('')}</section>`
    : '';

  const filters = categoryEntries()
    .map(([k, v]) => `<button type="button" data-filter="${k}" aria-pressed="false">${v} (${d.findings.filter((f) => f.category === k).length})</button>`)
    .join('');

  const items = d.findings
    .map(
      (f) => `<article class="card finding" id="f-${esc(f.id)}" data-category="${esc(f.category)}">
      <header>${sev(f.severity)}<span class="tag">${esc(CATEGORIES[f.category])}</span><span class="tag">${f.origin === 'agent' ? t('report.tagPersona') : esc(t('report.tagCheck', { name: f.source?.replace('check:', '') }))}</span><span class="id">${esc(f.id)}</span>
        <h3>${esc(f.title)}</h3></header>
      ${f.description ? `<p>${esc(f.description)}</p>` : ''}
      <dl>
        ${f.page ? `<dt>${t('report.page')}</dt><dd><a href="${url(f.page)}">${esc(shortUrl(f.page))}</a></dd>` : ''}
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

  const logo = `<span class="logo"><span class="dots" aria-hidden="true"><i style="background:#f7d046"></i><i style="background:#8cc4f4"></i><i style="background:#c79bf5"></i></span>ux-validate</span>`;
  const personasSvg = `<svg viewBox="0 0 36 36" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="13" cy="12" r="5.5"/><path d="M3 30c1-6 5-9.5 10-9.5s9 3.5 10 9.5"/><circle cx="25" cy="13" r="4"/><path d="M24 20.5c4.5 0 8 3 9 8"/></svg>`;
  const title = t(d.audit ? 'report.audit.title' : 'report.title');

  return `<!doctype html>
<html lang="${getLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${title} · ${siteName}`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,500;9..40,700;9..40,800&display=swap">
<style>${REPORT_CSS}</style></head><body>
<header class="top"><div class="wrap"><div class="top-bar">${logo}<span class="tag">${esc(H(d.audit ? 'badgeAudit' : 'badge', { version: VERSION }))}</span></div></div></header>
<main class="wrap">
<div class="hero">
  <span class="hand">${esc(H(d.audit ? 'hand.audit' : 'hand.report'))}</span>
  <h1>${esc(siteName)}</h1>
  <div class="meta"><span><a href="${url(d.url)}">${esc(d.url ?? '')}</a></span><span>${esc(formatDate(d.createdAt))}</span>${d.agentInfo ? `<span>${esc(H('evaluatedBy', { by: [d.agentInfo.tool, d.agentInfo.model].filter(Boolean).join(' · ') }))}</span>` : ''}<span>${t('report.pagesCount', { n: d.pages.length })}</span></div>
  ${
    d.personas.length
      ? `<div class="strip"><div class="pill">${personasSvg}${esc(H('simulated', { n: d.personas.length }))}</div><p>${esc(H('simulatedText'))}</p></div>`
      : `<div class="strip warn"><div class="pill">${personasSvg}${esc(H('onlyChecksPill'))}</div><p>${esc(t(d.audit ? 'report.audit.onlyChecks' : 'report.onlyChecks'))}</p></div>`
  }
  <div class="kpis">${kpis.map(([tint, value, label]) => `<div class="kpi ${tint}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('')}</div>
</div>
${limitsHtml}
<section aria-labelledby="t-scores">${head(H('hand.scores'), t('report.scoresTitle'), 't-scores', H('scoresIntro'))}<div class="personas">${scoreCards}</div></section>
${tasksHtml}
${firstHtml}
${goals}
${colorVision}
<section aria-labelledby="t-issues">${head(H('hand.issues'), `${t('report.issues')} (${d.findings.length})`, 't-issues')}
<div class="filters" role="group" aria-label="${esc(H('filterLabel'))}"><button type="button" data-filter="all" aria-pressed="true">${t('report.all')} (${d.findings.length})</button>${filters}</div>
${d.findings.length && !d.audit ? `<p class="apply">${t('report.applyFixesHtml')}</p>` : ''}
${items || `<p class="card">${t('report.noIssuesHtml')}</p>`}
</section>
</main>
<footer><div class="wrap"><div>${logo}<span>${esc(H('footer', { version: VERSION }))}</span></div></div></footer>
<script>
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  document.querySelectorAll('.finding').forEach(f=>f.hidden=b.dataset.filter!=='all'&&f.dataset.category!==b.dataset.filter);
}));
</script></body></html>`;
}

// Identidade do site do ux-validate: papel pontilhado, tinta preta, marca-texto lima, lilás e amarelo.
// Claro de propósito, como papel impresso. As fontes vêm do Google Fonts; sem internet, caem nas do sistema.
const REPORT_CSS = `
:root{color-scheme:light;--paper:#fbfbf7;--dot:#e1e1d8;--white:#fff;--ink:#111;--ink-2:#4a4a46;--line:#d9d9d1;--lime:#c6ef5a;--lime-soft:#eef8cf;--lilac:#dcc2fb;--lilac-soft:#f2e8fe;--lilac-deep:#7a3fc9;--yellow:#fde68a;--yellow-soft:#fdf3c8;--red:#b42318;--red-soft:#fde4e1;
--hand:"Caveat","Segoe Print","Bradley Hand",cursive;--head:"DM Sans","Segoe UI",system-ui,sans-serif;--mono:"DM Mono",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);background-color:var(--paper);background-image:radial-gradient(var(--dot) 1.1px,transparent 1.3px);background-size:20px 20px;font:400 14.5px/1.6 var(--mono);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration-color:var(--lilac-deep);text-underline-offset:3px}
h1,h2,h3,p{margin:0}
:focus-visible{outline:3px solid var(--lilac-deep);outline-offset:3px;border-radius:6px}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.muted{color:var(--ink-2)}
code{font-family:var(--mono);font-size:.95em}
img{max-width:100%;height:auto;border:1.5px solid var(--ink);border-radius:10px;display:block;margin-top:8px}
.hand{font:700 24px/1 var(--hand);display:inline-block;position:relative;padding-bottom:5px;isolation:isolate}
.hand::after{content:"";position:absolute;left:-2px;right:-4px;bottom:0;height:7px;border-radius:6px;background:var(--lime);z-index:-1;transform:rotate(-1deg)}
h2{font:800 clamp(22px,3vw,27px)/1.15 var(--head);letter-spacing:-.015em;margin-top:8px}
section{margin-top:44px}
.section-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:8px 20px;margin-bottom:16px}
.section-head p{max-width:60ch;font-size:13.5px}
.card{background:var(--white);border:2px solid var(--ink);border-radius:14px;padding:18px 20px}
.card h3{font:700 15.5px/1.3 var(--head)}
.tag{display:inline-flex;align-items:center;gap:6px;font:500 12px/1.2 var(--mono);border:1.5px solid var(--ink);border-radius:999px;padding:4px 10px;background:var(--white);vertical-align:middle}
.top{padding-top:14px}
.top-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;background:var(--white);border:2px solid var(--ink);border-radius:14px;padding:10px 14px 10px 18px}
.logo{display:inline-flex;align-items:center;gap:12px;font:700 16px/1 var(--head)}
.dots{display:inline-flex;gap:5px}.dots i{width:10px;height:10px;border-radius:50%;display:block}
.top-bar .tag{margin-left:auto}
.hero{padding-top:34px;display:grid;gap:14px;justify-items:start}
.hero>.strip,.hero>.kpis{justify-self:stretch}
h1{font:800 clamp(30px,5vw,44px)/1.08 var(--head);letter-spacing:-.02em;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--ink-2)}
.meta a{color:var(--ink);overflow-wrap:anywhere}
.strip{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;background:var(--white);border:2px solid var(--ink);border-radius:16px;padding:10px 18px 10px 10px;margin-top:8px}
.pill{display:flex;align-items:center;gap:12px;background:var(--lilac);border-radius:11px;padding:10px 22px 10px 16px;font:700 22px/1.05 var(--hand)}
.strip.warn .pill{background:var(--yellow)}
.pill svg{width:30px;height:30px;flex:none}
.strip p{font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:22px}
.kpi{background:var(--white);border:2px solid var(--ink);border-radius:14px;padding:14px 16px;display:grid;gap:4px;box-shadow:0 3px 0 var(--ink)}
.kpi b{font:800 30px/1 var(--head)}.kpi span{font-size:12.5px;color:var(--ink-2)}
.l{background:var(--lime-soft)}.p{background:var(--lilac-soft)}.y{background:var(--yellow-soft)}.w{background:var(--white)}
.personas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.persona{display:grid;grid-template-columns:96px 1fr;gap:18px;align-items:center}
.ring{position:relative;width:96px;height:96px}
.ring svg{width:96px;height:96px;transform:rotate(-90deg)}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font:800 28px/1 var(--head)}
.persona h3{font:800 18px/1.2 var(--head)}
.persona .who{font-size:12.5px;color:var(--ink-2);margin-top:2px}
.bars{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px;font-size:12.5px}
.bars li{display:grid;grid-template-columns:104px 1fr 30px;gap:8px;align-items:center}
.bar{height:8px;border-radius:99px;background:rgba(17,17,17,.1);overflow:hidden}
.bar i{display:block;height:100%;border-radius:99px;background:var(--ink)}
.bars b{text-align:right;font-weight:500}
.goal-rate{margin-top:10px;font:500 13px/1.3 var(--head)}
.table-wrap{overflow-x:auto;background:var(--white);border:2px solid var(--ink);border-radius:14px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:12px 14px;border-bottom:1.5px solid var(--line);text-align:center;vertical-align:middle}
thead th{font:700 13px/1.2 var(--head);background:var(--paper)}
thead th.left{text-align:left}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
th[scope=row]{text-align:left;font-weight:400;min-width:240px}
.out{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font:500 12.5px/1.3 var(--mono);white-space:nowrap;border:1.5px solid var(--ink);background:var(--white)}
.out.success{background:var(--lime)}.out.partial{background:var(--yellow)}.out.fail{background:var(--red-soft);border-color:var(--red);color:var(--red)}
.legend{margin-top:10px;font-size:12.5px;color:var(--ink-2)}
.legend+.apply{margin-top:12px}
.lost{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
.lost:empty{display:none}
.lost .card{display:grid;gap:8px;align-content:start}
.lost p{font-size:13px}.lost .first{font-size:12.5px;color:var(--ink-2)}
.goals-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.goals-card{display:grid;gap:10px;align-content:start}
.goals-card p{font-size:13px}
.goals{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:13px}
.goals li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}
.goals small{font-size:12px}.goals .note{display:block;margin-top:2px}
.band{background:var(--lilac-soft);border-radius:20px;padding:24px 26px}
.band h3{font:700 15px/1.3 var(--head);margin-top:18px}
.band ol{margin:12px 0 0;padding:0;list-style:none;counter-reset:n;display:grid;gap:10px}
.band li{counter-increment:n;display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:center;background:var(--white);border:1.5px solid var(--ink);border-radius:12px;padding:10px 14px 10px 10px}
.band li::before{content:counter(n);display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--ink);color:var(--white);font:700 14px/1 var(--head)}
.band li>span:first-child>a,.band li>span:first-child{font:700 14.5px/1.3 var(--head)}
.band li a{text-decoration:none}.band li a:hover{text-decoration:underline}
.band li small{display:block;font:400 12px/1.5 var(--mono);color:var(--ink-2);margin-top:2px;overflow-wrap:anywhere}
.band small a{text-decoration:underline}
.band .note{margin-top:12px;font-size:13px}
.limits{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.limits ul{margin:10px 0 0;padding-left:18px;font-size:13px;overflow-wrap:anywhere}
.sev{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font:700 12px/1.3 var(--head);border:1.5px solid var(--ink);white-space:nowrap}
.sev::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.sev.critical{background:var(--red);border-color:var(--red);color:var(--white)}
.sev.high{background:var(--red-soft);border-color:var(--red);color:var(--red)}
.sev.medium{background:var(--yellow)}
.sev.low{background:var(--white);color:var(--ink-2);border-color:var(--line)}
.cv-page+.cv-page{margin-top:14px}
.cv{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px}
.cv figure{margin:0}.cv figcaption{font-size:12.5px;color:var(--ink-2)}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.filters button{font:700 13px/1 var(--head);padding:9px 14px;border-radius:10px;border:1.5px solid var(--ink);background:var(--white);color:var(--ink);cursor:pointer}
.filters button[aria-pressed=true]{background:var(--ink);color:var(--white)}
.finding{margin-bottom:14px;display:grid;gap:10px}
.finding[hidden]{display:none}
.finding header{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.finding h3{flex-basis:100%;font:800 17px/1.3 var(--head);margin-top:4px}
.finding .id{font:500 12px/1 var(--mono);color:var(--ink-2)}
.finding p{font-size:13.5px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0;font-size:13px}
dl:empty{display:none}
dt{color:var(--ink-2)}dd{margin:0;overflow-wrap:anywhere}
pre{margin:0;background:var(--ink);color:#f0f0ea;border-radius:10px;padding:12px 14px;font:400 12.5px/1.6 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}
.fix{background:var(--lime-soft);border:1.5px solid var(--ink);border-radius:10px;padding:10px 14px}
.fix strong{font-family:var(--head)}
details summary{cursor:pointer;font:700 13px/1.4 var(--head)}
details img{max-width:520px;width:100%}
.apply{background:var(--yellow-soft);border:1.5px solid var(--ink);border-radius:12px;padding:12px 16px;font-size:13.5px;margin:0 0 16px}
.apply code{background:var(--white);border:1px solid var(--line);border-radius:6px;padding:1px 6px}
footer{margin:50px 0 34px}
footer .wrap>div{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;border-top:1.5px solid var(--line);padding-top:16px;font-size:12px;color:var(--ink-2)}
footer .logo{font-size:14px;color:var(--ink)}
@media (max-width:760px){.personas,.lost,.goals-grid{grid-template-columns:1fr}}
@media (max-width:640px){.strip{grid-template-columns:1fr;gap:10px;padding:10px}.strip p{padding:0 6px 4px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.band{padding:18px 14px}.band li{grid-template-columns:30px 1fr}.band li .sev{grid-column:2;justify-self:start}}
@media (max-width:420px){.persona{grid-template-columns:1fr}.bars li{grid-template-columns:96px 1fr 30px}}
@media print{body{background:#fff}.filters{display:none}.card,.kpi,.band li{break-inside:avoid;box-shadow:none}.finding[hidden]{display:grid}}
`;

function personaName(d, id) {
  return d.personas.find((p) => p.id === id)?.name ?? id;
}
