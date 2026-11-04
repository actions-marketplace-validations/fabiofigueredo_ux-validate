import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { PROVIDERS, VIEWPORTS, WORK_DIR, RUNS_DIR } from './config.js';
import { ADAPTERS, sourceDir, loadCommands } from './adapters/index.js';
import { writeFile } from './files.js';
import { projectDictionary } from './spelling.js';
import { t, getLocale, setLocale } from './i18n.js';

const CONTENT_LANGUAGES = ['pt-BR', 'en', 'es', 'other'];

export async function init({ cwd, yes = false, force = false }) {
  const answers = yes ? defaultAnswers() : await ask();
  setLocale(answers.locale);
  // Carrega os comandos antes de gravar qualquer arquivo, para não deixar uma instalação pela metade.
  const commands = loadCommands(answers.locale);
  const source = sourceDir(answers.locale);

  const results = [];
  results.push(writeFile(cwd, 'ux-validate.config.yml', renderConfig(answers), { force }));

  // Referências (heurísticas, formato de saída) são compartilhadas por todas as ferramentas.
  for (const file of fs.readdirSync(path.join(source, 'references'))) {
    const content = fs.readFileSync(path.join(source, 'references', file), 'utf8');
    results.push(writeFile(cwd, `${WORK_DIR}/references/${file}`, content, { force: true }));
  }

  results.push(writeFile(cwd, projectDictionary(answers.locale), t('init.dictionaryTemplate')));

  if (answers.examplePersonas) {
    for (const file of fs.readdirSync(path.join(source, 'personas'))) {
      const content = fs.readFileSync(path.join(source, 'personas', file), 'utf8');
      results.push(writeFile(cwd, `${WORK_DIR}/personas/${file}`, content));
    }
  }

  for (const id of answers.targets) {
    const adapter = ADAPTERS.find((a) => a.id === id);
    results.push(...adapter.install({ cwd, commands, force }));
  }

  results.push(ensureGitignore(cwd));

  console.log('');
  for (const r of results) console.log(`  ${t(`status.${r.status}`).padEnd(10)} ${r.rel}`);
  printNextSteps(answers);
}

function defaultAnswers() {
  const locale = getLocale();
  return {
    locale,
    targets: ['claude-code'],
    url: 'http://localhost:3000',
    start: '',
    viewports: ['mobile', 'desktop'],
    language: locale,
    standalone: null,
    examplePersonas: true,
  };
}

async function ask() {
  // A primeira pergunta aparece nos dois idiomas; daí em diante tudo segue o idioma escolhido.
  const locale = await select({
    message: 'Language / Idioma:',
    default: getLocale(),
    choices: [
      { name: 'English', value: 'en' },
      { name: 'Português (Brasil)', value: 'pt-BR' },
    ],
  });
  setLocale(locale);
  console.log(`\n${t('init.title')}`);

  const targets = await checkbox({
    message: t('init.targetsQ'),
    required: true,
    choices: ADAPTERS.map((a) => ({
      name: a.label,
      value: a.id,
      checked: a.id === 'claude-code',
      disabled: a.available ? false : t('init.soon'),
    })),
  });

  const url = await input({ message: t('init.urlQ'), default: 'http://localhost:3000', validate: validateUrl });
  const start = await input({ message: t('init.startQ'), default: '' });

  const viewports = await checkbox({
    message: t('init.viewportsQ'),
    required: true,
    choices: Object.entries(VIEWPORTS).map(([id, v]) => ({
      name: `${id} (${v.width}×${v.height})`,
      value: id,
      checked: id !== 'tablet',
    })),
  });

  const language = await select({
    message: t('init.languageQ'),
    default: locale,
    choices: CONTENT_LANGUAGES.map((value) => ({ name: t(`init.languages.${value}`), value })),
  });

  // Na ferramenta de IA (ex.: /persona-fix no Claude Code) o modelo é o da própria ferramenta.
  // Pelo terminal (npx ux-validate fix, CI), o ux-validate chama o provedor direto, com a chave do usuário.
  let standalone = null;
  console.log(t('init.fixIntro'));
  if (await confirm({ message: t('init.fixQ'), default: false })) {
    const provider = await select({
      message: t('init.providerQ'),
      choices: Object.keys(PROVIDERS).map((id) => ({ name: t(`providers.${id}`), value: id })),
    });
    const info = PROVIDERS[provider];
    const model = await input({ message: t('init.modelQ'), default: info.defaultModel, required: true });
    standalone = { provider, model };
    if (info.apiKeyEnv) standalone.apiKeyEnv = await input({ message: t('init.apiKeyEnvQ'), default: info.apiKeyEnv });
    if (info.baseUrl) standalone.baseUrl = await input({ message: t('init.baseUrlQ'), default: info.baseUrl });
  }

  const examplePersonas = await confirm({ message: t('init.examplesQ'), default: true });

  return { locale, targets, url, start, viewports, language, standalone, examplePersonas };
}

function validateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return t('init.invalidUrl');
  }
  if (url.protocol === 'file:') return fs.existsSync(fileURLToPath(url)) || t('init.fileMissing');
  return ['http:', 'https:'].includes(url.protocol) || t('init.urlProtocol');
}

function renderConfig(a) {
  const config = {
    locale: a.locale,
    targets: a.targets,
    app: { url: a.url, ...(a.start ? { start: a.start } : {}) },
    personas: `${WORK_DIR}/personas`,
    viewports: a.viewports,
    language: a.language,
    spelling: { enabled: a.language !== 'other', ignore: [] },
    crawl: { maxPages: 20, checkExternalLinks: false },
    agent: { maxStepsPerGoal: 15 },
    ...(a.standalone ? { standalone: a.standalone } : {}),
  };
  return t('init.configHeader') + YAML.stringify(config);
}

function ensureGitignore(cwd) {
  const file = path.join(cwd, '.gitignore');
  const line = `${RUNS_DIR}/`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split('\n').some((l) => l.trim() === line)) return { rel: '.gitignore', status: 'kept' };
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, `${current}${prefix}${t('init.gitignoreComment')}\n${line}\n`);
  return { rel: '.gitignore', status: current ? 'updated' : 'created' };
}

function printNextSteps(a) {
  console.log(t('init.next.title'));
  console.log(t('init.next.personas', { dir: `${WORK_DIR}/personas` }));
  if (a.targets.includes('claude-code')) {
    console.log(t('init.next.openTool'));
    console.log(t('init.next.runTest'));
    console.log(t('init.next.runFix'));
  }
  if (a.standalone) {
    console.log(t('init.next.cliFix', { provider: a.standalone.provider, model: a.standalone.model }));
    if (a.standalone.apiKeyEnv) {
      console.log(t('init.next.setKey', { env: a.standalone.apiKeyEnv }));
      console.log(t('init.next.keyPowerShell', { env: a.standalone.apiKeyEnv }));
      console.log(t('init.next.keyBash', { env: a.standalone.apiKeyEnv }));
    }
  }
  console.log('');
}
