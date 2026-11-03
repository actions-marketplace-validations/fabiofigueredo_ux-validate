#!/usr/bin/env node
import { parseArgs } from 'node:util';

const HELP = `persona-qa — testes de conteúdo, navegação e interface guiados por personas

Uso:
  persona-qa init   [--yes] [--force]          Configura o projeto e instala os comandos no seu agente de IA
  persona-qa check  [--out <dir>] [--url <url>] Roda as checagens fixas (acessibilidade, links, console, conteúdo)
  persona-qa report [--run <dir>]               Gera report.md e report.html a partir de uma execução

Opções gerais:
  --config <arquivo>   Caminho do arquivo de configuração (padrão: persona-qa.config.yml)
  -h, --help           Mostra esta ajuda
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: 'boolean', short: 'y' },
    force: { type: 'boolean' },
    out: { type: 'string' },
    url: { type: 'string' },
    run: { type: 'string' },
    config: { type: 'string', default: 'persona-qa.config.yml' },
    help: { type: 'boolean', short: 'h' },
  },
});

const [command] = positionals;

if (values.help || !command) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}

try {
  switch (command) {
    case 'init': {
      const { init } = await import('../src/init.js');
      await init({ cwd: process.cwd(), yes: values.yes, force: values.force });
      break;
    }
    case 'check': {
      const { runChecks } = await import('../src/checks.js');
      await runChecks({ cwd: process.cwd(), configPath: values.config, out: values.out, url: values.url });
      break;
    }
    case 'report': {
      const { buildReport } = await import('../src/report.js');
      await buildReport({ cwd: process.cwd(), run: values.run });
      break;
    }
    default:
      console.error(`Comando desconhecido: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
} catch (err) {
  if (err?.name === 'ExitPromptError') process.exit(130); // Ctrl+C no setup
  console.error(`\n✖ ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
}
