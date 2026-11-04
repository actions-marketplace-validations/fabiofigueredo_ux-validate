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
import { loadPresets, describePersona, addPresets, newPersona, countPersonas } from './persona.js';
import { detectFramework } from './react.js';

const CONTENT_LANGUAGES = ['pt-BR', 'en', 'es', 'other'];

export async function init({ cwd, yes = false, force = false, tools, personas }) {
  // Projeto React (Vite, Next.js, CRA…): a URL e o comando do servidor de desenvolvimento viram o padrão.
  const framework = detectFramework(cwd);
  const answers = yes ? defaultAnswers(tools, personas, framework) : await ask(framework);
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

  if (answers.presetIds.length) results.push(...addPresets({ cwd, ids: answers.presetIds, log: () => {} }));

  for (const id of answers.targets) {
    const adapter = ADAPTERS.find((a) => a.id === id);
    results.push(...adapter.install({ cwd, commands, force }));
  }

  results.push(...removeLegacyCommands(cwd));
  results.push(ensureGitignore(cwd));

  console.log('');
  for (const r of results) console.log(`  ${t(`status.${r.status}`).padEnd(10)} ${r.rel}`);

  // Passo obrigatório: sem personas não há teste. A criação roda depois de gravar a configuração,
  // para o assistente usar a pasta de personas e o idioma do conteúdo escolhidos.
  if (answers.createPersonas) await createPersonas(cwd);

  printNextSteps(answers, cwd);
}

/** Assistente de criação em sequência: pelo menos uma persona, depois quantas o usuário quiser. */
async function createPersonas(cwd) {
  let created = 0;
  for (;;) {
    console.log(t('init.createIntro', { n: created + 1 }));
    if (await newPersona({ cwd })) created++;
    else if (!created && countPersonas(cwd) === 0) {
      console.log(t('init.needOne'));
      continue;
    }
    if (!(await confirm({ message: t('init.createAnotherQ'), default: false }))) return created;
  }
}

/**
 * Até a versão 0.x os comandos se chamavam persona-test, persona-report, persona-fix e persona-new.
 * Remove as cópias geradas pelo ux-validate (só as que mencionam o ux-validate) para não ficarem duplicadas.
 */
const LEGACY_NAMES = ['persona-test', 'persona-report', 'persona-fix', 'persona-new'];
const LEGACY_PATHS = (name) => [
  { rel: `.claude/skills/${name}`, check: 'SKILL.md' },
  { rel: `.agents/skills/${name}`, check: 'SKILL.md' },
  { rel: `.cursor/commands/${name}.md` },
  { rel: `.gemini/commands/${name}.toml` },
];

export function removeLegacyCommands(cwd) {
  const results = [];
  for (const name of LEGACY_NAMES) {
    for (const { rel, check } of LEGACY_PATHS(name)) {
      const target = path.join(cwd, rel);
      const file = check ? path.join(target, check) : target;
      if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes('ux-validate')) continue;
      fs.rmSync(target, { recursive: true, force: true });
      results.push({ rel, status: 'removed' });
    }
  }
  return results;
}

/** --personas all | none | id,id (modo não interativo). */
function presetIdsFromOption(value = 'all') {
  const all = loadPresets().map((p) => p.persona.id);
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length || ids.includes('all')) return all;
  if (ids.includes('none')) return [];
  const unknown = ids.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(t('init.unknownPersonas', { list: unknown.join(', '), valid: all.join(', ') }));
  return ids;
}

function defaultAnswers(tools, personas, framework) {
  const locale = getLocale();
  const targets = tools ? tools.split(',').map((s) => s.trim()).filter(Boolean) : ['claude-code'];
  const unknown = targets.filter((id) => !ADAPTERS.some((a) => a.id === id));
  if (unknown.length) throw new Error(t('init.unknownTool', { list: unknown.join(', '), valid: ADAPTERS.map((a) => a.id).join(', ') }));
  return {
    locale,
    targets,
    url: framework?.url ?? 'http://localhost:3000',
    start: framework?.start ?? '',
    viewports: ['mobile', 'desktop'],
    language: locale,
    standalone: null,
    presetIds: presetIdsFromOption(personas),
    createPersonas: false,
  };
}

async function ask(framework) {
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
    // Várias ferramentas podem ser escolhidas: cada uma recebe os comandos no seu formato.
  });

  if (framework) console.log(t('init.frameworkDetected', { name: framework.label }));
  const url = await input({ message: t('init.urlQ'), default: framework?.url ?? 'http://localhost:3000', validate: validateUrl });
  const start = await input({ message: t('init.startQ'), default: framework?.start ?? '' });

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

  // Na ferramenta de IA (ex.: /ux-fix no Claude Code) o modelo é o da própria ferramenta.
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

  const { presetIds, createPersonas } = await askPersonas();

  return { locale, targets, url, start, viewports, language, standalone, presetIds, createPersonas };
}

/** Passo obrigatório: mostra as personas pré-definidas e pede para usar, criar ou as duas coisas. */
async function askPersonas() {
  const presets = loadPresets();
  console.log(t('init.personasIntro'));
  for (const { persona } of presets) console.log(`${describePersona(persona)}\n`);

  const choice = await select({
    message: t('init.personasQ'),
    choices: ['presets', 'create', 'both'].map((value) => ({ name: t(`init.personaChoices.${value}`), value })),
  });
  let presetIds = [];
  if (choice !== 'create') {
    presetIds = await checkbox({
      message: t('init.presetsQ'),
      required: true,
      choices: presets.map(({ persona }) => ({ name: `${persona.name} (${persona.id})`, value: persona.id, checked: true })),
    });
  }
  return { presetIds, createPersonas: choice !== 'presets' };
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
    crawl: { maxPages: 20, checkExternalLinks: false, routes: [] },
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

function printNextSteps(a, cwd) {
  console.log(t('init.next.title'));
  const n = countPersonas(cwd);
  const dir = `${WORK_DIR}/personas`;
  console.log(n ? t('init.next.personas', { dir, n }) : t('init.next.noPersonas', { dir }));
  if (a.targets.length) {
    console.log(t('init.next.useTools'));
    for (const id of a.targets) console.log(t(`init.next.tools.${id}`));
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
