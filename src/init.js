import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { PROVIDERS, VIEWPORTS, WORK_DIR, RUNS_DIR } from './config.js';
import { ADAPTERS, SOURCE_DIR, loadCommands } from './adapters/index.js';
import { writeFile } from './files.js';
import { PROJECT_DICTIONARY } from './spelling.js';

const LANGUAGES = [
  { name: 'Português (Brasil)', value: 'pt-BR' },
  { name: 'Inglês', value: 'en' },
  { name: 'Espanhol', value: 'es' },
  { name: 'Outro (sem verificação ortográfica)', value: 'outro' },
];

const DICTIONARY_TEMPLATE = `# Dicionário do projeto para a verificação ortográfica do ux-validate.
# Uma palavra por linha: nomes próprios, marcas e termos técnicos que estão corretos
# mas que o dicionário não conhece. Linhas começando com # são ignoradas.
`;

export async function init({ cwd, yes = false, force = false }) {
  console.log('\nux-validate: configuração');
  // Carrega os comandos antes de gravar qualquer arquivo, para não deixar uma instalação pela metade.
  const commands = loadCommands();
  const answers = yes ? defaultAnswers() : await ask();

  const results = [];
  results.push(writeFile(cwd, 'ux-validate.config.yml', renderConfig(answers), { force }));

  // Referências (heurísticas, formato de saída) são compartilhadas por todas as ferramentas.
  for (const file of fs.readdirSync(path.join(SOURCE_DIR, 'references'))) {
    const content = fs.readFileSync(path.join(SOURCE_DIR, 'references', file), 'utf8');
    results.push(writeFile(cwd, `${WORK_DIR}/references/${file}`, content, { force: true }));
  }

  results.push(writeFile(cwd, PROJECT_DICTIONARY, DICTIONARY_TEMPLATE));

  if (answers.examplePersonas) {
    for (const file of fs.readdirSync(path.join(SOURCE_DIR, 'personas'))) {
      const content = fs.readFileSync(path.join(SOURCE_DIR, 'personas', file), 'utf8');
      results.push(writeFile(cwd, `${WORK_DIR}/personas/${file}`, content));
    }
  }

  for (const id of answers.targets) {
    const adapter = ADAPTERS.find((a) => a.id === id);
    results.push(...adapter.install({ cwd, commands, force }));
  }

  results.push(ensureGitignore(cwd));

  console.log('');
  for (const r of results) console.log(`  ${r.status.padEnd(10)} ${r.rel}`);
  printNextSteps(answers);
}

function defaultAnswers() {
  return {
    targets: ['claude-code'],
    url: 'http://localhost:3000',
    start: '',
    viewports: ['mobile', 'desktop'],
    language: 'pt-BR',
    standalone: null,
    examplePersonas: true,
  };
}

async function ask() {
  const targets = await checkbox({
    message: 'Em qual ferramenta de IA você vai usar os comandos?',
    required: true,
    choices: ADAPTERS.map((a) => ({
      name: a.label,
      value: a.id,
      checked: a.id === 'claude-code',
      disabled: a.available ? false : '(em breve)',
    })),
  });

  const url = await input({
    message: 'URL da aplicação a ser testada (ex.: http://localhost:3000):',
    default: 'http://localhost:3000',
    validate: validateUrl,
  });
  const start = await input({
    message: 'Comando para subir a aplicação (opcional, ex.: npm run dev):',
    default: '',
  });

  const viewports = await checkbox({
    message: 'Tamanhos de tela:',
    required: true,
    choices: Object.entries(VIEWPORTS).map(([id, v]) => ({
      name: `${id} (${v.width}×${v.height})`,
      value: id,
      checked: id !== 'tablet',
    })),
  });

  const language = await select({ message: 'Idioma do conteúdo da aplicação (para a verificação ortográfica):', choices: LANGUAGES });

  // Na ferramenta de IA (ex.: /persona-fix no Claude Code) o modelo é o da própria ferramenta.
  // Pelo terminal (npx ux-validate fix, CI), o ux-validate chama o provedor direto, com a chave do usuário.
  let standalone = null;
  console.log(
    '\n  Para aplicar correções pelo terminal (npx ux-validate fix), o ux-validate chama um modelo de linguagem\n' +
      '  com a SUA API key; o consumo de tokens é cobrado na sua conta do provedor.',
  );
  const wantsStandalone = await confirm({
    message: 'Configurar um modelo para aplicar correções pelo terminal?',
    default: false,
  });
  if (wantsStandalone) {
    const provider = await select({
      message: 'Provedor do modelo de linguagem:',
      choices: Object.entries(PROVIDERS).map(([id, p]) => ({ name: p.label, value: id })),
    });
    const info = PROVIDERS[provider];
    const model = await input({
      message: 'Modelo:',
      default: info.defaultModel,
      required: true,
    });
    standalone = { provider, model };
    if (info.apiKeyEnv) {
      standalone.apiKeyEnv = await input({
        message: 'Nome da variável de ambiente que guarda a sua API key (a chave não fica no arquivo):',
        default: info.apiKeyEnv,
      });
    }
    if (info.baseUrl) {
      standalone.baseUrl = await input({ message: 'Endereço do servidor:', default: info.baseUrl });
    }
  }

  const examplePersonas = await confirm({ message: 'Criar personas de exemplo?', default: true });

  return { targets, url, start, viewports, language, standalone, examplePersonas };
}

function validateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'URL inválida. Exemplo: http://localhost:3000';
  }
  if (url.protocol === 'file:') {
    if (!fs.existsSync(fileURLToPath(url))) return 'Esse arquivo não existe. Confira o caminho ou use a URL de um servidor (http://...).';
    return true;
  }
  return ['http:', 'https:'].includes(url.protocol) || 'Use uma URL que comece com http://, https:// ou file://';
}

function renderConfig(a) {
  const config = {
    targets: a.targets,
    app: { url: a.url, ...(a.start ? { start: a.start } : {}) },
    personas: `${WORK_DIR}/personas`,
    viewports: a.viewports,
    language: a.language === 'outro' ? 'outro' : a.language,
    spelling: { enabled: a.language !== 'outro', ignore: [] },
    crawl: { maxPages: 20, checkExternalLinks: false },
    agent: { maxStepsPerGoal: 15 },
    ...(a.standalone ? { standalone: a.standalone } : {}),
  };
  return (
    '# Configuração do ux-validate. Documentação: README.md do projeto ux-validate.\n' +
    '# A API key nunca fica neste arquivo: informe só o nome da variável de ambiente.\n' +
    YAML.stringify(config)
  );
}

function ensureGitignore(cwd) {
  const file = path.join(cwd, '.gitignore');
  const line = `${RUNS_DIR}/`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split('\n').some((l) => l.trim() === line)) return { rel: '.gitignore', status: 'mantido' };
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, `${current}${prefix}# ux-validate: resultados das execuções\n${line}\n`);
  return { rel: '.gitignore', status: current ? 'atualizado' : 'criado' };
}

function printNextSteps(a) {
  console.log('\nPróximos passos:');
  console.log(`  1. Revise as personas em ${WORK_DIR}/personas/ (ou crie as suas).`);
  if (a.targets.includes('claude-code')) {
    console.log('  2. Abra o Claude Code neste projeto e aprove o servidor MCP "playwright".');
    console.log('  3. Rode /persona-test  (ou /persona-test <persona> para uma só).');
  }
  if (a.targets.includes('claude-code')) console.log('  4. Para aplicar as correções do relatório: /persona-fix');
  if (a.standalone) {
    console.log(`\n  Correções pelo terminal: npx ux-validate fix (modelo ${a.standalone.provider} · ${a.standalone.model}).`);
    if (a.standalone.apiKeyEnv) {
      console.log(`  Antes, defina a variável ${a.standalone.apiKeyEnv} com a sua API key:`);
      console.log(`    PowerShell: $env:${a.standalone.apiKeyEnv}="sua-chave"`);
      console.log(`    macOS/Linux: export ${a.standalone.apiKeyEnv}=sua-chave`);
    }
  }
  console.log('');
}
