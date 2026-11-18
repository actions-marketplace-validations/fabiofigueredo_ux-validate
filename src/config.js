import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { t, getLocale } from './i18n.js';

// Tipos de daltonismo simulados (mesma lista de src/color.js, sem importar o módulo inteiro aqui).
const CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

export const WORK_DIR = '.ux-validate';
export const RUNS_DIR = `${WORK_DIR}/runs`;

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
};

// O nome exibido de cada provedor está no catálogo de mensagens (providers.<id>).
export const PROVIDERS = {
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', defaultModel: 'claude-opus-5-5' },
  openai: { apiKeyEnv: 'OPENAI_API_KEY' },
  google: { apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  ollama: { baseUrl: 'http://localhost:11434' },
};

const DEFAULTS = {
  app: { url: 'http://localhost:3000' },
  personas: `${WORK_DIR}/personas`,
  tasks: `${WORK_DIR}/tasks.yml`,
  viewports: ['mobile', 'desktop'],
  runs: RUNS_DIR,
  crawl: { maxPages: 20, checkExternalLinks: false, routes: [], delayMs: 0 },
  agent: { maxStepsPerGoal: 15 },
  spelling: { enabled: true, ignore: [] },
  colorVision: { enabled: true, types: ['protanopia', 'deuteranopia', 'tritanopia'] },
};

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

/** Com `optional`, a falta do arquivo não é erro: usa os valores padrão (ex.: CI com --url). */
export function loadConfig(cwd, configPath = 'ux-validate.config.yml', { optional = false } = {}) {
  const file = path.resolve(cwd, configPath);
  const exists = fs.existsSync(file);
  if (!exists && !optional) {
    throw new Error(t('config.notFound', { path: configPath }));
  }
  const raw = exists ? (YAML.parse(fs.readFileSync(file, 'utf8')) ?? {}) : {};
  const config = {
    ...DEFAULTS,
    ...raw,
    app: { ...DEFAULTS.app, ...raw.app },
    crawl: { ...DEFAULTS.crawl, ...raw.crawl },
    agent: { ...DEFAULTS.agent, ...raw.agent },
    spelling: { ...DEFAULTS.spelling, ...raw.spelling },
    colorVision: { ...DEFAULTS.colorVision, ...raw.colorVision },
    // Idioma do conteúdo (ortografia); sem valor, assume o idioma da ferramenta.
    language: raw.language ?? getLocale(),
    // A auditoria de um site publicado usa o idioma da página (<html lang>) quando `language` não foi definido.
    languageSet: raw.language != null,
  };
  const badTypes = (config.colorVision.types ?? []).filter((v) => !CVD_TYPES.includes(v));
  if (badTypes.length) {
    throw new Error(t('config.unknownCvdType', { list: badTypes.join(', '), valid: CVD_TYPES.join(', ') }));
  }
  const unknown = config.viewports.filter((v) => !VIEWPORTS[v]);
  if (unknown.length) {
    throw new Error(t('config.unknownViewport', { list: unknown.join(', '), valid: Object.keys(VIEWPORTS).join(', ') }));
  }
  return config;
}

// Pastas de execução: nome com data e hora, ou com um resultado dentro. Separa as execuções de outras
// pastas (ex.: personas, numa auditoria).
const RUN_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/;

/** Pasta das execuções: `runs` da configuração (a auditoria de um site usa a própria pasta). */
export function runsDir(cwd, configPath) {
  try {
    return path.resolve(cwd, loadConfig(cwd, configPath, { optional: true }).runs ?? RUNS_DIR);
  } catch {
    return path.resolve(cwd, RUNS_DIR);
  }
}

export function newRunDir(cwd, configPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(runsDir(cwd, configPath), stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function latestRunDir(cwd, configPath) {
  const root = runsDir(cwd, configPath);
  if (!fs.existsSync(root)) return null;
  const runs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (RUN_NAME.test(d.name) || ['checks.json', 'findings.json'].some((f) => fs.existsSync(path.join(root, d.name, f)))))
    .map((d) => d.name)
    .sort();
  return runs.length ? path.join(root, runs.at(-1)) : null;
}

/** A pasta (ou a execução indicada) é uma auditoria de site publicado (`ux-validate audit`)? */
export function isAuditRun(cwd, run) {
  try {
    if (loadConfig(cwd, undefined, { optional: true }).mode === 'audit') return true;
    if (!run) return false;
    const file = path.join(path.resolve(cwd, run), 'checks.json');
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).mode === 'audit';
  } catch {
    return false;
  }
}
