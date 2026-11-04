import fs from 'node:fs';
import path from 'node:path';
import { t } from './i18n.js';

/**
 * Suporte a aplicações React (e outras SPAs):
 * - detecta o React na página e se o build é de desenvolvimento;
 * - liga cada problema ao componente que gerou o elemento e ao arquivo/linha do código-fonte
 *   (React 19: `_debugStack`; React 16–18: `_debugSource`), usando o source map do servidor de desenvolvimento;
 * - traduz os avisos do React no console (key, hidratação, aninhamento inválido…) em problemas próprios;
 * - testa a troca de rota no navegador (sem recarregar): título, foco e anúncio para leitores de tela.
 */

/** Roda na página: o React está presente? Em modo de desenvolvimento? */
export async function detectReact(page) {
  return page
    .evaluate(() => {
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      const renderers = hook?.renderers ? [...hook.renderers.values()] : [];
      const anyFiber = [...document.querySelectorAll('body *')].slice(0, 400).some((el) => Object.keys(el).some((k) => k.startsWith('__reactFiber$')));
      const container = [...document.querySelectorAll('body *')].slice(0, 50).find((el) => Object.keys(el).some((k) => k.startsWith('__reactContainer$')));
      if (!renderers.length && !anyFiber && !container) return null;
      const version = renderers[0]?.version ?? null;
      // bundleType 1 = desenvolvimento; sem o hook, procura sinais de debug nas fibras.
      let dev = renderers.length ? renderers.some((r) => r.bundleType === 1) : null;
      if (dev == null) {
        const el = [...document.querySelectorAll('body *')].find((e) => Object.keys(e).some((k) => k.startsWith('__reactFiber$')));
        const fiber = el && el[Object.keys(el).find((k) => k.startsWith('__reactFiber$'))];
        dev = Boolean(fiber && ('_debugOwner' in fiber || '_debugSource' in fiber));
      }
      return { version, dev, next: Boolean(window.next || document.getElementById('__next') || window.__NEXT_DATA__) };
    })
    .catch(() => null);
}

/**
 * Roda na página: para cada alvo (seletor CSS ou trecho de texto), devolve os componentes React
 * que renderizaram o elemento e o local do JSX (pilha do React 19 ou _debugSource).
 */
function inspectTargets(targets) {
  const fiberOf = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
      if (key) return node[key];
    }
    return null;
  };
  const nameOf = (type) => {
    if (!type) return null;
    if (typeof type === 'function') return type.displayName || type.name || null;
    if (typeof type === 'object') return type.displayName || nameOf(type.render) || nameOf(type.type) || null;
    return null;
  };
  const byText = (text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent.includes(text)) return n.parentElement;
    }
    // O texto pode estar dividido entre nós (ex.: "Olá, {nome}"): procura no elemento mais interno.
    let best = null;
    for (const el of document.querySelectorAll('body *')) if (el.textContent.includes(text)) best = el;
    return best;
  };
  return targets.map(({ selector, text }) => {
    let el = null;
    try {
      if (selector) el = document.querySelector(selector);
    } catch {
      // Seletor que o navegador não entende: tenta pelo texto.
    }
    if (!el && text) el = byText(text);
    const host = el && fiberOf(el);
    if (!host) return null;
    const components = [];
    for (let f = host; f && components.length < 4; f = f.return) {
      const name = nameOf(f.type);
      if (name && typeof f.type !== 'string' && !components.includes(name)) components.push(name);
    }
    // Onde o JSX do elemento foi escrito: React 19 guarda uma pilha; React 16–18, o arquivo e a linha.
    let source = null;
    for (let f = host; f && !source; f = f.return) {
      if (f._debugSource?.fileName) source = { file: f._debugSource.fileName, line: f._debugSource.lineNumber, mapped: true };
      else if (f._debugStack?.stack) source = { stack: String(f._debugStack.stack) };
      if (typeof f.type !== 'string' && !source) break;
    }
    return { components, source };
  });
}

/** Primeiro quadro da pilha que é código do projeto (nem o React, nem dependências pré-empacotadas). */
export function projectFrame(stack) {
  for (const line of String(stack).split('\n').slice(1)) {
    const m = line.match(/\(?((?:https?|file|webpack-internal):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const url = m[1];
    if (/node_modules|\/\.vite\/deps\/|react-dom|react_jsx|jsx-dev-runtime|\/_next\/static\/chunks\/(?:framework|main|webpack)/.test(url)) continue;
    return { url, line: Number(m[2]), column: Number(m[3]) };
  }
  return null;
}

/** Caminho do arquivo no projeto a partir da URL servida (Vite, webpack, Next.js) ou de um caminho absoluto. */
export function projectPath(cwd, ref) {
  if (!ref) return null;
  let candidate = String(ref);
  if (candidate.startsWith('webpack-internal:')) candidate = candidate.replace(/^webpack-internal:\/+(?:\([^)]*\)\/)?/, '');
  else if (/^(https?|file):/.test(candidate)) {
    const url = new URL(candidate);
    candidate = decodeURIComponent(url.pathname);
    if (url.protocol === 'file:') candidate = candidate.replace(/^\/([A-Za-z]:)/, '$1');
  }
  candidate = candidate.replace(/[?#].*$/, '').replace(/^\/@fs/, '');
  const tries = [];
  if (path.isAbsolute(candidate)) tries.push(candidate);
  tries.push(path.join(cwd, candidate.replace(/^\.?\/+/, '')));
  for (const abs of tries) {
    const rel = path.relative(cwd, abs).split(path.sep).join('/');
    if (!rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes('node_modules') && fs.existsSync(abs) && fs.statSync(abs).isFile()) return rel;
  }
  return null;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodifica os `mappings` de um source map (VLQ base64) em linhas de segmentos. */
export function decodeMappings(mappings) {
  const lines = [];
  let source = 0;
  let origLine = 0;
  let origCol = 0;
  let name = 0;
  for (const lineText of mappings.split(';')) {
    const segments = [];
    let genCol = 0;
    for (const seg of lineText.split(',')) {
      if (!seg) continue;
      const values = [];
      let value = 0;
      let shift = 0;
      for (const ch of seg) {
        const digit = B64.indexOf(ch);
        value += (digit & 31) << shift;
        if (digit & 32) shift += 5;
        else {
          values.push(value & 1 ? -(value >>> 1) : value >>> 1);
          value = 0;
          shift = 0;
        }
      }
      genCol += values[0];
      if (values.length >= 4) {
        source += values[1];
        origLine += values[2];
        origCol += values[3];
        if (values.length >= 5) name += values[4];
        segments.push([genCol, source, origLine, origCol]);
      }
    }
    lines.push(segments);
  }
  return lines;
}

/** Posição original (arquivo e linha, base 1) de uma posição gerada (linha e coluna, base 1). */
export function originalPosition(map, line, column) {
  const lines = decodeMappings(map.mappings ?? '');
  const segments = lines[line - 1] ?? [];
  let hit = null;
  for (const s of segments) {
    if (s[0] <= column - 1) hit = s;
    else break;
  }
  hit ??= segments[0];
  if (!hit) return null;
  const source = map.sources?.[hit[1]];
  if (source == null) return null;
  const root = map.sourceRoot ? map.sourceRoot.replace(/\/?$/, '/') : '';
  return { source: source.startsWith('/') || /^[a-z]+:/i.test(source) ? source : root + source, line: hit[2] + 1 };
}

/** Lê o source map de um módulo servido (inline, como no Vite, ou em `sourceMappingURL` externo). */
async function sourceMapFor(request, url, cache) {
  if (cache.has(url)) return cache.get(url);
  let map = null;
  try {
    const res = await request.get(url, { timeout: 5000 });
    if (res.ok()) {
      const code = await res.text();
      const ref = code.match(/\/\/[#@] sourceMappingURL=(\S+)\s*$/m)?.[1];
      if (ref?.startsWith('data:')) {
        const [, payload] = ref.split(',');
        map = JSON.parse(/;base64/.test(ref) ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload));
      } else if (ref) {
        const mapRes = await request.get(new URL(ref, url).href, { timeout: 5000 });
        if (mapRes.ok()) map = await mapRes.json();
      }
    }
  } catch {
    map = null;
  }
  cache.set(url, map);
  return map;
}

/**
 * Acrescenta `react` (componentes) e `sourceHint` (arquivo e linha) aos problemas de uma página.
 * Só faz sentido no build de desenvolvimento: em produção os nomes são minificados e não há pilhas.
 */
export async function annotateFindings(page, findings, { cwd, request, cache = new Map() }) {
  const targets = findings.map((f) => ({
    selector: firstSelector(f.evidence?.selector),
    text: textTarget(f),
  }));
  if (!targets.some((x) => x.selector || x.text)) return;
  const infos = await page.evaluate(inspectTargets, targets).catch(() => []);

  for (let i = 0; i < findings.length; i++) {
    const info = infos[i];
    if (!info?.components?.length && !info?.source) continue;
    const f = findings[i];
    if (info.components?.length) f.react = { components: info.components };
    if (f.sourceHint?.file) continue;
    const hint = await resolveSource(info.source, { cwd, request, cache });
    if (hint) f.sourceHint = hint;
  }
}

async function resolveSource(source, { cwd, request, cache }) {
  if (!source) return null;
  if (source.mapped) {
    const file = projectPath(cwd, source.file);
    return file ? { file, ...(source.line ? { line: source.line } : {}) } : null;
  }
  const frame = projectFrame(source.stack);
  if (!frame) return null;
  const file = projectPath(cwd, frame.url);
  // A linha da pilha é a do código transformado; o source map do servidor diz a linha do arquivo original.
  if (/^https?:/.test(frame.url) && request) {
    const map = await sourceMapFor(request, frame.url, cache);
    const pos = map && originalPosition(map, frame.line, frame.column);
    if (pos) {
      const original = projectPath(cwd, pos.source) ?? file;
      if (original) return { file: original, line: pos.line };
    }
  }
  return file ? { file } : null;
}

function firstSelector(selector) {
  const first = String(selector ?? '').split('|')[0].trim();
  return first || null;
}

function textTarget(f) {
  const term = (f.evidence?.terms ?? []).find((x) => typeof x === 'string' && x.length >= 3 && !x.startsWith('<') && !/^https?:/.test(x));
  return term ?? null;
}

/** Avisos e erros do React no console, separados por tipo (o resto continua em "erros de console"). */
const REACT_MESSAGES = [
  { key: 'hydration', re: /hydrat(ion|ed)|server rendered (HTML|text) didn't match|did not match\. Server:/i, severity: 'high', category: 'ui' },
  { key: 'key', re: /unique "key" prop/i, severity: 'low', category: 'ui' },
  { key: 'nesting', re: /validateDOMNesting|cannot (be a descendant|contain a nested)|cannot appear as a (child|descendant) of/i, severity: 'medium', category: 'accessibility' },
  { key: 'updateDepth', re: /Maximum update depth exceeded|Too many re-renders/i, severity: 'high', category: 'ui' },
  { key: 'renderError', re: /error occurred in the <(\w+)> component|The above error occurred in the <(\w+)>/i, severity: 'critical', category: 'ui' },
  { key: 'controlled', re: /changing an? (un)?controlled input|A component is changing/i, severity: 'low', category: 'ui' },
];

export const isReactMessage = (text) => REACT_MESSAGES.some((k) => k.re.test(text));

export function classifyConsole(messages) {
  const react = new Map();
  const other = [];
  for (const text of messages) {
    const kind = REACT_MESSAGES.find((k) => k.re.test(text));
    if (!kind) {
      other.push(text);
      continue;
    }
    const entry = react.get(kind.key) ?? { ...kind, messages: [], components: new Set() };
    entry.messages.push(text);
    for (const m of text.matchAll(/render method of `(\w+)`|in the <(\w+)> component|The above error occurred in the <(\w+)>/g)) {
      entry.components.add(m[1] ?? m[2] ?? m[3]);
    }
    react.set(kind.key, entry);
  }
  return { react: [...react.values()], other };
}

/** Mensagens do React chegam com marcadores %s; limpa para o relatório. */
export function cleanReactMessage(text) {
  return String(text).replace(/%[sdoOc]/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 400);
}

/**
 * Troca de rota no navegador (pushState): clica num link interno e confere se a página recarregou;
 * se não recarregou, testa título, foco e anúncio, que o navegador faz sozinho numa navegação comum.
 */
export async function checkClientNavigation(page, { base, add }) {
  const result = await page
    .evaluate(async () => {
      const here = location.href.replace(/#.*$/, '');
      const link = [...document.querySelectorAll('a[href]')].find((a) => {
        try {
          const u = new URL(a.href);
          return u.origin === location.origin && u.href.replace(/#.*$/, '') !== here && !a.target && !a.hasAttribute('download') && a.offsetParent !== null;
        } catch {
          return false;
        }
      });
      if (!link) return null;
      window.__uxvMarker = true;
      const before = { title: document.title, url: location.href };
      const live = [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map((el) => el.textContent);
      link.focus();
      link.click();
      await new Promise((r) => setTimeout(r, 800));
      if (!window.__uxvMarker) return null; // recarregou: navegação comum, o navegador cuida do resto
      if (location.href === before.url) return null; // o link não trocou de rota
      const active = document.activeElement;
      const focusMoved = active && active !== document.body && active !== link && document.contains(active);
      const liveAfter = [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map((el) => el.textContent);
      const announced = liveAfter.some((text, i) => text.trim() && text !== live[i]);
      return {
        from: before.url,
        to: location.href,
        linkText: (link.innerText || link.getAttribute('aria-label') || '').trim().slice(0, 60),
        titleChanged: document.title !== before.title,
        title: document.title,
        focusMoved,
        announced,
      };
    })
    .catch(() => null);
  if (!result) return null;

  if (!result.focusMoved && !result.announced) {
    add({
      ...base,
      source: 'check:spa',
      category: 'accessibility',
      severity: 'medium',
      rule: 'route-change-not-announced',
      title: t('react.routeFocus.title'),
      description: t('react.routeFocus.description', { link: result.linkText || result.to, to: result.to }),
      heuristic: 'WCAG 2.4.3 (Focus Order), 4.1.3 (Status Messages)',
      evidence: { snippet: `${result.from} → ${result.to}`, terms: result.linkText ? [result.linkText] : [] },
      suggestion: t('react.routeFocus.suggestion'),
    });
  }
  if (!result.titleChanged) {
    add({
      ...base,
      source: 'check:spa',
      category: 'accessibility',
      severity: 'low',
      rule: 'route-title-unchanged',
      title: t('react.routeTitle.title'),
      description: t('react.routeTitle.description', { title: result.title, to: result.to }),
      heuristic: 'WCAG 2.4.2 (Page Titled)',
      evidence: { snippet: `<title>${result.title}</title>`, terms: result.title ? [`<title>${result.title}</title>`] : [] },
      suggestion: t('react.routeTitle.suggestion'),
    });
  }
  return result;
}

/**
 * Lê o package.json do projeto e sugere a URL e o comando do servidor de desenvolvimento.
 * O servidor de desenvolvimento é o recomendado: só nele o React informa componentes e arquivos de origem.
 */
const FRAMEWORKS = [
  { id: 'next', label: 'Next.js', dep: 'next', url: 'http://localhost:3000', script: 'dev' },
  { id: 'react-router', label: 'React Router', dep: '@react-router/dev', url: 'http://localhost:5173', script: 'dev' },
  { id: 'remix', label: 'Remix', dep: '@remix-run/dev', url: 'http://localhost:5173', script: 'dev' },
  { id: 'gatsby', label: 'Gatsby', dep: 'gatsby', url: 'http://localhost:8000', script: 'develop' },
  { id: 'cra', label: 'Create React App', dep: 'react-scripts', url: 'http://localhost:3000', script: 'start' },
  { id: 'vite', label: 'Vite', dep: 'vite', url: 'http://localhost:5173', script: 'dev' },
];

export function detectFramework(cwd) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.react) return null;
  const fw = FRAMEWORKS.find((f) => deps[f.dep]) ?? null;
  const scripts = pkg.scripts ?? {};
  const script = fw && scripts[fw.script] ? fw.script : ['dev', 'start', 'develop'].find((s) => scripts[s]);
  // Porta explícita no script (ex.: "vite --port 4000", "next dev -p 4000").
  const port = script && scripts[script].match(/(?:--port[ =]|-p\s+)(\d{2,5})/)?.[1];
  let url = fw?.url ?? 'http://localhost:3000';
  if (port) url = url.replace(/:\d+$/, `:${port}`);
  return {
    id: fw?.id ?? 'react',
    label: fw ? `React · ${fw.label}` : 'React',
    url,
    start: script ? (script === 'start' ? 'npm start' : `npm run ${script}`) : '',
  };
}
