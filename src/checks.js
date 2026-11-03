import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { VIEWPORTS, loadConfig, newRunDir } from './config.js';

/**
 * Checagens determinísticas: dão o mesmo resultado com qualquer modelo de linguagem.
 * O agente lê o checks.json e só interpreta e prioriza; não precisa "adivinhar" contraste ou links quebrados.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const require = createRequire(import.meta.url);
let AXE_LOCALE = null;
try {
  AXE_LOCALE = require('axe-core/locales/pt_BR.json');
} catch {
  // Sem tradução disponível: as mensagens do axe ficam em inglês.
}

const AXE_SEVERITY = { critical: 'critical', serious: 'high', moderate: 'medium', minor: 'low' };

// Textos que não deveriam chegar ao usuário final (comuns em código gerado por IA).
const LEFTOVER_PATTERNS = [
  { re: /lorem ipsum|dolor sit amet/i, title: 'Texto de preenchimento (lorem ipsum)', severity: 'high' },
  { re: /\b(TODO|FIXME|XXX)\b/, title: 'Marcador de desenvolvimento (TODO/FIXME) visível', severity: 'medium' },
  { re: /\[object Object\]|\bundefined\b|\bNaN\b/, title: 'Valor de código exposto (undefined, NaN, [object Object])', severity: 'high' },
  { re: /\{\{\s*[\w.]+\s*\}\}|\$\{[\w.]+\}/, title: 'Variável de template não renderizada', severity: 'high' },
  { re: /as an ai (language )?model|como (um )?modelo de (linguagem|ia)/i, title: 'Resposta de IA colada no conteúdo', severity: 'high' },
  { re: /\b(your|sua) (company|empresa) (name|aqui)\b|\bacme (inc|corp)\b|john doe|fulano de tal/i, title: 'Dado fictício de exemplo', severity: 'medium' },
  { re: /\bplaceholder\b|\bsample text\b|texto de exemplo|em breve\.\.\./i, title: 'Texto provisório (placeholder)', severity: 'medium' },
];

export async function runChecks({ cwd, configPath, out, url }) {
  const config = loadConfig(cwd, configPath);
  const startUrl = url ?? config.app.url;
  const runDir = out ? path.resolve(cwd, out) : newRunDir(cwd);
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });

  const browser = await chromium.launch(
    process.env.UX_VALIDATE_CHROMIUM ? { executablePath: process.env.UX_VALIDATE_CHROMIUM } : {},
  );
  const findings = [];
  const add = (f) => findings.push({ id: `C${String(findings.length + 1).padStart(3, '0')}`, ...f });

  try {
    console.log(`Rastreando ${startUrl} (até ${config.crawl.maxPages} páginas)…`);
    const pages = await crawl(browser, startUrl, config, add);
    if (!pages.length) throw new Error(`Não consegui abrir ${startUrl}. A aplicação está rodando?`);

    for (const vpName of config.viewports) {
      console.log(`Analisando ${pages.length} página(s) em ${vpName}…`);
      const context = await browser.newContext({ viewport: VIEWPORTS[vpName], ...pick(VIEWPORTS[vpName]) });
      for (const p of pages.filter((p) => p.ok)) {
        await inspectPage(context, p, vpName, runDir, add, vpName === config.viewports[0]);
      }
      await context.close();
    }

    checkSiteWide(pages, add);

    const result = {
      tool: 'ux-validate',
      kind: 'checks',
      url: startUrl,
      createdAt: new Date().toISOString(),
      viewports: config.viewports,
      pages: pages.map(({ url, status, title, ok, screenshots, linksTo }) => ({ url, status, title, ok, screenshots, linksTo })),
      findings: dedupe(findings),
    };
    fs.writeFileSync(path.join(runDir, 'checks.json'), JSON.stringify(result, null, 2));

    const count = (s) => result.findings.filter((f) => f.severity === s).length;
    console.log(
      `\n✔ ${result.findings.length} problema(s): ${count('critical')} crítico(s), ${count('high')} alto(s), ` +
        `${count('medium')} médio(s), ${count('low')} baixo(s)`,
    );
    console.log(`  ${path.relative(cwd, path.join(runDir, 'checks.json'))}`);
    return { runDir, result };
  } finally {
    await browser.close();
  }
}

function axeFor(page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS);
}

/** Textos da regra no idioma do relatório, quando houver tradução. */
const axeText = (v) => ({ help: AXE_LOCALE?.rules?.[v.id]?.help ?? v.help, description: AXE_LOCALE?.rules?.[v.id]?.description ?? v.description });

/** ["wcag2aa", "wcag143"] -> "WCAG 1.4.3" */
function wcagCriteria(tags) {
  const criteria = tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => `WCAG ${t.slice(4, 5)}.${t.slice(5, 6)}.${t.slice(6)}`);
  return criteria.length ? criteria.join(', ') : 'Boas práticas de acessibilidade';
}

const pick = ({ isMobile, hasTouch }) => ({ isMobile, hasTouch });

/** BFS pelas páginas do mesmo domínio, registrando links quebrados e "#" sem destino. */
async function crawl(browser, startUrl, config, add) {
  const origin = new URL(startUrl).origin;
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const queue = [normalize(startUrl)];
  const seen = new Set(queue);
  const pages = [];
  const checkedExternal = new Map();

  while (queue.length && pages.length < config.crawl.maxPages) {
    const pageUrl = queue.shift();
    const page = await context.newPage();
    let status = 0;
    try {
      const res = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 });
      status = res?.status() ?? 0;
    } catch {
      // O Chromium lança erro em respostas de erro sem corpo (ex.: 404 vazio); pegamos o status direto.
      const res = await context.request.get(pageUrl, { timeout: 10000 }).catch(() => null);
      status = res?.status() ?? 0;
    }
    const ok = status > 0 && status < 400;
    const entry = { url: pageUrl, status, ok, title: ok ? await page.title() : '', screenshots: {}, linksTo: [] };
    pages.push(entry);

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
              title: 'Link sem destino',
              description: `O link "${link.text || '(sem texto)'}" aponta para "${raw || 'nada'}" e não leva a lugar nenhum.`,
              page: pageUrl,
              evidence: { snippet: `<a href="${raw}">${link.text}</a>` },
              suggestion: 'Aponte o link para a página correta ou remova-o até que o destino exista.',
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
              title: 'Link externo quebrado',
              description: `"${link.text}" aponta para ${target.href}, que respondeu ${res?.status() ?? 'sem resposta'}.`,
              page: pageUrl,
              evidence: { snippet: target.href },
              suggestion: 'Atualize ou remova o link externo.',
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
  return pages;
}

async function inspectPage(context, entry, vpName, runDir, add, checkContent) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url() !== entry.url) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  page.on('requestfailed', (req) => failedRequests.push(`falhou ${req.url()}`));

  await page.goto(entry.url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});

  const shot = path.join('screenshots', `${slug(entry.url)}-${vpName}.png`);
  await page.screenshot({ path: path.join(runDir, shot), fullPage: true }).catch(() => {});
  entry.screenshots[vpName] = shot;
  const base = { page: entry.url, viewport: vpName };

  // Acessibilidade (axe-core)
  const axe = await axeFor(page).analyze().catch(() => null);
  for (const v of axe?.violations ?? []) {
    const text = axeText(v);
    add({
      ...base,
      source: 'check:axe',
      category: 'ui',
      severity: AXE_SEVERITY[v.impact] ?? 'medium',
      title: text.help,
      description: `${text.description} (${v.nodes.length} elemento(s)).`,
      heuristic: wcagCriteria(v.tags),
      rule: v.id,
      evidence: {
        screenshot: shot,
        selector: v.nodes.slice(0, 5).map((n) => n.target.join(' ')).join(' | '),
        snippet: v.nodes[0]?.html?.slice(0, 300),
      },
      suggestion: `${text.help}. Veja exemplos de correção na documentação da regra "${v.id}".`,
      helpUrl: v.helpUrl,
    });
  }

  // Erros de JavaScript e recursos que não carregaram
  if (consoleErrors.length) {
    add({
      ...base,
      source: 'check:console',
      category: 'ui',
      severity: 'high',
      title: 'Erros de JavaScript no console',
      description: `${consoleErrors.length} erro(s) ao carregar a página. Funcionalidades podem estar quebradas.`,
      evidence: { snippet: [...new Set(consoleErrors)].slice(0, 5).join('\n') },
      suggestion: 'Corrija os erros listados; eles costumam indicar botões ou componentes que não funcionam.',
    });
  }
  if (failedRequests.length) {
    add({
      ...base,
      source: 'check:network',
      category: 'ui',
      severity: 'medium',
      title: 'Recursos que não carregaram',
      description: `${failedRequests.length} requisição(ões) falharam (imagens, scripts, APIs).`,
      evidence: { snippet: [...new Set(failedRequests)].slice(0, 8).join('\n') },
      suggestion: 'Verifique caminhos de arquivos e endpoints de API.',
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
  if (layout.overflow > 5) {
    add({
      ...base,
      source: 'check:layout',
      category: 'ui',
      severity: vpName === 'mobile' ? 'high' : 'medium',
      title: 'Conteúdo maior que a tela (rolagem horizontal)',
      description: `A página é ${layout.overflow}px mais larga que a tela em ${vpName}.`,
      heuristic: 'WCAG 1.4.10 (Reflow)',
      evidence: { screenshot: shot },
      suggestion: 'Procure larguras fixas (width em px), imagens sem max-width: 100% ou tabelas sem rolagem própria.',
    });
  }
  if (layout.tinyCount) {
    add({
      ...base,
      source: 'check:layout',
      category: 'ui',
      severity: 'low',
      title: 'Texto pequeno demais para ler',
      description: `${layout.tinyCount} trecho(s) com fonte menor que 12px.`,
      evidence: { screenshot: shot, snippet: layout.tiny.join('\n') },
      suggestion: 'Use no mínimo 14px para texto corrido e 12px para legendas.',
    });
  }

  // Conteúdo: sobras de desenvolvimento ou de geração por IA (uma vez por página)
  if (checkContent) {
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
        title: pat.title,
        description: `Encontrado na página: "${m[0]}".`,
        evidence: { screenshot: shot, snippet: text.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, ' ').trim() },
        suggestion: 'Substitua pelo conteúdo real ou remova o trecho.',
      });
    }
  }
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
        title: 'Páginas diferentes com o mesmo título',
        description: `${group.length} páginas usam o título "${title || '(vazio)'}"; na aba do navegador e nos buscadores elas parecem iguais.`,
        page: group[0].url,
        evidence: { snippet: group.map((p) => p.url).join('\n') },
        suggestion: 'Dê a cada página um <title> que descreva seu conteúdo.',
      });
    }
  }
  for (const p of pages.filter((p) => !p.ok)) {
    const status = p.status ? `HTTP ${p.status}` : 'sem resposta';
    if (!p.linkedFrom?.length) {
      add({
        source: 'check:links',
        category: 'navigation',
        severity: 'critical',
        title: `A página inicial não abre (${status})`,
        description: `${p.url} respondeu ${status}.`,
        page: p.url,
        evidence: { snippet: status },
        suggestion: 'Verifique se a aplicação está no ar e se a URL configurada está correta.',
      });
      continue;
    }
    add({
      source: 'check:links',
      category: 'navigation',
      severity: 'high',
      title: p.status === 404 ? 'Link para página que não existe (404)' : 'Link interno quebrado',
      description: `${p.linkedFrom.length} página(s) apontam para ${p.url}, que não abre (${status}).`,
      page: p.linkedFrom[0],
      evidence: { snippet: `Destino: ${p.url}\nLinkado a partir de:\n${p.linkedFrom.join('\n')}` },
      suggestion: 'Corrija o endereço do link ou crie a página de destino.',
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

function normalize(u) {
  const url = new URL(u);
  url.hash = '';
  return url.href;
}

function slug(u) {
  const { pathname } = new URL(u);
  return (pathname.replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').slice(0, 60);
}
