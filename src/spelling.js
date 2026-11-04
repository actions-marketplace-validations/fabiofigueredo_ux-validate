import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { WORK_DIR } from './config.js';

/**
 * Verificação ortográfica offline com Hunspell (WebAssembly) e os dicionários do LibreOffice.
 * Nenhum texto da aplicação sai da máquina.
 */

const require = createRequire(import.meta.url);

// Idioma do conteúdo -> pacote de dicionário. "pt-BR" usa o VERO (LibreOffice Brasil).
const DICTIONARIES = { 'pt-BR': 'dictionary-pt', en: 'dictionary-en', es: 'dictionary-es' };
export const SUPPORTED_LANGUAGES = Object.keys(DICTIONARIES);
export const PROJECT_DICTIONARY = `${WORK_DIR}/dicionario.txt`;

const MAX_SUGGESTIONS = 30; // sugestões são lentas (~0,3 s cada); limitamos por execução
const LIST_LIMIT = 12;

let factoryPromise;

async function loadDictionary(factory, pkg) {
  const dir = path.dirname(require.resolve(pkg)); // index.aff e index.dic ficam ao lado do index.js
  const aff = factory.mountBuffer(fs.readFileSync(path.join(dir, 'index.aff')), `${pkg}.aff`);
  const dic = factory.mountBuffer(fs.readFileSync(path.join(dir, 'index.dic')), `${pkg}.dic`);
  return factory.create(aff, dic);
}

/** Cria o verificador do idioma do conteúdo, com as palavras do dicionário do projeto. */
export async function createSpeller({ cwd, language, ignore = [] }) {
  const lang = normalizeLanguage(language);
  if (!lang) return null;
  const { loadModule } = require('hunspell-asm');
  factoryPromise ??= loadModule();
  const factory = await factoryPromise;
  const main = await loadDictionary(factory, DICTIONARIES[lang]);
  // Para textos em português ou espanhol, o dicionário inglês separa "palavra errada" de "palavra em inglês".
  const english = lang === 'en' ? null : await loadDictionary(factory, DICTIONARIES.en);

  const custom = new Set(ignore.map((w) => w.toLowerCase()));
  const projectDict = path.join(cwd, PROJECT_DICTIONARY);
  if (fs.existsSync(projectDict)) {
    for (const line of fs.readFileSync(projectDict, 'utf8').split(/\r?\n/)) {
      const word = line.replace(/#.*/, '').trim();
      if (word) custom.add(word.toLowerCase());
    }
  }
  const suggestions = new Map();
  const reported = new Set(); // palavras já relatadas em outra página (ex.: menu repetido no site todo)

  const known = (word) => custom.has(word.toLowerCase()) || main.spell(word) || main.spell(word.toLowerCase());
  return {
    language: lang,
    /** Devolve só as palavras ainda não relatadas e as marca como relatadas. */
    firstSeen(entries) {
      const fresh = entries.filter((e) => !reported.has(e.word.toLowerCase()));
      for (const e of fresh) reported.add(e.word.toLowerCase());
      return fresh;
    },
    classify(word) {
      if (known(word)) return 'ok';
      if (word.includes('-') && word.split('-').every((part) => !part || known(part))) return 'ok';
      if (english && (english.spell(word) || english.spell(word.toLowerCase()))) return 'foreign';
      return 'unknown';
    },
    suggest(word) {
      if (suggestions.has(word)) return suggestions.get(word);
      if (suggestions.size >= MAX_SUGGESTIONS) return [];
      const list = main.suggest(word).slice(0, 3);
      suggestions.set(word, list);
      return list;
    },
  };
}

export function normalizeLanguage(language = 'pt-BR') {
  const lower = String(language).toLowerCase();
  if (lower === 'pt' || lower === 'pt-br' || lower === 'pt_br') return 'pt-BR';
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('es')) return 'es';
  return null;
}

/** Extrai o texto que o usuário lê (inclusive alt, title, aria-label e placeholder). */
async function extractText(page) {
  return page.evaluate(() => {
    const SKIP = 'script,style,noscript,code,pre,kbd,samp,var,svg,math,textarea,[translate="no"],[spellcheck="false"],[contenteditable]';
    const visible = (el) => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const segments = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = node.textContent.trim();
      if (!text || !parent || parent.closest(SKIP) || !visible(parent)) continue;
      segments.push(text);
    }
    for (const el of document.querySelectorAll('[alt],[title],[aria-label],[placeholder],input[type=submit][value],input[type=button][value]')) {
      for (const attr of ['alt', 'title', 'aria-label', 'placeholder', 'value']) {
        const value = el.getAttribute(attr)?.trim();
        if (value && (attr !== 'value' || ['submit', 'button'].includes(el.type))) segments.push(value);
      }
    }
    return segments;
  });
}

const WORD = /\p{L}[\p{L}\p{M}'’-]*\p{L}|\p{L}/gu;
// E-mails, URLs e variáveis de template ({{x}}, ${x}) não são palavras do texto.
const NOISE = /\S+@\S+\.\S+|https?:\/\/\S+|www\.\S+|\S+\.(com|br|org|net|io|dev|app)\b\S*|\{\{[^}]*\}\}|\$\{[^}]*\}/gi;
const LOREM = /lorem ipsum|dolor sit amet/i;

/** Encontra palavras desconhecidas no texto de uma página. */
export function findWords(segments, speller) {
  const unknown = new Map();
  const foreign = new Map();
  for (const raw of segments) {
    if (LOREM.test(raw)) continue; // já apontado pela checagem de texto provisório
    const text = raw.replace(NOISE, ' ');
    for (const match of text.matchAll(WORD)) {
      const word = match[0].replace(/^['’-]+|['’-]+$/g, '');
      if (word.length < 3) continue;
      if (/^\p{Lu}+$/u.test(word)) continue; // siglas (CPF, WCAG)
      if (/\p{Lu}/u.test(word.slice(1))) continue; // marcas e camelCase (WhatsApp, iPhone)
      // Palavra com inicial maiúscula fora do começo da frase: provavelmente nome próprio.
      const before = text.slice(0, match.index).trimEnd();
      const sentenceStart = before === '' || /[.!?:;—–\-"“(]$/.test(before);
      if (/^\p{Lu}/u.test(word) && !sentenceStart) continue;

      const kind = speller.classify(word);
      if (kind === 'ok') continue;
      const bucket = kind === 'foreign' ? foreign : unknown;
      const key = word.toLowerCase();
      const entry = bucket.get(key) ?? { word, count: 0, context: context(text, match.index, word.length) };
      entry.count++;
      bucket.set(key, entry);
    }
  }
  return { unknown: [...unknown.values()], foreign: [...foreign.values()] };
}

function context(text, index, length) {
  const start = Math.max(0, index - 35);
  const end = Math.min(text.length, index + length + 35);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

export async function checkSpelling(page, { base, add, shot, speller }) {
  const segments = await extractText(page);
  const found = findWords(segments, speller);
  const unknown = speller.firstSeen(found.unknown);
  const foreign = speller.firstSeen(found.foreign);

  if (unknown.length) {
    const lines = unknown.slice(0, LIST_LIMIT).map((u) => {
      const sug = speller.suggest(u.word);
      return `${u.word}${sug.length ? ` → ${sug.join(', ')}` : ''}   "${u.context}"`;
    });
    add({
      ...base,
      viewport: undefined,
      source: 'check:spelling',
      category: 'content',
      severity: unknown.length >= 3 ? 'medium' : 'low',
      title: 'Possíveis erros de ortografia',
      description:
        `${unknown.length} palavra(s) não reconhecidas pelo dicionário (${speller.language}). ` +
        'Erros de ortografia passam descuido e reduzem a confiança no site. ' +
        `Nomes próprios e termos técnicos podem aparecer aqui: adicione-os a ${PROJECT_DICTIONARY} (uma palavra por linha).`,
      heuristic: 'Confiabilidade do conteúdo (ortografia)',
      evidence: { screenshot: shot, snippet: lines.join('\n'), terms: unknown.map((u) => u.word) },
      suggestion: 'Corrija as palavras usando as sugestões. Para termos corretos que o dicionário não conhece, inclua-os no dicionário do projeto.',
    });
  }

  if (foreign.length && speller.language !== 'en') {
    add({
      ...base,
      viewport: undefined,
      source: 'check:spelling',
      category: 'content',
      severity: 'low',
      title: 'Palavras em inglês no meio do texto',
      description: `${foreign.length} palavra(s) em inglês num conteúdo em ${speller.language}. Quem não lê inglês pode não entender rótulos e botões.`,
      heuristic: 'Nielsen #2: correspondência com o mundo real',
      evidence: {
        screenshot: shot,
        snippet: foreign.slice(0, LIST_LIMIT).map((f) => `${f.word}   "${f.context}"`).join('\n'),
        terms: foreign.map((f) => f.word),
      },
      suggestion: 'Traduza os termos (ex.: "Pricing" → "Preços", "Get started" → "Começar"). Se o termo em inglês for intencional (marca, jargão do público), adicione-o ao dicionário do projeto.',
    });
  }
}
