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
  // O relatório em HTML é um pequeno site: report.html (visão geral) e uma página por área.
  const site = reportOptions(cwd);
  writeSite(runDir, data, { client: site.client, logo: prepareLogo(cwd, runDir, site.logo, log) });

  log(t('report.generated'));
  log(`  ${path.relative(cwd, path.join(runDir, 'report.md'))}`);
  log(`  ${path.relative(cwd, path.join(runDir, 'report.html'))}`);
  return { runDir, ...data };
}

/** Cliente e logo do relatório (`report.client` e `report.logo` na configuração). */
function reportOptions(cwd) {
  try {
    const report = loadConfig(cwd, undefined, { optional: true }).report ?? {};
    return { client: report.client ? String(report.client) : null, logo: report.logo ? String(report.logo) : null };
  } catch {
    return { client: null, logo: null };
  }
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

/* ---------- HTML: o relatório como um pequeno site, uma página por área ---------- */

const REPORT_CSS_FILE = new URL('./report.css', import.meta.url);
const PAGE_FILE = /^report(-[a-z-]+)?\.html$/;
const LOGO_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);

/**
 * Logo do cliente (`report.logo` na configuração): um arquivo local é copiado para a pasta da execução
 * (o relatório continua completo quando a pasta é enviada ao cliente); uma URL http(s) é usada como está.
 */
function prepareLogo(cwd, runDir, logo, log) {
  for (const f of fs.readdirSync(runDir)) if (/^report-logo\./.test(f)) fs.rmSync(path.join(runDir, f));
  if (!logo) return null;
  const value = String(logo).trim();
  if (/^https?:\/\//i.test(value)) return value;
  const file = path.resolve(cwd, value);
  const ext = path.extname(file).toLowerCase();
  if (!fs.existsSync(file) || !LOGO_EXTS.has(ext)) {
    log(t('report.site.logoNotFound', { logo: value }));
    return null;
  }
  const name = `report-logo${ext}`;
  fs.copyFileSync(file, path.join(runDir, name));
  return name;
}

/** Grava report.html (visão geral), as páginas de cada área e o report.css. Devolve os arquivos. */
function writeSite(runDir, d, { client, logo }) {
  for (const f of fs.readdirSync(runDir)) if (PAGE_FILE.test(f)) fs.rmSync(path.join(runDir, f));
  fs.copyFileSync(REPORT_CSS_FILE, path.join(runDir, 'report.css'));
  const pages = renderSite(d, { client, logo });
  for (const [file, html] of Object.entries(pages)) fs.writeFileSync(path.join(runDir, file), html);
  return Object.keys(pages);
}

export function renderSite(d, { client = null, logo = null } = {}) {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // URLs vêm das páginas testadas e do findings.json do agente: só http(s), file e caminhos relativos
  // viram link (bloqueia javascript:, data: etc. no relatório aberto no navegador).
  const url = (u) => {
    const s = String(u ?? '').trim();
    return /^(https?:|file:)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s) ? esc(s) : '#';
  };
  const H = (key, params) => t(`report.html.${key}`, params);
  const S = (key, params) => t(`report.site.${key}`, params);
  const TINTS = ['l', 'p', 'y', 'w'];
  const hand = (text) => `<span class="hand">${esc(text)}</span>`;
  const sectionHead = (handText, title, id, link = '') =>
    `<div class="section-head"><div>${hand(handText)}<h2 id="${id}">${title}</h2></div>${link}</div>`;
  const pageHead = (handText, title, intro = '') =>
    `<div class="page-head">${hand(handText)}<h1>${title}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}</div>`;
  const ring = (n, cls = '') => {
    const r = 40;
    const c = 2 * Math.PI * r;
    const v = Math.max(0, Math.min(100, Number(n) || 0));
    return `<div class="ring ${cls}" role="img" aria-label="${esc(H('scoreAria', { n: v }))}"><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(17,17,17,.12)" stroke-width="10"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" stroke-dasharray="${((v / 100) * c).toFixed(1)} ${c.toFixed(1)}"/></svg><b>${v}</b></div>`;
  };
  const sev = (s) => `<span class="sev ${esc(s)}">${esc(SEVERITY_LABEL[s] ?? s)}</span>`;
  const out = (outcome, steps) => `<span class="out ${esc(outcome)}">${esc(OUTCOME_LABEL[outcome] ?? outcome)}${steps != null ? ` · ${steps}` : ''}</span>`;
  const shortUrl = (u) => {
    try {
      const x = new URL(u);
      const base = new URL(d.url);
      return x.origin === base.origin ? `${x.pathname}${x.search}${x.hash}` : u;
    } catch {
      return u;
    }
  };
  const issueLink = (id) => `report-issues.html#f-${esc(id)}`;

  let host = d.url ?? '';
  try {
    host = new URL(d.url).host || host;
  } catch {
    // mantém a URL
  }
  const siteName = d.pages.find((p) => p.ok && p.title)?.title || host || t('report.title');

  // Páginas do site (só as que têm conteúdo).
  const cvPages = d.pages.filter((p) => p.colorVision);
  const hasTasks = d.tasks.length > 0 && d.personas.length > 0;
  const PAGES = [
    { file: 'report.html', label: S('nav.overview') },
    { file: 'report-personas.html', label: S('nav.personas'), n: d.personas.length || null },
    ...(hasTasks ? [{ file: 'report-tasks.html', label: S('nav.tasks'), n: d.tasks.length }] : []),
    { file: 'report-issues.html', label: S('nav.issues'), n: d.findings.length },
    ...(cvPages.length ? [{ file: 'report-color-vision.html', label: S('nav.colorVision') }] : []),
    ...(d.audit ? [{ file: 'report-scope.html', label: S('nav.scope') }] : []),
  ];

  const kind = H(d.audit ? 'hand.audit' : 'hand.report');
  const brand = logo
    ? `<img src="${url(logo)}" alt="${esc(client || siteName)}" height="34">`
    : `<span class="name">${esc(client || siteName)}</span>`;
  const evaluated = [d.agentInfo?.tool, d.agentInfo?.model].filter(Boolean).join(' · ');
  const footerLine = [evaluated ? S('evaluatedBy', { by: evaluated }) : null, formatDate(d.createdAt)].filter(Boolean).join(' · ');

  const layout = (file, title, body, script = '') => `<!doctype html>
<html lang="${getLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${title} · ${kind} · ${client || siteName}`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,500;9..40,700;9..40,800&display=swap">
<link rel="stylesheet" href="report.css"></head><body>
<a class="skip" href="#content">${esc(S('skip'))}</a>
<header class="top"><div class="wrap"><div class="top-bar">
  <a class="client" href="report.html">${brand}<span class="kind">${esc(kind)}</span></a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="areas">${esc(S('menu'))}</button>
  <nav class="nav" id="areas" aria-label="${esc(S('navLabel'))}">${PAGES.map((p) => `<a href="${p.file}"${p.file === file ? ' aria-current="page"' : ''}>${esc(p.label)}${p.n != null ? `<span class="n">${p.n}</span>` : ''}</a>`).join('')}</nav>
</div></div></header>
<main class="wrap" id="content">
${body}
</main>
<footer><div class="wrap"><div>
  <div class="row"><span>${esc(footerLine)}</span><a class="uxv" href="https://github.com/fabiofigueredo/ux-validate"><span class="dots" aria-hidden="true"><i style="background:#f7d046"></i><i style="background:#8cc4f4"></i><i style="background:#c79bf5"></i></span>${esc(S('generatedBy', { version: VERSION }))}</a></div>
  <p>${esc(S('disclaimer'))}</p>
</div></div></footer>
<script>
(()=>{const b=document.querySelector('.menu-btn'),n=document.getElementById('areas');b.addEventListener('click',()=>{const o=n.classList.toggle('open');b.setAttribute('aria-expanded',String(o));});})();
</script>${script}
</body></html>`;

  /* ---- Visão geral ---- */
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
  const personasSvg = `<svg viewBox="0 0 36 36" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="13" cy="12" r="5.5"/><path d="M3 30c1-6 5-9.5 10-9.5s9 3.5 10 9.5"/><circle cx="25" cy="13" r="4"/><path d="M24 20.5c4.5 0 8 3 9 8"/></svg>`;
  const planItem = (f) =>
    `<li><span><a href="${issueLink(f.id)}">${esc(f.title)}</a><small>${esc([CATEGORIES[f.category], f.affects.map((id) => personaName(d, id)).join(', '), f.sourceHint?.file ? `${f.sourceHint.file}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}` : f.page ? shortUrl(f.page) : null].filter(Boolean).join(' · '))}</small></span>${sev(f.severity)}</li>`;
  const allIssues = `<p class="more"><a href="report-issues.html">${esc(S('viewAllIssues', { n: d.findings.length }))}</a></p>`;

  let firstHtml;
  if (d.audit) {
    const group = (title, list, render) => `<h3>${esc(title)}</h3>${list.length ? `<ol>${list.map(render).join('')}</ol>` : `<p class="note">${esc(t('report.audit.planNone'))}</p>`}`;
    firstHtml = `<section aria-labelledby="t-first"><div class="band">${hand(H('hand.plan'))}<h2 id="t-first">${esc(S('planTitle'))}</h2><p class="note">${esc(t('report.audit.planIntro'))}</p>
${group(`1. ${t('report.audit.planBlocking')}`, d.plan.blocking, planItem)}
${group(`2. ${t('report.audit.planUrgent')}`, d.plan.urgent.slice(0, 8), planItem)}
${group(`3. ${t('report.audit.planOthers')}`, d.plan.others, (g) => `<li><span>${esc(g.title)}<small>${esc(CATEGORIES[g.category])} · ${g.ids.map((id) => `<a href="${issueLink(id)}">${esc(id)}</a>`).join(', ')}</small></span>${sev(g.severity)}</li>`)}
${allIssues}</div></section>`;
  } else {
    const top = d.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 5);
    firstHtml = `<section aria-labelledby="t-first"><div class="band">${hand(H('hand.first'))}<h2 id="t-first">${t('report.fixFirst')}</h2>${top.length ? `<ol>${top.map(planItem).join('')}</ol>` : `<p class="note">${esc(t('report.noTop'))}</p>`}${allIssues}</div></section>`;
  }

  const areaCards = [
    ['report-personas.html', S('nav.personas'), d.personas.length ? S('area.personas', { n: d.personas.length }) : S('area.personasNone')],
    ...(hasTasks ? [['report-tasks.html', S('nav.tasks'), S('area.tasks', { tasks: d.tasks.length, personas: d.personas.length })]] : []),
    ['report-issues.html', S('nav.issues'), S('area.issues', { n: d.findings.length })],
    ...(cvPages.length ? [['report-color-vision.html', S('nav.colorVision'), S('area.colorVision')]] : []),
    ...(d.audit ? [['report-scope.html', S('nav.scope'), S('area.scope')]] : []),
  ];

  const overview = `${pageHead(kind, esc(siteName))}
<div class="meta" style="margin-top:10px"><span><a href="${url(d.url)}">${esc(d.url ?? '')}</a></span><span>${esc(formatDate(d.createdAt))}</span><span>${t('report.pagesCount', { n: d.pages.length })}</span></div>
${
  d.personas.length
    ? `<div class="strip"><div class="pill">${personasSvg}${esc(H('simulated', { n: d.personas.length }))}</div><p>${esc(H('simulatedText'))}</p></div>`
    : `<div class="strip warn"><div class="pill">${personasSvg}${esc(H('onlyChecksPill'))}</div><p>${esc(t(d.audit ? 'report.audit.onlyChecks' : 'report.onlyChecks'))}</p></div>`
}
<div class="kpis">${kpis.map(([tint, value, label]) => `<div class="kpi ${tint}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('')}</div>
<section aria-labelledby="t-mini">${sectionHead(H('hand.scores'), t('report.scoresTitle'), 't-mini', `<a href="report-personas.html">${esc(S('viewPersonas'))}</a>`)}
<div class="mini">${d.scores
    .map((s, i) => `<a class="${TINTS[i % TINTS.length]}" href="report-personas.html#p-${esc(s.persona.id === '*' ? 'general' : s.persona.id)}">${ring(s.overall, 'sm')}<span><strong>${esc(s.persona.name)}</strong>${s.goalRate != null ? `<small>${esc(H('goalRate', { n: s.goalRate }))}</small>` : ''}</span></a>`)
    .join('')}</div></section>
${firstHtml}
<section aria-labelledby="t-areas">${sectionHead(S('areasHand'), esc(S('areasTitle')), 't-areas')}
<div class="areas">${areaCards.map(([href, label, text]) => `<a href="${href}"><b>${esc(label)}</b><span>${esc(text)}</span><span class="go">${esc(S('open'))}</span></a>`).join('')}</div></section>`;

  /* ---- Personas ---- */
  const who = (p) => {
    const tr = d.traits?.[p.id] ?? {};
    return [
      p.viewport ? H(`device.${p.viewport}`) : null,
      tr.vision && String(tr.vision) !== 'normal' ? `${H('vision')}: ${tr.vision}` : null,
      tr.tech_literacy ? `${H('tech')}: ${tr.tech_literacy}` : null,
    ].filter(Boolean).join(' · ');
  };
  const personaById = new Map(d.personas.map((p) => [p.id, p]));
  const personasPage = `${pageHead(H('hand.scores'), esc(S('nav.personas')), H('scoresIntro'))}
${d.personas.length ? '' : `<p class="apply" style="margin-top:18px">${esc(t(d.audit ? 'report.audit.onlyChecks' : 'report.onlyChecks'))}</p>`}
<section><div class="personas">${d.scores
    .map((s, i) => {
      const p = personaById.get(s.persona.id);
      const line = p ? who(p) : '';
      return `<article class="card persona ${TINTS[i % TINTS.length]}" id="p-${esc(s.persona.id === '*' ? 'general' : s.persona.id)}"><div class="head">${ring(s.overall)}<div><h3>${esc(s.persona.name)}</h3>${line ? `<p class="who">${esc(line)}</p>` : ''}
<ul class="bars">${CATEGORY_KEYS.map((c) => `<li><span>${esc(CATEGORIES[c])}</span><span class="bar" aria-hidden="true"><i style="width:${s[c]}%"></i></span><b>${s[c]}</b></li>`).join('')}</ul>
${s.goalRate != null ? `<p class="goal-rate">${esc(H('goalRate', { n: s.goalRate }))}</p>` : ''}</div></div>
${p?.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
${p?.goals?.length ? `<ul class="goals">${p.goals.map((g) => `<li>${out(g.outcome)}<span>${esc(g.goal)}<small>${g.steps ?? '?'} ${t('report.steps')}${g.notes ? ` · ${esc(g.notes)}` : ''}</small></span></li>`).join('')}</ul>` : ''}</article>`;
    })
    .join('')}</div></section>`;

  /* ---- Tarefas ---- */
  const lostCards = d.tasks.flatMap((task) =>
    task.results
      .filter((r) => r.result && r.result.outcome !== 'success')
      .map(({ persona, result }) => {
        const fc = result.firstClick;
        const meta = [
          fc?.label ? `${t('report.firstClick')}: “${fc.label}”${fc.onPath === false ? ` (${t('report.offPath')})` : fc.onPath ? ` (${t('report.onPath')})` : ''}` : null,
          result.backtracks ? `${t('report.backtracks')}: ${result.backtracks}` : null,
        ].filter(Boolean).join(' · ');
        return `<div class="card"><h3>${esc(task.task)}</h3><p>${out(result.outcome, result.steps ?? '?')} <strong>${esc(persona.name)}</strong></p>${meta ? `<p class="first">${esc(meta)}</p>` : ''}${task.success ? `<p class="first">${t('report.successCriterion')}: ${esc(task.success)}</p>` : ''}${result.notes ? `<p>${esc(result.notes)}</p>` : ''}${result.lostAt?.screenshot ? `<details class="inner"><summary>${t('report.lostAt')}</summary><img class="shot" loading="lazy" src="${url(result.lostAt.screenshot)}" alt="${esc(t('report.lostAt'))}: ${esc(persona.name)}"></details>` : ''}</div>`;
      }),
  );
  const tasksPage = hasTasks
    ? `${pageHead(H('hand.tasks'), t('report.tasksTitle'), t('report.tasksIntro'))}
<section><div class="table-wrap"><table class="tasks"><thead><tr><th scope="col" class="left">${t('report.task')}</th>${d.personas.map((p) => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${d.tasks
        .map((task) => `<tr><th scope="row">${esc(task.task)}</th>${task.results.map((r) => (!r.applies ? '<td class="muted">—</td>' : r.result ? `<td>${out(r.result.outcome, r.result.steps ?? '?')}</td>` : `<td class="muted">${esc(t('report.notTested'))}</td>`)).join('')}</tr>`)
        .join('')}</tbody></table></div>
<p class="legend">${esc(t('report.tasksLegend'))}</p>
${d.taskWarnings.map((w) => `<p class="apply" style="margin-top:12px">${esc(t('tasks.leading', { id: w.id, labels: w.labels.map((l) => `"${l}"`).join(', ') }))}</p>`).join('')}</section>
${lostCards.length ? `<section aria-labelledby="t-lost">${sectionHead(S('lostHand'), esc(S('lostTitle')), 't-lost')}<div class="lost">${lostCards.join('')}</div></section>` : ''}`
    : '';

  /* ---- Problemas ---- */
  const items = d.findings
    .map(
      (f) => `<details class="finding" id="f-${esc(f.id)}" data-category="${esc(f.category)}" data-severity="${esc(f.severity)}" data-personas="${esc(f.affects.join(' '))}"><summary>${sev(f.severity)}<div><h3>${esc(f.title)}</h3><small>${esc([CATEGORIES[f.category], f.page ? shortUrl(f.page) : null, f.origin === 'agent' ? t('report.tagPersona') : t('report.tagCheck', { name: f.source?.replace('check:', '') }), f.id].filter(Boolean).join(' · '))}</small></div></summary>
<div class="body">${f.description ? `<p>${esc(f.description)}</p>` : ''}
<dl>${f.page ? `<dt>${t('report.page')}</dt><dd><a href="${url(f.page)}">${esc(shortUrl(f.page))}</a></dd>` : ''}${f.affects.length ? `<dt>${t('report.personas')}</dt><dd>${esc(f.affects.map((id) => personaName(d, id)).join(', '))}</dd>` : ''}${f.viewports?.length ? `<dt>${t('report.screens')}</dt><dd>${esc(f.viewports.join(', '))}</dd>` : ''}${f.heuristic ? `<dt>${t('report.criterion')}</dt><dd>${esc(f.heuristic)}</dd>` : ''}${f.sourceHint?.file ? `<dt>${t('report.whereToFix')}</dt><dd><code>${esc(f.sourceHint.file)}${f.sourceHint.line ? `:${f.sourceHint.line}` : ''}</code></dd>` : ''}${f.react?.components?.length ? `<dt>${t('report.component')}</dt><dd><code>${esc(f.react.components.join(' › '))}</code></dd>` : ''}${f.evidence?.selector ? `<dt>${t('report.element')}</dt><dd><code>${esc(f.evidence.selector)}</code></dd>` : ''}${f.ariaTree ? `<dt>${t('report.screenReader')}</dt><dd><a href="${url(f.ariaTree)}">${t('report.ariaTree')}</a></dd>` : ''}</dl>
${f.evidence?.snippet ? `<pre>${esc(f.evidence.snippet)}</pre>` : ''}
${f.suggestion ? `<p class="fix"><strong>${t('report.howToFix')}:</strong> ${esc(f.suggestion)}${f.helpUrl ? ` <a href="${url(f.helpUrl)}" target="_blank" rel="noopener noreferrer">${t('report.referenceHtml')}</a>` : ''}</p>` : ''}
${f.evidence?.screenshot ? `<details class="inner"><summary>${t('report.seeScreenshot')}</summary><img class="shot" loading="lazy" src="${url(f.evidence.screenshot)}" alt="${esc(t('report.screenshotOf', { page: f.page }))}"></details>` : ''}</div></details>`,
    )
    .join('');
  const issuesPage = `${pageHead(H('hand.issues'), `${t('report.issues')} (${d.findings.length})`, S('issuesIntro'))}
<section>${
    d.findings.length
      ? `<div class="filters">
<div class="chips" role="group" aria-label="${esc(H('filterLabel'))}"><button type="button" data-category="all" aria-pressed="true">${t('report.all')}</button>${categoryEntries().map(([k, v]) => `<button type="button" data-category="${k}" aria-pressed="false">${esc(v)} (${d.findings.filter((f) => f.category === k).length})</button>`).join('')}</div>
<div class="selects"><label>${esc(S('filterSeverity'))} <select id="f-severity"><option value="">${esc(S('any'))}</option>${SEVERITY_ORDER.map((s) => `<option value="${s}">${esc(SEVERITY_LABEL[s])}</option>`).join('')}</select></label>
${d.personas.length ? `<label>${esc(S('filterPersona'))} <select id="f-persona"><option value="">${esc(S('any'))}</option>${d.personas.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}
<span class="count" id="f-count" aria-live="polite"></span></div></div>
${d.audit ? '' : `<p class="apply">${t('report.applyFixesHtml')}</p>`}
${items}`
      : `<p class="card">${t('report.noIssuesHtml')}</p>`
  }</section>`;
  const issuesScript = `<script>
(()=>{let cat='all';const items=[...document.querySelectorAll('.finding')];if(!items.length)return;
const sev=document.getElementById('f-severity'),who=document.getElementById('f-persona'),count=document.getElementById('f-count');
const label=${JSON.stringify(S('countOf', { n: '__N__', total: '__T__' }))};
const apply=()=>{let n=0;for(const f of items){const show=(cat==='all'||f.dataset.category===cat)&&(!sev.value||f.dataset.severity===sev.value)&&(!who||!who.value||f.dataset.personas.split(' ').includes(who.value));f.hidden=!show;if(show)n++;}count.textContent=label.replace('__N__',n).replace('__T__',items.length);};
document.querySelectorAll('[data-category]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.addEventListener('click',()=>{cat=b.dataset.category;document.querySelectorAll('button[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));apply();});});
sev.addEventListener('change',apply);if(who)who.addEventListener('change',apply);
const open=()=>{const el=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));if(el&&el.tagName==='DETAILS'){el.hidden=false;el.open=true;el.scrollIntoView();}};
window.addEventListener('hashchange',open);apply();open();})();
</script>`;

  /* ---- Visão de cores ---- */
  const cvPage = cvPages.length
    ? `${pageHead(H('hand.cv'), t('report.colorVision'), t('report.colorVisionIntro'))}
<section>${cvPages
        .map((p) => {
          const issues = d.findings.filter((f) => f.audience === 'color-blind' && f.page === p.url).length;
          const figures = Object.entries(p.colorVision)
            .map(([type, file]) => {
              const label = t(`colorVision.shortTypes.${type}`);
              return `<figure><figcaption>${esc(label)}</figcaption><a href="${url(file)}"><img class="shot" loading="lazy" src="${url(file)}" alt="${esc(t('report.colorVisionAlt', { page: p.url, type: label }))}"></a></figure>`;
            })
            .join('');
          return `<div class="card cv-page"><h3>${esc(shortUrl(p.url))} <span class="tag">${esc(t('report.colorVisionIssues', { n: issues }))}</span></h3><div class="cv">${figures}</div></div>`;
        })
        .join('')}</section>`
    : '';

  /* ---- Escopo da auditoria ---- */
  const limits = d.audit ? auditLimits(d) : [];
  const scopePage = d.audit
    ? `${pageHead(S('scopeHand'), esc(S('scopeTitle')), t('report.audit.limitsIntro'))}
<section aria-labelledby="t-analyzed">${sectionHead(S('analyzedHand'), esc(S('analyzedTitle', { n: d.pages.length })), 't-analyzed')}
<div class="card"><ul class="limits-list" style="margin:0;padding-left:18px;font-size:13px;overflow-wrap:anywhere">${d.pages.map((p) => `<li>${esc(shortUrl(p.url))}${p.title ? ` · ${esc(p.title)}` : ''}${p.ok === false ? ` <span class="tag">${esc(String(p.status ?? ''))}</span>` : ''}</li>`).join('')}</ul></div></section>
${limits.length ? `<section aria-labelledby="t-out">${sectionHead(S('outHand'), esc(t('report.audit.limitsTitle')), 't-out')}<div class="limits">${limits.map(({ label, items: list }) => `<div class="card"><h3>${esc(label)} <span class="tag">${list.length}</span></h3><ul>${list.slice(0, 30).map((x) => `<li>${esc(shortUrl(x))}</li>`).join('')}${list.length > 30 ? `<li class="muted">${esc(t('report.audit.andMore', { n: list.length - 30 }))}</li>` : ''}</ul></div>`).join('')}</div></section>` : ''}`
    : '';

  const pages = {
    'report.html': layout('report.html', S('nav.overview'), overview),
    'report-personas.html': layout('report-personas.html', S('nav.personas'), personasPage),
    'report-issues.html': layout('report-issues.html', S('nav.issues'), issuesPage, issuesScript),
  };
  if (hasTasks) pages['report-tasks.html'] = layout('report-tasks.html', S('nav.tasks'), tasksPage);
  if (cvPages.length) pages['report-color-vision.html'] = layout('report-color-vision.html', S('nav.colorVision'), cvPage);
  if (d.audit) pages['report-scope.html'] = layout('report-scope.html', S('nav.scope'), scopePage);
  return pages;
}

function personaName(d, id) {
  return d.personas.find((p) => p.id === id)?.name ?? id;
}
