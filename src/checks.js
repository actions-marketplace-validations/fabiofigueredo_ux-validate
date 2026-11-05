import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { VIEWPORTS, SEVERITY_ORDER, loadConfig, newRunDir } from './config.js';
import { runAriaChecks } from './aria.js';
import { runColorVisionChecks } from './color.js';
import { checkSpelling, createSpeller } from './spelling.js';
import { annotateFindings, checkClientNavigation, classifyConsole, cleanReactMessage, detectReact, isReactMessage } from './react.js';
import { t, getLocale } from './i18n.js';

/**
 * Checagens determinísticas: dão o mesmo resultado com qualquer modelo de linguagem.
 * O agente lê o checks.json e só interpreta e prioriza; não precisa "adivinhar" contraste ou links quebrados.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const require = createRequire(import.meta.url);
// Traduções das regras do axe (o axe já fala inglês; para os demais idiomas usamos o arquivo de locale dele).
const AXE_LOCALE_FILES = { 'pt-BR': 'axe-core/locales/pt_BR.json' };
const axeLocaleCache = {};
function axeLocale() {
  const file = AXE_LOCALE_FILES[getLocale()];
  if (!file) return null;
  if (!(file in axeLocaleCache)) {
    try {
      axeLocaleCache[file] = require(file);
    } catch {
      axeLocaleCache[file] = null; // sem tradução: as mensagens ficam em inglês
    }
  }
  return axeLocaleCache[file];
}

const AXE_SEVERITY = { critical: 'critical', serious: 'high', moderate: 'medium', minor: 'low' };

// Textos que não deveriam chegar ao usuário final (comuns em código gerado por IA).
// Os padrões cobrem inglês e português, qualquer que seja o idioma da ferramenta.
const LEFTOVER_PATTERNS = [
  { re: /lorem ipsum|dolor sit amet/i, key: 'lorem', severity: 'high' },
  { re: /\b(TODO|FIXME|XXX)\b/, key: 'todo', severity: 'medium' },
  { re: /\[object Object\]|\bundefined\b|\bNaN\b/, key: 'codeValue', severity: 'high' },
  { re: /\{\{\s*[\w.]+\s*\}\}|\$\{[\w.]+\}/, key: 'template', severity: 'high' },
  { re: /as an ai (language )?model|como (um )?modelo de (linguagem|ia)/i, key: 'aiText', severity: 'high' },
  { re: /\b(your|sua) (company|empresa) (name|aqui)\b|\bacme (inc|corp)\b|john doe|fulano de tal/i, key: 'fakeData', severity: 'medium' },
  { re: /\bplaceholder\b|\bsample text\b|lorem text|coming soon\.\.\.|texto de exemplo|em breve\.\.\./i, key: 'placeholder', severity: 'medium' },
];

export async function runChecks({ cwd, configPath, out, url, failOn }) {
  if (failOn && !SEVERITY_ORDER.includes(failOn)) {
    throw new Error(t('checks.invalidFailOn', { value: failOn, valid: SEVERITY_ORDER.join(', ') }));
  }
  const config = loadConfig(cwd, configPath, { optional: Boolean(url) });
  const startUrl = url ?? config.app.url;
  const runDir = out ? path.resolve(cwd, out) : newRunDir(cwd);
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });

  const browser = await chromium.launch(
    process.env.UX_VALIDATE_CHROMIUM ? { executablePath: process.env.UX_VALIDATE_CHROMIUM } : {},
  );
  const findings = [];
  const add = (f) => findings.push({ id: `C${String(findings.length + 1).padStart(3, '0')}`, ...f });

  try {
    console.log(t('checks.crawling', { url: startUrl, max: config.crawl.maxPages }));
    const { pages, react } = await crawl(browser, startUrl, config, add);
    if (!pages.length) throw new Error(t('checks.cannotOpen', { url: startUrl }));
    if (react) console.log(t(react.dev ? 'react.detectedDev' : 'react.detectedProd', { version: react.version ? ` ${react.version}` : '' }));
    const sourceMaps = new Map();

    let speller = null;
    if (config.spelling.enabled) {
      try {
        speller = await createSpeller({ cwd, language: config.language, ignore: config.spelling.ignore });
        if (!speller) console.warn(t('checks.noDictionary', { language: config.language }));
      } catch (err) {
        console.warn(t('checks.spellingDisabled', { message: err.message }));
      }
    }

    // Teclado e ARIA são testados uma vez por página, de preferência no desktop (onde se usa teclado).
    const keyboardViewport = config.viewports.includes('desktop') ? 'desktop' : config.viewports[0];
    for (const vpName of config.viewports) {
      console.log(t('checks.analyzing', { n: pages.length, viewport: vpName }));
      const context = await browser.newContext({ viewport: VIEWPORTS[vpName], ...pick(VIEWPORTS[vpName]) });
      for (const p of pages.filter((p) => p.ok)) {
        await inspectPage(context, p, vpName, runDir, add, {
          checkContent: vpName === config.viewports[0],
          checkAria: vpName === keyboardViewport,
          // A troca de rota no navegador é testada uma vez, a partir da página inicial.
          checkNavigation: vpName === keyboardViewport && p === pages[0],
          // Visão de cores: uma vez por página, no mesmo tamanho de tela do teste de teclado.
          colorVision: vpName === keyboardViewport && config.colorVision.enabled ? config.colorVision : null,
          speller,
          react: react?.dev ? { cwd, sourceMaps } : null,
        });
      }
      await context.close();
    }

    checkSiteWide(pages, add);

    const result = {
      tool: 'ux-validate',
      kind: 'checks',
      locale: getLocale(),
      url: startUrl,
      createdAt: new Date().toISOString(),
      viewports: config.viewports,
      ...(react ? { app: { framework: react.next ? 'next' : 'react', react } } : {}),
      pages: pages.map(({ url, status, title, ok, soft404, screenshots, ariaTree, colorVision, linksTo }) => ({ url, status, title, ok, ...(soft404 ? { soft404 } : {}), screenshots, ariaTree, ...(colorVision ? { colorVision } : {}), linksTo })),
      findings: dedupe(findings),
    };
    fs.writeFileSync(path.join(runDir, 'checks.json'), JSON.stringify(result, null, 2));

    const count = (s) => result.findings.filter((f) => f.severity === s).length;
    console.log(
      t('checks.summary', {
        total: result.findings.length,
        critical: count('critical'),
        high: count('high'),
        medium: count('medium'),
        low: count('low'),
      }),
    );
    console.log(`  ${path.relative(cwd, path.join(runDir, 'checks.json'))}`);

    // --fail-on: código de saída 2 se houver problema dessa gravidade ou mais grave (para o CI).
    if (failOn) {
      const limit = SEVERITY_ORDER.indexOf(failOn);
      const blocking = result.findings.filter((f) => SEVERITY_ORDER.indexOf(f.severity) <= limit).length;
      if (blocking) {
        console.log(t('checks.failOn', { n: blocking, severity: failOn }));
        process.exitCode = 2;
      }
    }
    return { runDir, result };
  } finally {
    await browser.close();
  }
}

function axeFor(page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS);
}

/** Textos da regra no idioma da ferramenta, quando houver tradução. */
const axeText = (v) => {
  const locale = axeLocale();
  // Regras recentes do axe que ainda não têm tradução oficial ficam no nosso catálogo.
  const extra = locale ? t(`checks.axeExtra.${v.id}`) : null;
  const tr = locale?.rules?.[v.id] ?? (typeof extra === 'object' ? extra : null);
  return { help: tr?.help ?? v.help, description: tr?.description ?? v.description };
};

/** ["wcag2aa", "wcag143"] -> "WCAG 1.4.3" */
function wcagCriteria(tags) {
  const criteria = tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => `WCAG ${t.slice(4, 5)}.${t.slice(5, 6)}.${t.slice(6)}`);
  return criteria.length ? criteria.join(', ') : t('checks.axe.bestPractice');
}

const pick = ({ isMobile, hasTouch }) => ({ isMobile, hasTouch });

/** BFS pelas páginas do mesmo domínio, registrando links quebrados e "#" sem destino. */
async function crawl(browser, startUrl, config, add) {
  const origin = new URL(startUrl).origin;
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  // Rotas que não aparecem como link (ex.: navegação por botão no React) entram pela configuração.
  const extra = (config.crawl.routes ?? []).map((r) => {
    try {
      return normalize(new URL(r, startUrl).href);
    } catch {
      return null;
    }
  });
  const queue = [...new Set([normalize(startUrl), ...extra.filter(Boolean)])];
  const seen = new Set(queue);
  const pages = [];
  const checkedExternal = new Map();
  let react = null;
  // SPA: o servidor devolve 200 para qualquer caminho e a aplicação desenha a tela de "não encontrada".
  const notFound = await probeNotFound(context, startUrl);

  while (queue.length && pages.length < config.crawl.maxPages) {
    const pageUrl = queue.shift();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    let status = 0;
    try {
      const res = await open(page, pageUrl);
      status = res?.status() ?? 0;
      await waitForRender(page);
    } catch {
      // O Chromium lança erro em respostas de erro sem corpo (ex.: 404 vazio); pegamos o status direto.
      const res = await context.request.get(pageUrl, { timeout: 10000 }).catch(() => null);
      status = res?.status() ?? 0;
    }
    // Arquivos locais (file://) não têm status HTTP: consideramos 200 se o arquivo existe e 404 se não.
    if (new URL(pageUrl).protocol === 'file:') status = fs.existsSync(fileURLToPath(pageUrl)) ? 200 : 404;
    let ok = status > 0 && status < 400;
    const entry = { url: pageUrl, status, ok, title: ok ? await page.title() : '', screenshots: {}, linksTo: [] };
    pages.push(entry);

    if (ok) {
      react ??= await detectReact(page);
      const text = await renderedText(page);
      if (notFound && pageUrl !== normalize(startUrl) && text === notFound) {
        // Mesma tela da rota inexistente: para o usuário, é um link quebrado (soft 404).
        Object.assign(entry, { status: 404, ok: false, soft404: true });
        ok = false;
      } else if (!text) {
        entry.blank = true;
        add({
          source: 'check:spa',
          category: 'ui',
          severity: 'critical',
          rule: 'blank-page',
          title: t('react.blankPage.title'),
          description: t(errors.length ? 'react.blankPage.descriptionError' : 'react.blankPage.description', { url: pageUrl }),
          page: pageUrl,
          evidence: { snippet: errors.slice(0, 3).join('\n') || t('checks.noText') },
          suggestion: t(react ? 'react.blankPage.suggestionReact' : 'react.blankPage.suggestion'),
        });
      }
    }

    if (ok) {
      const links = await page.$$eval('a', (as) =>
        as.map((a) => ({
          href: a.getAttribute('href'),
          abs: a.href,
          text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80),
          hasClick: a.hasAttribute('onclick'),
        })),
      );
      for (const link of links) {
        const raw = (link.href ?? '').trim();
        if (raw === '' || raw === '#' || /^javascript:/i.test(raw)) {
          if (!link.hasClick) {
            add({
              source: 'check:links',
              category: 'navigation',
              severity: 'medium',
              rule: 'empty-link',
              title: t('checks.emptyLink.title'),
              description: t('checks.emptyLink.description', { text: link.text || t('checks.noText'), href: raw || t('checks.nothing') }),
              page: pageUrl,
              evidence: { snippet: `<a href="${raw}">${link.text}</a>` },
              suggestion: t('checks.emptyLink.suggestion'),
            });
          }
          continue;
        }
        if (/^(mailto|tel):/i.test(raw)) continue;
        let target;
        try {
          target = new URL(link.abs);
        } catch {
          continue;
        }
        if (target.origin === origin) {
          const next = normalize(target.href);
          entry.linksTo.push(next);
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        } else if (config.crawl.checkExternalLinks && !checkedExternal.has(target.href)) {
          const res = await context.request.get(target.href, { timeout: 10000 }).catch(() => null);
          checkedExternal.set(target.href, res?.status() ?? 0);
          if (!res || res.status() >= 400) {
            add({
              source: 'check:links',
              category: 'navigation',
              severity: 'low',
              rule: 'broken-external-link',
              title: t('checks.externalLink.title'),
              description: t('checks.externalLink.description', { text: link.text, url: target.href, status: res?.status() ?? t('checks.noResponse') }),
              page: pageUrl,
              evidence: { snippet: target.href, terms: [target.href] },
              suggestion: t('checks.externalLink.suggestion'),
            });
          }
        }
      }
      entry.linksTo = [...new Set(entry.linksTo)];
    }
    await page.close();
  }

  // Quais páginas linkam para as páginas com erro (ajuda a achar onde corrigir).
  for (const p of pages.filter((p) => !p.ok)) {
    p.linkedFrom = pages.filter((o) => o.linksTo.includes(p.url)).map((o) => o.url);
  }
  await context.close();
  return { pages, react };
}

/**
 * Abre a página e espera a rede acalmar por pouco tempo. Apps com polling, analytics ou WebSocket
 * nunca ficam sem tráfego: esperar "networkidle" como condição de carregamento custava 20 s por página.
 */
async function open(page, url, timeout = 20000) {
  const res = await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
  return res;
}

/** Espera a aplicação desenhar a tela (SPAs montam o conteúdo depois do carregamento). */
async function waitForRender(page) {
  await page
    .waitForFunction(() => (document.body?.innerText ?? '').trim().length > 0, null, { timeout: 4000 })
    .catch(() => {});
}

async function renderedText(page) {
  return page.evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()).catch(() => '');
}

/**
 * Abre um caminho que não existe. Se o servidor responder 200 (fallback de SPA), guarda o texto da tela:
 * páginas com o mesmo texto são a tela de "não encontrada" da aplicação.
 */
async function probeNotFound(context, startUrl) {
  const start = new URL(startUrl);
  if (!/^https?:$/.test(start.protocol)) return null;
  const page = await context.newPage();
  try {
    const probe = new URL(`/__ux-validate-404-${Date.now().toString(36)}`, start).href;
    const res = await open(page, probe, 15000);
    if (!res || res.status() >= 400) return null;
    await waitForRender(page);
    const text = await renderedText(page);
    if (!text) return null;
    // Se a rota inexistente mostra a mesma tela da inicial, a aplicação ignora o caminho: não dá para comparar.
    await open(page, startUrl, 15000);
    await waitForRender(page);
    return text === (await renderedText(page)) ? null : text;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function inspectPage(context, entry, vpName, runDir, addToRun, { checkContent, checkAria, checkNavigation, colorVision, speller, react }) {
  const page = await context.newPage();
  // Os problemas da página ficam aqui até o fim, para ligá-los aos componentes React antes de registrar.
  const found = [];
  const add = (f) => found.push(f);
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    const text = msg.text();
    // Alguns avisos do React (ex.: erro de renderização sem Error Boundary) chegam como "warning".
    if (msg.type() === 'warning' && isReactMessage(text)) return consoleErrors.push(text);
    if (msg.type() !== 'error' || text.startsWith('Failed to load resource')) return;
    // Com file://, o navegador bloqueia leituras de arquivos locais feitas pelo axe; não é erro da aplicação.
    if (/Access to .* at 'file:\/\/.*CORS policy/.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url() !== entry.url) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    // Arquivo local que existe mas foi bloqueado (leitura do axe via file://): não é erro da aplicação.
    if (url.startsWith('file:') && fs.existsSync(fileURLToPath(url))) return;
    failedRequests.push(`${t('checks.failedRequest')} ${url}`);
  });

  await open(page, entry.url).catch(() => {});
  await waitForRender(page);

  // Sempre com "/": o caminho é usado em links do relatório, inclusive no Windows.
  const shot = `screenshots/${slug(entry.url)}-${vpName}.png`;
  await page.screenshot({ path: path.join(runDir, shot), fullPage: true }).catch(() => {});
  entry.screenshots[vpName] = shot;
  const base = { page: entry.url, viewport: vpName };

  // Página em branco já é um problema crítico; axe, layout e teclado só gerariam ruído sobre uma tela vazia.
  const blank = Boolean(entry.blank);

  // Acessibilidade (axe-core)
  const axe = blank ? null : await axeFor(page).analyze().catch(() => null);
  for (const v of axe?.violations ?? []) {
    const text = axeText(v);
    add({
      ...base,
      source: 'check:axe',
      category: 'accessibility',
      severity: AXE_SEVERITY[v.impact] ?? 'medium',
      title: text.help,
      description: t('checks.axe.description', { text: text.description, n: v.nodes.length }),
      heuristic: wcagCriteria(v.tags),
      rule: v.id,
      evidence: {
        screenshot: shot,
        selector: v.nodes.slice(0, 5).map((n) => n.target.join(' ')).join(' | '),
        snippet: v.nodes[0]?.html?.slice(0, 300),
      },
      suggestion: t('checks.axe.suggestion', { help: text.help, rule: v.id }),
      helpUrl: v.helpUrl,
    });
  }

  // Erros de JavaScript e recursos que não carregaram; avisos do React viram problemas próprios.
  const { react: reactMessages, other: otherErrors } = classifyConsole(consoleErrors);
  for (const kind of reactMessages) {
    const components = [...kind.components];
    add({
      ...base,
      source: 'check:react',
      category: kind.category,
      severity: kind.severity,
      rule: `react-${kind.key}`,
      title: t(`react.console.${kind.key}.title`),
      description: t(`react.console.${kind.key}.description`, { n: kind.messages.length, components: components.join(', ') || '?' }),
      evidence: { snippet: [...new Set(kind.messages.map(cleanReactMessage))].slice(0, 3).join('\n'), ...(components.length ? { terms: components.map((c) => `function ${c}`) } : {}) },
      ...(components.length ? { react: { components } } : {}),
      suggestion: t(`react.console.${kind.key}.suggestion`),
    });
  }
  if (otherErrors.length) {
    add({
      ...base,
      source: 'check:console',
      category: 'ui',
      severity: 'high',
      rule: 'console-errors',
      title: t('checks.console.title'),
      description: t('checks.console.description', { n: otherErrors.length }),
      evidence: { snippet: [...new Set(otherErrors)].slice(0, 5).join('\n') },
      suggestion: t('checks.console.suggestion'),
    });
  }
  if (failedRequests.length) {
    add({
      ...base,
      source: 'check:network',
      category: 'ui',
      severity: 'medium',
      rule: 'failed-requests',
      title: t('checks.network.title'),
      description: t('checks.network.description', { n: failedRequests.length }),
      evidence: { snippet: [...new Set(failedRequests)].slice(0, 8).join('\n') },
      suggestion: t('checks.network.suggestion'),
    });
  }

  // Layout: rolagem horizontal e textos pequenos demais
  // Compara com a largura configurada: em modo celular o navegador "afasta o zoom" e esconderia o problema.
  const layout = await page.evaluate((width) => {
    const overflow = document.documentElement.scrollWidth - width;
    const tiny = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const size = parseFloat(style.fontSize);
      if (size < 12) tiny.push(`${el.tagName.toLowerCase()} (${size}px): ${el.textContent.trim().slice(0, 40)}`);
    }
    return { overflow, tiny: tiny.slice(0, 5), tinyCount: tiny.length };
  }, VIEWPORTS[vpName].width);
  if (layout.overflow > 5 && !blank) {
    add({
      ...base,
      source: 'check:layout',
      category: 'ui',
      severity: vpName === 'mobile' ? 'high' : 'medium',
      rule: 'horizontal-overflow',
      title: t('checks.overflow.title'),
      description: t('checks.overflow.description', { px: layout.overflow, viewport: vpName }),
      heuristic: 'WCAG 1.4.10 (Reflow)',
      evidence: { screenshot: shot },
      suggestion: t('checks.overflow.suggestion'),
    });
  }
  if (layout.tinyCount && !blank) {
    add({
      ...base,
      source: 'check:layout',
      category: 'ui',
      severity: 'low',
      rule: 'small-text',
      title: t('checks.tinyText.title'),
      description: t('checks.tinyText.description', { n: layout.tinyCount }),
      evidence: { screenshot: shot, snippet: layout.tiny.join('\n') },
      suggestion: t('checks.tinyText.suggestion'),
    });
  }

  // Conteúdo: sobras de desenvolvimento ou de geração por IA (uma vez por página)
  if (checkContent && !blank) {
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    for (const pat of LEFTOVER_PATTERNS) {
      const m = text.match(pat.re);
      if (!m) continue;
      const i = m.index;
      add({
        ...base,
        viewport: undefined,
        source: 'check:content',
        category: 'content',
        severity: pat.severity,
        rule: `leftover-${pat.key}`,
        title: t(`checks.leftover.${pat.key}`),
        description: t('checks.leftover.description', { match: m[0] }),
        evidence: { screenshot: shot, snippet: text.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, ' ').trim(), terms: [m[0]] },
        suggestion: t('checks.leftover.suggestion'),
      });
    }
    if (speller) await checkSpelling(page, { base, add, shot, speller }).catch((err) => {
      if (process.env.DEBUG) console.error('Spell check failed:', err);
    });
  }
  // Antes do teclado, que interage com a página e pode mudar o que está na tela.
  if (colorVision && !blank) {
    await runColorVisionChecks(page, { base, add, shot, runDir, name: slug(entry.url), entry, types: colorVision.types }).catch((err) => {
      if (process.env.DEBUG) console.error('Color vision checks failed:', err);
    });
  }
  // Por último, porque interage com a página (Tab, cliques em botões de abrir/fechar).
  if (checkAria && !blank) {
    await runAriaChecks(page, { base, add, shot, runDir, entry, name: slug(entry.url) }).catch((err) => {
      if (process.env.DEBUG) console.error('ARIA checks failed:', err);
    });
  }
  if (react) await annotateFindings(page, found, { cwd: react.cwd, request: context.request, cache: react.sourceMaps });
  if (checkNavigation && !blank) await checkClientNavigation(page, { base, add });
  for (const f of found) addToRun(f);
  await page.close();
}

function checkSiteWide(pages, add) {
  const ok = pages.filter((p) => p.ok);
  const byTitle = Map.groupBy ? Map.groupBy(ok, (p) => p.title) : groupBy(ok, (p) => p.title);
  for (const [title, group] of byTitle) {
    if (group.length > 1) {
      add({
        source: 'check:content',
        category: 'content',
        severity: 'low',
        rule: 'duplicate-title',
        title: t('checks.duplicateTitle.title'),
        description: t('checks.duplicateTitle.description', { n: group.length, title: title || t('checks.duplicateTitle.empty') }),
        page: group[0].url,
        evidence: { snippet: group.map((p) => p.url).join('\n'), terms: title ? [`<title>${title}</title>`] : [] },
        suggestion: t('checks.duplicateTitle.suggestion'),
      });
    }
  }
  for (const p of pages.filter((p) => !p.ok)) {
    const status = p.soft404 ? t('react.soft404Status') : p.status ? `HTTP ${p.status}` : t('checks.noResponse');
    if (!p.linkedFrom?.length) {
      add({
        source: 'check:links',
        category: 'navigation',
        severity: 'critical',
        rule: 'start-page-down',
        title: t('checks.homeDown.title', { status }),
        description: t('checks.homeDown.description', { url: p.url, status }),
        page: p.url,
        evidence: { snippet: status },
        suggestion: t('checks.homeDown.suggestion'),
      });
      continue;
    }
    add({
      source: 'check:links',
      category: 'navigation',
      severity: 'high',
      rule: 'broken-internal-link',
      title: p.status === 404 ? t('checks.brokenLink.title404') : t('checks.brokenLink.title'),
      description: t('checks.brokenLink.description', { n: p.linkedFrom.length, url: p.url, status }),
      page: p.linkedFrom[0],
      evidence: {
        snippet: `${t('checks.targetLabel')}: ${p.url}\n${t('checks.linkedFromLabel')}:\n${p.linkedFrom.join('\n')}`,
        // O nome da página de destino ajuda o `fix` a achar o link no código (ex.: href="sobre.html").
        terms: [decodeURIComponent(new URL(p.url).pathname.split('/').pop() ?? '')].filter((x) => x.length >= 4),
      },
      suggestion: t('checks.brokenLink.suggestion'),
    });
  }
}

/** Junta o mesmo problema visto em vários tamanhos de tela num item só. */
function dedupe(findings) {
  const map = new Map();
  for (const f of findings) {
    const perPage = ['check:console', 'check:network', 'check:layout'].includes(f.source);
    const detail = perPage ? '' : (f.evidence?.selector ?? f.evidence?.snippet ?? '');
    const key = [f.source, f.rule ?? f.title, f.page, detail].join('|');
    const prev = map.get(key);
    if (prev) {
      if (f.viewport && !prev.viewports.includes(f.viewport)) prev.viewports.push(f.viewport);
      continue;
    }
    const { viewport, ...rest } = f;
    map.set(key, { ...rest, viewports: viewport ? [viewport] : [] });
  }
  return [...map.values()].map((f, i) => ({ ...f, id: `C${String(i + 1).padStart(3, '0')}` }));
}

function groupBy(list, fn) {
  const m = new Map();
  for (const x of list) m.set(fn(x), [...(m.get(fn(x)) ?? []), x]);
  return m;
}

/** Tira âncoras (#secao), mas mantém rotas de hash (#/planos, #!/planos), comuns em SPAs com HashRouter. */
export function normalize(u) {
  const url = new URL(u);
  if (!/^#!?\//.test(url.hash)) url.hash = '';
  return url.href;
}

export function slug(u) {
  const { pathname, hash } = new URL(u);
  const route = /^#!?\//.test(hash) ? hash.replace(/^#!?/, '') : '';
  // Pega o fim do caminho: em URLs longas (ex.: file:///C:/Users/...) o começo é igual para todas as páginas.
  const clean = decodeURIComponent(pathname + route).replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return (clean.slice(-60).replace(/^-/, '') || 'home');
}
