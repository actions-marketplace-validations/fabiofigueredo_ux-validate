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
  viewports: ['mobile', 'desktop'],
  crawl: { maxPages: 20, checkExternalLinks: false, routes: [] },
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

export function newRunDir(cwd) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(cwd, RUNS_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function latestRunDir(cwd) {
  const root = path.join(cwd, RUNS_DIR);
  if (!fs.existsSync(root)) return null;
  const runs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return runs.length ? path.join(root, runs.at(-1)) : null;
}
