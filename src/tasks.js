import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { checkbox, confirm, input } from '@inquirer/prompts';
import { WORK_DIR, loadConfig } from './config.js';
import { t } from './i18n.js';

/**
 * Tarefas do projeto: o que as personas simuladas tentam fazer na aplicação, sem passo a passo
 * (como num teste de usabilidade por tarefas). Ficam em .ux-validate/tasks.yml e valem para todas as
 * personas, a menos que a tarefa liste só algumas em `personas`.
 *
 *   - id: preco
 *     task: Você quer saber quanto custa o plano mais barato.
 *     success: A página mostra o preço do plano mais barato.   # opcional: onde chegar, não como
 *     personas: [dona-maria]                                    # opcional
 *     start: /                                                  # opcional: página de partida
 */

export const DEFAULT_TASKS_FILE = `${WORK_DIR}/tasks.yml`;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Sinais de passo a passo: a tarefa deve dizer o objetivo, não o caminho.
const STEP_HINTS = /(→|->|\b(clique|clicar|cliquei|toque|tocar|selecione|v[aá] at[eé]|acesse o menu|no menu|click|tap|select|go to|navigate to|in the menu|then press)\b|^\s*\d+[.)]\s)/im;

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Palavras de ligação ignoradas ao gerar o id a partir do texto da tarefa.
const STOPWORDS = new Set(
  ('voce quer querer saber precisa precisar gostaria deseja tentar consegue como para por com sem que qual quais ' +
    'uma umas uns das dos nas nos pela pelo esta este essa esse sua seu suas seus mais menos muito ' +
    'you want need would like wants know find out how much many what where when can the and for with without that which your this from into about').split(' '),
);

export function slugifyTask(text) {
  const words = normalize(text).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return words.slice(0, 4).join('-') || 'tarefa';
}

export function tasksFile(cwd, configPath) {
  let rel = DEFAULT_TASKS_FILE;
  try {
    rel = loadConfig(cwd, configPath, { optional: true }).tasks ?? rel;
  } catch {
    // Sem configuração válida: usa o caminho padrão.
  }
  return path.resolve(cwd, rel);
}

/** Lê as tarefas do projeto. Sem arquivo, devolve lista vazia. */
export function loadTasks(cwd, configPath) {
  const file = tasksFile(cwd, configPath);
  if (!fs.existsSync(file)) return { file, tasks: [] };
  const data = YAML.parse(fs.readFileSync(file, 'utf8'));
  const tasks = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : [];
  return { file, tasks };
}

export function renderTasks(tasks) {
  const clean = tasks.map((x) => ({
    id: x.id,
    task: x.task,
    ...(x.success ? { success: x.success } : {}),
    ...(x.personas?.length ? { personas: x.personas } : {}),
    ...(x.start ? { start: x.start } : {}),
  }));
  return `${t('tasks.fileHeader')}\n${YAML.stringify(clean, { lineWidth: 100 })}`;
}

export function writeTasks(cwd, tasks, configPath) {
  const file = tasksFile(cwd, configPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderTasks(tasks));
  return file;
}

/** Garante ids únicos e válidos (a partir do texto, quando faltar). */
export function withIds(tasks) {
  const used = new Set();
  return tasks.map((task) => {
    let id = task.id && ID_PATTERN.test(String(task.id)) ? String(task.id) : slugifyTask(task.task);
    const base = id;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return { ...task, id };
  });
}

/** Confere uma tarefa. `personaIds`: ids das personas do projeto, para conferir o campo `personas`. */
export function validateTask(task, personaIds = null) {
  const errors = [];
  const warnings = [];
  if (!task || typeof task !== 'object') return { errors: [t('tasks.validate.notObject')], warnings };
  if (!task.id) errors.push(t('tasks.validate.missingField', { field: 'id' }));
  else if (!ID_PATTERN.test(String(task.id))) errors.push(t('tasks.validate.invalidId', { id: task.id }));
  if (typeof task.task !== 'string' || !task.task.trim()) errors.push(t('tasks.validate.missingField', { field: 'task' }));
  else {
    if (task.task.trim().length < 10) warnings.push(t('tasks.validate.tooShort'));
    if (STEP_HINTS.test(task.task)) warnings.push(t('tasks.validate.looksLikeSteps'));
  }
  if (task.success != null && (typeof task.success !== 'string' || !task.success.trim())) errors.push(t('tasks.validate.success'));
  if (task.personas != null) {
    if (!Array.isArray(task.personas) || !task.personas.every((p) => typeof p === 'string')) errors.push(t('tasks.validate.personas'));
    else if (personaIds) {
      const unknown = task.personas.filter((p) => !personaIds.includes(p));
      if (unknown.length) errors.push(t('tasks.validate.unknownPersonas', { list: unknown.join(', ') }));
    }
  }
  return { errors, warnings };
}

function personaIdsOf(cwd, configPath) {
  let dir = `${WORK_DIR}/personas`;
  try {
    dir = loadConfig(cwd, configPath, { optional: true }).personas ?? dir;
  } catch {
    // padrão
  }
  const abs = path.resolve(cwd, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => {
      try {
        return YAML.parse(fs.readFileSync(path.join(abs, f), 'utf8'))?.id;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** `ux-validate task validate`: confere o arquivo de tarefas inteiro. */
export function validateTasks({ cwd, configPath, log = console.log }) {
  const { file, tasks } = loadTasks(cwd, configPath);
  const rel = path.relative(cwd, file) || file;
  if (!tasks.length) throw new Error(t('tasks.validate.noneFound', { file: rel }));
  const personaIds = personaIdsOf(cwd, configPath);
  const ids = new Map();
  let failed = 0;
  for (const [i, task] of tasks.entries()) {
    const { errors, warnings } = validateTask(task, personaIds.length ? personaIds : null);
    if (task?.id && ids.has(task.id)) errors.push(t('tasks.validate.duplicateId', { id: task.id }));
    if (task?.id) ids.set(task.id, i);
    if (errors.length) failed++;
    log(`${errors.length ? '✖' : '✔'} ${task?.id ?? `#${i + 1}`}: ${String(task?.task ?? '').slice(0, 70)}`);
    for (const e of errors) log(`    ✖ ${e}`);
    for (const w of warnings) log(`    ⚠ ${w}`);
  }
  log(`\n${t('tasks.validate.summary', { ok: tasks.length - failed, total: tasks.length, file: rel })}`);
  if (failed) throw new Error(t('tasks.validate.failed', { n: failed }));
  return { total: tasks.length, failed };
}

/**
 * Tarefas que usam as palavras exatas de um link ou botão do site: entregam a resposta
 * (a persona só procura a palavra, em vez de entender onde a informação está).
 */
export function leadingLabels(tasks, labels) {
  const usable = [...new Set(labels.map((l) => normalize(l)))].filter(
    (l) => l.length >= 4 && l.length <= 40 && /[a-z]/.test(l),
  );
  const out = [];
  for (const task of tasks) {
    const text = ` ${normalize(task.task).replace(/[^a-z0-9]+/g, ' ')} `;
    const hits = usable.filter((label) => text.includes(` ${label.replace(/[^a-z0-9]+/g, ' ').trim()} `));
    if (hits.length) out.push({ id: task.id, task: task.task, labels: hits.slice(0, 5) });
  }
  return out;
}

/** Tarefas que valem para uma persona. */
export function tasksFor(tasks, personaId) {
  return tasks.filter((task) => !task.personas?.length || task.personas.includes(personaId));
}

/** Pergunta as tarefas no terminal (setup e `task new`). Exige pelo menos `min`. */
export async function askTasks({ min = 1, personaIds = [], log = console.log } = {}) {
  log(`\n${t('tasks.intro')}\n`);
  const tasks = [];
  for (;;) {
    const n = tasks.length + 1;
    const text = (
      await input({
        message: t('tasks.taskQ', { n }),
        required: tasks.length < min,
        validate: (v) => (!v.trim() && tasks.length < min ? t('tasks.needOne') : true),
      })
    ).trim();
    if (!text) break;
    if (STEP_HINTS.test(text)) log(`  ⚠ ${t('tasks.validate.looksLikeSteps')}`);
    const success = (await input({ message: t('tasks.successQ') })).trim();
    let personas = [];
    if (personaIds.length > 1 && (await confirm({ message: t('tasks.onlySomeQ'), default: false }))) {
      personas = await checkbox({ message: t('tasks.personasQ'), required: true, choices: personaIds.map((id) => ({ name: id, value: id })) });
    }
    tasks.push({ task: text, ...(success ? { success } : {}), ...(personas.length ? { personas } : {}) });
    if (tasks.length >= min && !(await confirm({ message: t('tasks.anotherQ'), default: tasks.length < 3 }))) break;
  }
  return tasks;
}

/** `ux-validate task new`: acrescenta tarefas ao arquivo do projeto. */
export async function newTasks({ cwd, configPath, log = console.log }) {
  const { tasks: current } = loadTasks(cwd, configPath);
  const added = await askTasks({ min: 1, personaIds: personaIdsOf(cwd, configPath), log });
  const all = withIds([...current, ...added]);
  const file = writeTasks(cwd, all, configPath);
  log(`\n${t('tasks.saved', { n: added.length, file: path.relative(cwd, file) })}`);
  return all;
}
