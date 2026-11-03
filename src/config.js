import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const WORK_DIR = '.ux-validade';
export const RUNS_DIR = `${WORK_DIR}/runs`;

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
};

export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', apiKeyEnv: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-5-5' },
  openai: { label: 'OpenAI', apiKeyEnv: 'OPENAI_API_KEY' },
  google: { label: 'Google (Gemini)', apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  ollama: { label: 'Ollama (modelo local)', baseUrl: 'http://localhost:11434' },
};

const DEFAULTS = {
  app: { url: 'http://localhost:3000' },
  personas: `${WORK_DIR}/personas`,
  viewports: ['mobile', 'desktop'],
  crawl: { maxPages: 20, checkExternalLinks: false },
  agent: { maxStepsPerGoal: 15 },
};

export function loadConfig(cwd, configPath = 'ux-validade.config.yml') {
  const file = path.resolve(cwd, configPath);
  if (!fs.existsSync(file)) {
    throw new Error(`Configuração não encontrada em ${configPath}. Rode "npx ux-validade init" primeiro.`);
  }
  const raw = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  const config = {
    ...DEFAULTS,
    ...raw,
    app: { ...DEFAULTS.app, ...raw.app },
    crawl: { ...DEFAULTS.crawl, ...raw.crawl },
    agent: { ...DEFAULTS.agent, ...raw.agent },
  };
  const unknown = config.viewports.filter((v) => !VIEWPORTS[v]);
  if (unknown.length) {
    throw new Error(`Viewport desconhecido: ${unknown.join(', ')}. Use: ${Object.keys(VIEWPORTS).join(', ')}.`);
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
