import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { latestRunDir } from './config.js';
import { analyze } from './report.js';
import { listSourceFiles, locateSource, searchTerms } from './fix.js';
import { t } from './i18n.js';

/**
 * Gera SARIF 2.1.0 a partir de uma execução: o GitHub mostra os problemas na aba Security
 * (code scanning) e como anotações nas linhas alteradas do PR.
 */

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const LEVEL = { critical: 'error', high: 'error', medium: 'warning', low: 'note' };
const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export function buildSarif({ cwd, runDir }) {
  const checks = readJson(path.join(runDir, 'checks.json'));
  const agent = readJson(path.join(runDir, 'findings.json'));
  if (!checks && !agent) throw new Error(t('report.noData', { dir: runDir }));
  const { findings } = analyze(checks, agent);

  const repoRoot = findRepoRoot(cwd);
  const files = listSourceFiles(cwd);
  const rules = new Map();
  const results = [];

  for (const f of findings) {
    const ruleId = ruleIdFor(f);
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        name: ruleId.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')),
        shortDescription: { text: f.title },
        ...(f.suggestion ? { help: { text: f.suggestion } } : {}),
        ...(f.helpUrl ? { helpUri: f.helpUrl } : {}),
        defaultConfiguration: { level: LEVEL[f.severity] ?? 'warning' },
        properties: { tags: ['ux', f.category, ...(f.heuristic ? [f.heuristic] : [])] },
      });
    }

    const location = sourceLocation(cwd, repoRoot, f, files);
    const text = [
      `${f.title}${f.page ? ` (${f.page})` : ''}`,
      f.description,
      f.suggestion ? `${t('report.howToFix')}: ${f.suggestion}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    results.push({
      ruleId,
      level: LEVEL[f.severity] ?? 'warning',
      message: { text },
      locations: [location],
      // Identifica o mesmo problema entre execuções, mesmo que o id (C001…) mude.
      partialFingerprints: { uxValidate: fingerprint(ruleId, f) },
      properties: {
        id: f.id,
        severity: f.severity,
        category: f.category,
        ...(f.page ? { page: f.page } : {}),
        ...(f.viewports?.length ? { viewports: f.viewports } : {}),
        ...(f.affects?.length ? { personas: f.affects } : {}),
        ...(f.evidence?.selector ? { selector: f.evidence.selector } : {}),
      },
    });
  }

  return {
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'ux-validate',
            version,
            informationUri: 'https://github.com/fabiofigueredo/ux-validate',
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };
}

export async function writeSarif({ cwd, run, out }) {
  const runDir = run ? path.resolve(cwd, run) : latestRunDir(cwd);
  if (!runDir || !fs.existsSync(runDir)) throw new Error(t('report.noRun'));
  const sarif = buildSarif({ cwd, runDir });
  const file = out ? path.resolve(cwd, out) : path.join(runDir, 'ux-validate.sarif');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(sarif, null, 2));
  console.log(t('sarif.written', { n: sarif.runs[0].results.length, file: path.relative(cwd, file) }));
  return { file, sarif };
}

/** Regra estável entre idiomas: axe/<regra>, aria/<regra>, links/<regra>… ou persona/<categoria>. */
function ruleIdFor(f) {
  if (f.origin === 'agent') return `persona/${f.category}`;
  const source = (f.source ?? 'check').replace(/^check:/, '');
  return `${source}/${f.rule ?? 'issue'}`;
}

function fingerprint(ruleId, f) {
  const key = [ruleId, f.page ?? '', f.evidence?.selector ?? '', f.sourceHint?.file ?? ''].join('|');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16);
}

/**
 * O code scanning exige um arquivo para cada resultado. Usa o arquivo de origem (sourceHint ou
 * localizado pela evidência) e a linha onde o trecho aparece; sem arquivo, aponta para a configuração.
 */
function sourceLocation(cwd, repoRoot, f, files) {
  const rel = locateSource(cwd, f, files);
  let file = rel;
  let line = f.sourceHint?.line ?? null;
  if (rel && !line) line = findLine(path.join(cwd, rel), searchTerms(f));
  if (!file) {
    file = fs.existsSync(path.join(cwd, 'ux-validate.config.yml')) ? 'ux-validate.config.yml' : null;
    line = 1;
  }
  const uri = file ? toRepoUri(repoRoot, path.join(cwd, file)) : 'ux-validate.config.yml';
  return {
    physicalLocation: {
      artifactLocation: { uri },
      region: { startLine: Math.max(1, line ?? 1) },
    },
    ...(f.page ? { logicalLocations: [{ name: f.page, kind: 'page' }] } : {}),
  };
}

function findLine(file, terms) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const term of terms) {
    const first = term.split('\n')[0];
    const i = lines.findIndex((l) => l.includes(first));
    if (i >= 0) return i + 1;
  }
  return 1;
}

/** Caminho relativo à raiz do repositório Git (é como o GitHub identifica os arquivos). */
function findRepoRoot(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(cwd);
    dir = parent;
  }
}

function toRepoUri(repoRoot, abs) {
  return path.relative(repoRoot, abs).split(path.sep).join('/');
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
