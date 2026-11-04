import fs from 'node:fs';
import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { loadConfig, latestRunDir, WORK_DIR } from './config.js';
import { analyze } from './report.js';
import { completeJson, checkCredentials, FatalLlmError } from './llm.js';

/**
 * `ux-validate fix`: aplica as correções do relatório usando o modelo escolhido no setup
 * (bloco `standalone`), com os tokens da conta do próprio usuário.
 *
 * Segurança: o modelo só propõe trocas de texto exato ("find" → "replace") dentro do arquivo
 * enviado; cada troca é validada, mostrada como diff e só então gravada, com backup.
 */

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const SOURCE_EXTENSIONS = /\.(html?|jsx?|tsx?|mjs|cjs|vue|svelte|astro|mdx?|css|scss|sass|less|json|ya?ml|php|erb|hbs|ejs|njk|liquid)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', WORK_DIR, 'dist', 'build', '.next', '.nuxt', '.svelte-kit', 'out', 'coverage', '.cache', 'vendor']);
const MAX_FILE_BYTES = 200 * 1024;
const MAX_SCAN_FILES = 3000;

const SYSTEM_PROMPT = `Você corrige problemas de conteúdo, navegação, interface e acessibilidade em arquivos de uma aplicação web.
Você recebe um arquivo do projeto e uma lista de problemas encontrados por um teste de UX. Para cada problema que pode ser corrigido neste arquivo, proponha edições.

Regras:
- Cada edição troca um trecho exato do arquivo ("find") por um novo trecho ("replace"). Copie "find" exatamente como está no arquivo, com espaços e quebras de linha, e inclua contexto suficiente para que ele apareça uma única vez.
- Faça a menor mudança que resolve o problema. Mantenha o estilo, a indentação e as convenções do arquivo. Não reformate nem refatore o que não tem relação com o problema.
- Prefira HTML nativo e semântico a ARIA (ex.: <button> em vez de <div role="button">), seguindo o WAI-ARIA Authoring Practices.
- Textos para o usuário final ficam no idioma do site, claros e naturais.
- Nunca invente dados: telefones, preços, endereços, depoimentos, números de clientes, nomes. Se a correção depende de uma informação que você não tem, pule o problema e explique o que falta.
- Se o problema não está neste arquivo, ou a correção exige mudanças em outros arquivos, pule e explique.
- Escreva "explanation" e "reason" em português, em uma frase.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['edits', 'skipped'],
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['findingId', 'find', 'replace', 'explanation'],
        properties: {
          findingId: { type: 'string' },
          find: { type: 'string' },
          replace: { type: 'string' },
          explanation: { type: 'string' },
        },
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['findingId', 'reason'],
        properties: { findingId: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
};

export async function fix({ cwd, configPath, run, ids, severity = 'medium', yes = false, dryRun = false, llm = completeJson, log = console.log }) {
  const config = loadConfig(cwd, configPath);
  if (!config.standalone?.provider || !config.standalone?.model) {
    throw new Error(
      'Nenhum modelo configurado para correções. Rode "npx ux-validate init" e configure o modo standalone ' +
        '(provedor, modelo e API key), ou use /persona-fix dentro do Claude Code.',
    );
  }
  // Confere a credencial antes de qualquer outra coisa (só quando usamos o cliente real).
  if (llm === completeJson) checkCredentials(config.standalone);
  const runDir = run ? path.resolve(cwd, run) : latestRunDir(cwd);
  if (!runDir || !fs.existsSync(runDir)) throw new Error('Nenhuma execução encontrada. Rode "npx ux-validate check" ou /persona-test primeiro.');

  const checks = readJson(path.join(runDir, 'checks.json'));
  const agent = readJson(path.join(runDir, 'findings.json'));
  const { findings } = analyze(checks, agent);

  const wanted = ids ? new Set(ids.split(',').map((s) => s.trim().toUpperCase())) : null;
  const maxSeverity = SEVERITY_ORDER.indexOf(severity);
  if (maxSeverity < 0) throw new Error(`Gravidade inválida: ${severity}. Use: ${SEVERITY_ORDER.join(', ')}.`);
  const selected = findings.filter((f) => (wanted ? wanted.has(f.id) : SEVERITY_ORDER.indexOf(f.severity) <= maxSeverity));
  if (!selected.length) {
    log('Nenhum problema selecionado para corrigir.');
    return { results: [] };
  }

  // 1. Descobre em qual arquivo está cada problema.
  const files = listSourceFiles(cwd);
  const byFile = new Map();
  const results = [];
  for (const f of selected) {
    const file = locateSource(cwd, f, files);
    if (!file) {
      results.push({ findingId: f.id, title: f.title, status: 'not-located', reason: 'Não encontrei o arquivo de origem no projeto.' });
      continue;
    }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(f);
  }

  log(`\n${selected.length} problema(s) selecionado(s); ${byFile.size} arquivo(s) para corrigir.`);
  for (const [file, list] of byFile) log(`  ${file}  ←  ${list.map((f) => f.id).join(', ')}`);
  const notLocated = results.filter((r) => r.status === 'not-located');
  if (notLocated.length) log(`  (sem arquivo identificado: ${notLocated.map((r) => r.findingId).join(', ')})`);
  if (!byFile.size) return finish(runDir, results, { input: 0, output: 0 }, log);

  // 2. Confirma o uso de tokens antes de chamar a API.
  const chars = [...byFile.keys()].reduce((sum, file) => sum + fs.statSync(path.join(cwd, file)).size, 0);
  const estimate = Math.round((chars + 3000 * byFile.size) / 4);
  const { provider, model } = config.standalone;
  log(`\nModelo: ${provider} · ${model}. Estimativa: ~${estimate.toLocaleString('pt-BR')} tokens de entrada, cobrados na sua conta.`);
  if (!yes) {
    if (!process.stdin.isTTY) throw new Error('Confirmação necessária. Rode de novo com --yes para continuar sem perguntar.');
    if (!(await confirm({ message: 'Chamar o modelo para propor as correções?', default: true }))) return { results };
  }

  // 3. Pede as correções arquivo por arquivo, mostra o diff e aplica.
  const usage = { input: 0, output: 0 };
  const backupDir = path.join(runDir, 'fixes', 'backup');
  for (const [file, list] of byFile) {
    log(`\n━━ ${file}`);
    const abs = path.join(cwd, file);
    const original = fs.readFileSync(abs, 'utf8');
    let answer;
    try {
      answer = await llm(config.standalone, { system: SYSTEM_PROMPT, prompt: buildPrompt(file, original, list, config), schema: SCHEMA });
    } catch (err) {
      log(`  ✖ ${err.message}`);
      for (const f of list) results.push({ findingId: f.id, title: f.title, file, status: 'error', reason: err.message });
      if (err instanceof FatalLlmError) {
        log('  Interrompido: corrija o problema acima e rode de novo.');
        break;
      }
      continue;
    }
    usage.input += answer.usage.input;
    usage.output += answer.usage.output;

    const { content, applied, failed } = applyEdits(original, answer.data.edits ?? [], new Set(list.map((f) => f.id)));
    for (const s of answer.data.skipped ?? []) {
      log(`  – ${s.findingId}: pulado. ${s.reason}`);
      results.push({ findingId: s.findingId, title: titleOf(list, s.findingId), file, status: 'skipped', reason: s.reason });
    }
    for (const e of failed) {
      log(`  ✖ ${e.findingId}: edição descartada (${e.reason}).`);
      results.push({ findingId: e.findingId, title: titleOf(list, e.findingId), file, status: 'failed', reason: e.reason });
    }
    if (!applied.length) continue;

    for (const e of applied) {
      log(`\n  ✔ ${e.findingId}: ${e.explanation}`);
      log(renderDiff(e.find, e.replace));
    }
    let write = !dryRun;
    if (write && !yes) write = await confirm({ message: `Gravar ${applied.length} correção(ões) em ${file}?`, default: true });
    if (write) {
      const backup = path.join(backupDir, file);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
      fs.writeFileSync(abs, content);
    }
    const status = write ? 'applied' : dryRun ? 'proposed' : 'declined';
    for (const e of applied) results.push({ findingId: e.findingId, title: titleOf(list, e.findingId), file, status, explanation: e.explanation });
  }

  return finish(runDir, results, usage, log, { model, provider, dryRun });
}

function finish(runDir, results, usage, log, meta = {}) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const report = { createdAt: new Date().toISOString(), ...meta, usage, results };
  fs.mkdirSync(path.join(runDir, 'fixes'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'fixes', 'fixes.json'), JSON.stringify(report, null, 2));

  log('\nResumo:');
  log(`  ${count('applied')} aplicada(s), ${count('proposed')} proposta(s) sem gravar, ${count('declined')} recusada(s) por você,`);
  log(`  ${count('skipped')} pulada(s) pelo modelo, ${count('failed') + count('error')} com erro, ${count('not-located')} sem arquivo identificado.`);
  log(`  Tokens usados: ${usage.input.toLocaleString('pt-BR')} de entrada, ${usage.output.toLocaleString('pt-BR')} de saída.`);
  if (count('applied')) {
    log(`  Backup dos arquivos originais: ${path.relative(process.cwd(), path.join(runDir, 'fixes', 'backup'))}`);
    log('  Revise as mudanças (ex.: git diff) e rode "npx ux-validate check" para confirmar as correções.');
  }
  return report;
}

/** Aplica as edições em sequência; cada "find" precisa aparecer exatamente uma vez. */
export function applyEdits(content, edits, allowedIds) {
  const applied = [];
  const failed = [];
  for (const e of edits) {
    if (!allowedIds.has(e.findingId)) {
      failed.push({ ...e, reason: 'id de problema que não foi enviado para este arquivo' });
      continue;
    }
    if (!e.find) {
      failed.push({ ...e, reason: 'trecho a substituir vazio' });
      continue;
    }
    const first = content.indexOf(e.find);
    if (first < 0) {
      failed.push({ ...e, reason: 'o trecho a substituir não existe no arquivo' });
      continue;
    }
    if (content.indexOf(e.find, first + 1) >= 0) {
      failed.push({ ...e, reason: 'o trecho a substituir aparece mais de uma vez' });
      continue;
    }
    content = content.slice(0, first) + e.replace + content.slice(first + e.find.length);
    applied.push(e);
  }
  return { content, applied, failed };
}

function buildPrompt(file, content, findings, config) {
  const issues = findings.map((f) => ({
    id: f.id,
    categoria: f.category,
    gravidade: f.severity,
    titulo: f.title,
    descricao: f.description,
    pagina: f.page,
    criterio: f.heuristic,
    elemento: f.evidence?.selector,
    trecho: f.evidence?.snippet,
    sugestao: f.suggestion,
  }));
  return [
    `Idioma do conteúdo do site: ${config.language}.`,
    `Arquivo: ${file}`,
    '<arquivo>',
    content,
    '</arquivo>',
    '',
    'Problemas a corrigir neste arquivo:',
    JSON.stringify(issues, null, 2),
  ].join('\n');
}

function renderDiff(find, replace) {
  const pad = (prefix, text) => text.split('\n').map((l) => `    ${prefix} ${l}`).join('\n');
  return `${pad('-', find)}\n${pad('+', replace)}`;
}

const titleOf = (list, id) => list.find((f) => f.id === id)?.title ?? '';

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/* ---------- Localização do arquivo de origem ---------- */

export function listSourceFiles(cwd) {
  const out = [];
  const walk = (dir) => {
    if (out.length >= MAX_SCAN_FILES) return;
    for (const entry of fs.readdirSync(path.join(cwd, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.') {
        if (entry.isDirectory()) continue;
      }
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(rel);
      } else if (SOURCE_EXTENSIONS.test(entry.name) && !/(^|\/)(package-lock|pnpm-lock|yarn\.lock)/.test(rel)) {
        const size = fs.statSync(path.join(cwd, rel)).size;
        if (size <= MAX_FILE_BYTES) out.push(rel);
      }
    }
  };
  walk('');
  return out;
}

/** Arquivo indicado pelo agente (sourceHint) ou o arquivo onde aparecem os trechos da evidência. */
export function locateSource(cwd, finding, files) {
  const hint = finding.sourceHint?.file;
  if (hint) {
    const abs = path.resolve(cwd, hint);
    const rel = path.relative(cwd, abs).split(path.sep).join('/');
    if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(abs) && files.includes(rel)) return rel;
  }

  const terms = searchTerms(finding);
  const pageName = finding.page ? decodeURIComponent(new URL(finding.page).pathname.split('/').pop() || 'index.html') : '';
  // Sem trecho que bata (ex.: HTML renderizado diferente do código-fonte): usa o arquivo com o nome da página.
  const byPageName = () => (/\.html?$/i.test(pageName) ? files.find((f) => path.basename(f) === pageName) ?? null : null);
  if (!terms.length) return byPageName();
  let best = null;
  let bestScore = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(cwd, rel), 'utf8');
    let score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    if (!score) continue;
    if (pageName && path.basename(rel) === pageName) score += 0.5; // desempate: arquivo com o nome da página
    if (score > bestScore) {
      best = rel;
      bestScore = score;
    }
  }
  return best ?? byPageName();
}

function searchTerms(f) {
  const terms = new Set(f.evidence?.terms ?? []);
  const snippet = f.evidence?.snippet ?? '';
  for (const line of snippet.split('\n')) {
    // O trecho de HTML inteiro costuma aparecer igual no código-fonte (ex.: <a href="#">Blog</a>).
    const raw = line.trim();
    if (raw.startsWith('<') && raw.length >= 8 && raw.length <= 200) terms.add(raw);
    // Texto visível dentro das tags e atributos marcantes (href, id, class, onclick…).
    for (const text of line.replace(/<[^>]*>/g, '\n').split('\n')) {
      const t = text.replace(/^[…"\s]+|[…"\s]+$/g, '').trim();
      if (t.length >= 8 && !/^(Destino|Linkad[oa]|HTTP)\b/.test(t)) terms.add(t.slice(0, 60));
    }
    // Link quebrado: procura pelo nome da página de destino (ex.: href="sobre.html").
    const dest = line.match(/^Destino: (\S+)/);
    if (dest) {
      const name = decodeURIComponent(new URL(dest[1]).pathname.split('/').pop() ?? '');
      if (name.length >= 4) terms.add(name);
    }
    for (const m of line.matchAll(/\b(?:href|src|id|class|onclick|placeholder|aria-[a-z]+)="([^"]{4,})"/g)) terms.add(m[0]);
  }
  for (const sel of (f.evidence?.selector ?? '').split('|')) {
    const id = sel.match(/#([\w-]{3,})/);
    if (id) terms.add(`id="${id[1]}"`);
  }
  return [...terms].filter((t) => t.length >= 3);
}
