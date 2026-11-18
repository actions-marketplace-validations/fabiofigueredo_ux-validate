import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { confirm } from '@inquirer/prompts';
import { VIEWPORTS, loadConfig } from './config.js';
import { t, getLocale } from './i18n.js';
import { addPresets } from './persona.js';
import { loadTasks, withIds, writeTasks } from './tasks.js';
import { ensureGitignore, inGitRepo } from './files.js';

/**
 * `ux-validate audit <url>`: as mesmas checagens num site já publicado, sem o código do projeto.
 *
 * Cada site ganha uma pasta própria, `ux-validate-audits/<domínio>/`, com uma configuração
 * (`mode: audit`), as personas e as tarefas (reaproveitadas na próxima auditoria) e uma pasta por
 * execução (`<data-hora>/`). Com `mode: audit`, o check respeita o robots.txt, espera entre as páginas,
 * se identifica, não segue links de sair/excluir e não tenta iniciar a aplicação.
 */

export const AUDITS_DIR = 'ux-validate-audits';
export const AUDIT_DELAY_MS = 1000;
export const AUDIT_CONFIG = 'ux-validate.config.yml';

/** Só sites publicados (http/https). Aceita "exemplo.com.br" sem o protocolo. */
export function parseAuditUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(t('audit.noUrl'));
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(mailto|javascript|data|file):/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error(t('audit.invalidUrl', { url: raw }));
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error(t('audit.invalidUrl', { url: raw }));
  return url.href;
}

/** Pasta do site: o domínio (com a porta, se houver), num nome que vale em qualquer sistema. */
export function auditDir(cwd, url) {
  const host = new URL(url).host.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  return path.join(cwd, AUDITS_DIR, host);
}

/** Cria ou atualiza a configuração da pasta do site. O que o usuário já mudou nela é mantido. */
export function prepareAuditDir(dir, { url, maxPages, viewports }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, AUDIT_CONFIG);
  const current = fs.existsSync(file) ? (YAML.parse(fs.readFileSync(file, 'utf8')) ?? {}) : {};
  const config = {
    ...current,
    mode: 'audit',
    locale: current.locale ?? getLocale(),
    app: { ...current.app, url },
    personas: current.personas ?? 'personas',
    tasks: current.tasks ?? 'tasks.yml',
    runs: current.runs ?? '.',
    viewports: viewports ?? current.viewports ?? ['mobile', 'desktop'],
    crawl: {
      ...current.crawl,
      maxPages: maxPages ?? current.crawl?.maxPages ?? 20,
      // Nunca menos de 1 segundo entre as páginas de um site no ar.
      delayMs: Math.max(AUDIT_DELAY_MS, Number(current.crawl?.delayMs) || 0),
    },
  };
  delete config.app.start; // num site publicado, não há o que iniciar
  fs.writeFileSync(file, `${t('audit.configHeader')}\n${YAML.stringify(config)}`);
  loadConfig(dir, AUDIT_CONFIG); // confere telas e demais valores
  return config;
}

export async function audit({ cwd, url: rawUrl, yes = false, personas, tasks = [], maxPages, viewports, failOn, log = console.log }) {
  const url = parseAuditUrl(rawUrl);
  const max = maxPages == null ? undefined : Number(maxPages);
  if (max !== undefined && !(Number.isInteger(max) && max > 0)) throw new Error(t('audit.invalidMaxPages', { value: maxPages }));
  const vps = viewports ? String(viewports).split(',').map((v) => v.trim()).filter(Boolean) : undefined;
  if (vps?.some((v) => !VIEWPORTS[v])) throw new Error(t('config.unknownViewport', { list: vps.filter((v) => !VIEWPORTS[v]).join(', '), valid: Object.keys(VIEWPORTS).join(', ') }));

  // Só sites próprios ou com autorização: a pergunta é obrigatória, a menos que --yes confirme.
  if (!yes) {
    if (!process.stdin.isTTY) throw new Error(t('audit.needsYes'));
    log(t('audit.permissionIntro', { url }));
    if (!(await confirm({ message: t('audit.permissionQ'), default: false }))) throw new Error(t('audit.notAuthorized'));
  }

  const dir = auditDir(cwd, url);
  prepareAuditDir(dir, { url, maxPages: max, viewports: vps });
  const rel = (p) => path.relative(cwd, p).split(path.sep).join('/') || '.';
  log(t('audit.folder', { dir: rel(dir) }));
  // Dentro de um repositório Git, a pasta das auditorias não deve ir para o commit por engano.
  if (inGitRepo(cwd)) {
    const { status } = ensureGitignore(cwd, `${AUDITS_DIR}/`, t('audit.gitignoreComment'));
    if (status !== 'kept') log(t('audit.gitignored', { dir: `${AUDITS_DIR}/` }));
  }

  if (personas && personas !== 'none') addPresets({ cwd: dir, configPath: AUDIT_CONFIG, ids: personas.split(',').map((s) => s.trim()).filter(Boolean), log });
  if (tasks.length) {
    const { tasks: current } = loadTasks(dir, AUDIT_CONFIG);
    const added = tasks.map((task) => ({ task })).filter((x) => !current.some((c) => c.task.trim() === x.task.trim()));
    if (added.length) writeTasks(dir, withIds([...current, ...added]), AUDIT_CONFIG);
  }

  const { runChecks } = await import('./checks.js');
  const { buildReport } = await import('./report.js');
  const { runDir, result } = await runChecks({ cwd: dir, configPath: AUDIT_CONFIG, url, failOn });
  const exitCode = process.exitCode;
  await buildReport({ cwd: dir, run: runDir, log: () => {} });
  process.exitCode = exitCode;

  if (result.skipped?.length) log(t('audit.skippedSummary', { n: result.skipped.length }));
  log(`\n${t('audit.done')}\n  ${rel(path.join(runDir, 'report.html'))}`);
  if (!process.env.CI) log(t('audit.next', { url, dir: rel(dir) }));
  return { dir, runDir, result };
}
