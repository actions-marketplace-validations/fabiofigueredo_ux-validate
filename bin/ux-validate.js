#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { t, setLocale, detectLocale, normalizeLocale } from '../src/i18n.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: 'boolean', short: 'y' },
    force: { type: 'boolean' },
    out: { type: 'string' },
    url: { type: 'string' },
    run: { type: 'string' },
    ids: { type: 'string' },
    severity: { type: 'string' },
    'dry-run': { type: 'boolean' },
    lang: { type: 'string' },
    tools: { type: 'string' },
    config: { type: 'string', default: 'ux-validate.config.yml' },
    help: { type: 'boolean', short: 'h' },
  },
});

// Idioma da ferramenta: --lang > `locale` da configuração > idioma do sistema.
setLocale(normalizeLocale(values.lang) ?? configLocale(values.config) ?? detectLocale());

const [command] = positionals;

if (values.help || !command) {
  console.log(t('cli.help'));
  process.exit(values.help ? 0 : 1);
}

try {
  switch (command) {
    case 'init': {
      const { init } = await import('../src/init.js');
      await init({ cwd: process.cwd(), yes: values.yes || Boolean(values.tools), force: values.force, tools: values.tools });
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
    case 'persona': {
      const { newPersona, validatePersonas } = await import('../src/persona.js');
      const [, action, ...files] = positionals;
      if (action === 'new') await newPersona({ cwd: process.cwd(), configPath: values.config, force: values.force });
      else if (action === 'validate') validatePersonas({ cwd: process.cwd(), configPath: values.config, files });
      else {
        console.error(`${t('cli.unknownCommand', { command: `persona ${action ?? ''}`.trim() })}\n`);
        console.log(t('cli.help'));
        process.exit(1);
      }
      break;
    }
    case 'fix': {
      const { fix } = await import('../src/fix.js');
      await fix({
        cwd: process.cwd(),
        configPath: values.config,
        run: values.run,
        ids: values.ids,
        severity: values.severity,
        yes: values.yes,
        dryRun: values['dry-run'],
      });
      break;
    }
    default:
      console.error(`${t('cli.unknownCommand', { command })}\n`);
      console.log(t('cli.help'));
      process.exit(1);
  }
} catch (err) {
  if (err?.name === 'ExitPromptError') process.exit(130); // Ctrl+C no setup
  console.error(`\n✖ ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
}

function configLocale(configPath) {
  try {
    const file = path.resolve(process.cwd(), configPath);
    if (!fs.existsSync(file)) return null;
    return normalizeLocale(YAML.parse(fs.readFileSync(file, 'utf8'))?.locale);
  } catch {
    return null;
  }
}
