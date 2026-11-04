import fs from 'node:fs';
import path from 'node:path';
import { t } from './i18n.js';

/**
 * Checagens de acessibilidade baseadas no WAI-ARIA e no ARIA Authoring Practices Guide (APG).
 *
 * O axe-core já valida a *sintaxe* do ARIA (papéis e atributos válidos, nomes acessíveis…).
 * Aqui testamos o *comportamento*: o que acontece quando alguém usa a página só com teclado
 * ou com leitor de tela.
 */

const MAX_TABS = 80;
const MAX_EXPANDED_TESTS = 6;
const LIST_LIMIT = 6;

// Papéis de widget (WAI-ARIA 1.2) que precisam receber foco para serem operados pelo teclado.
const WIDGET_ROLES = [
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'slider', 'spinbutton', 'combobox', 'textbox', 'searchbox', 'treeitem',
];

export async function runAriaChecks(page, ctx) {
  await saveAriaTree(page, ctx);
  await checkStaticAria(page, ctx);
  await checkKeyboard(page, ctx);
  await checkExpandedState(page, ctx);
}

/** Salva a árvore de acessibilidade: é o que um leitor de tela "enxerga" da página. */
async function saveAriaTree(page, { runDir, name, entry }) {
  const tree = await page.locator('body').ariaSnapshot({ timeout: 10000 }).catch(() => null);
  if (!tree) return;
  const rel = `aria/${name}.yml`;
  fs.mkdirSync(path.join(runDir, 'aria'), { recursive: true });
  fs.writeFileSync(path.join(runDir, rel), tree + '\n');
  entry.ariaTree = rel;
}

/** Funções auxiliares injetadas na página. */
const HELPERS = `
  window.__uxv = {
    native(el) {
      return el.matches('a[href],area[href],button,input:not([type=hidden]),select,textarea,summary,iframe,[contenteditable=""],[contenteditable=true]') && !el.disabled;
    },
    visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    },
    selector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 4; n = n.parentElement) {
        if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
        let part = n.tagName.toLowerCase();
        const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
        parts.unshift(part);
      }
      return parts.join(' > ');
    },
    html(el) {
      const clone = el.cloneNode(true);
      // Remove as marcações internas do ux-validate antes de mostrar o código.
      for (const n of [clone, ...clone.querySelectorAll('[data-uxv-focus],[data-uxv-exp]')]) {
        n.removeAttribute('data-uxv-focus');
        n.removeAttribute('data-uxv-exp');
      }
      return clone.outerHTML.replace(/\\s+/g, ' ').slice(0, 160);
    },
    label(el) {
      return (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 50);
    },
    focusStyle(el) {
      const s = getComputedStyle(el);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join('|');
    },
  };
`;

async function inject(page) {
  await page.evaluate(HELPERS);
}

/** Problemas visíveis só pela estrutura da página (sem interagir). */
async function checkStaticAria(page, { base, add, shot }) {
  await inject(page);
  const result = await page.evaluate((widgetRoles) => {
    const u = window.__uxv;
    const all = [...document.querySelectorAll('body *')];

    // 1. Widgets com role mas sem foco (APG: todo widget interativo precisa ser alcançável pelo Tab).
    const roleNoFocus = all.filter((el) => {
      const role = el.getAttribute('role');
      if (!role || !widgetRoles.includes(role) || !u.visible(el)) return false;
      if (u.native(el) || el.hasAttribute('tabindex')) return false; // tabindex explícito = foco gerenciado (roving tabindex)
      if (el.closest('[aria-activedescendant]')) return false; // foco gerenciado por aria-activedescendant
      return el.getAttribute('aria-disabled') !== 'true';
    });

    // 2. Elementos clicáveis que não são controles (ex.: <div onclick>): o teclado não chega neles.
    const interactiveAncestor = 'a[href],button,label,summary,select,input,textarea,[role],[tabindex]';
    const clickable = all.filter((el) => {
      if (!u.visible(el) || u.native(el) || el.hasAttribute('tabindex') || el.hasAttribute('role')) return false;
      if (el.parentElement?.closest(interactiveAncestor)) return false;
      if (el.querySelector('a[href],button,input,select,textarea,[tabindex]')) return false;
      if (el.hasAttribute('onclick')) return true;
      const pointer = getComputedStyle(el).cursor === 'pointer';
      const parentPointer = el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer';
      return pointer && !parentPointer && el.innerText.trim().length > 0;
    });

    // 3. Campos identificados só pelo placeholder (some ao digitar e muitos leitores de tela ignoram).
    const fields = [...document.querySelectorAll('input, textarea, select')].filter((el) => {
      if (['hidden', 'submit', 'button', 'image', 'reset', 'checkbox', 'radio'].includes(el.type) || !u.visible(el)) return false;
      const named =
        el.labels?.length ||
        el.getAttribute('aria-label')?.trim() ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title')?.trim();
      return !named && el.hasAttribute('placeholder');
    });

    const pack = (list) => list.map((el) => ({ selector: u.selector(el), html: u.html(el), label: u.label(el) || el.getAttribute('placeholder') || '' }));
    return { roleNoFocus: pack(roleNoFocus), clickable: pack(clickable), fields: pack(fields) };
  }, WIDGET_ROLES);

  report(add, base, shot, result.roleNoFocus, { severity: 'high', key: 'roleNoFocus' });
  report(add, base, shot, result.clickable, { severity: 'high', key: 'clickable' });
  report(add, base, shot, result.fields, { severity: 'medium', key: 'placeholderOnly' });
}

/** Percorre a página com Tab, como quem usa só o teclado. */
async function checkKeyboard(page, { base, add, shot }) {
  await inject(page);
  const focusableCount = await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
    const u = window.__uxv;
    return [...document.querySelectorAll('body *')].filter(
      (el) => u.visible(el) && (u.native(el) || (el.hasAttribute('tabindex') && el.tabIndex >= 0)),
    ).length;
  });
  if (!focusableCount) return;

  const steps = [];
  let repeated = 0;
  for (let i = 0; i < Math.min(MAX_TABS, focusableCount + 5); i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((i) => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const u = window.__uxv;
      if (!el.hasAttribute('data-uxv-focus')) el.setAttribute('data-uxv-focus', String(i));
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-uxv-focus'),
        selector: u.selector(el),
        html: u.html(el),
        label: u.label(el),
        style: u.focusStyle(el),
        offscreen: r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.left > document.documentElement.scrollWidth,
      };
    }, i);
    if (!info) break; // o foco saiu da página: percorreu tudo
    const last = steps.at(-1);
    if (last && last.id === info.id) {
      repeated++;
      if (repeated >= 2) {
        add({
          ...base,
          source: 'check:aria',
          category: 'accessibility',
          severity: 'critical',
          title: t('aria.trap.title'),
          description: t('aria.trap.description', { name: info.label || info.selector }),
          heuristic: t('aria.trap.heuristic'),
          evidence: { screenshot: shot, selector: info.selector, snippet: info.html },
          suggestion: t('aria.trap.suggestion'),
        });
        break;
      }
      continue;
    }
    repeated = 0;
    if (steps.some((s) => s.id === info.id)) break; // deu a volta na página
    steps.push(info);
  }

  // Compara o visual de cada elemento com e sem foco.
  await page.evaluate(() => document.activeElement?.blur?.());
  const unfocused = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('[data-uxv-focus]')].map((el) => [el.getAttribute('data-uxv-focus'), window.__uxv.focusStyle(el)])),
  );
  const noIndicator = steps.filter((s) => !s.offscreen && unfocused[s.id] === s.style);
  const hiddenFocus = steps.filter((s) => s.offscreen);

  report(add, base, shot, noIndicator.map(toItem), { severity: 'high', key: 'noIndicator' });
  report(add, base, shot, hiddenFocus.map(toItem), { severity: 'medium', key: 'hiddenFocus' });
}

/** APG (Disclosure, Accordion, Menu Button): aria-expanded deve refletir se o conteúdo está aberto. */
async function checkExpandedState(page, { base, add, shot }) {
  const targets = await page.evaluate((max) => {
    const u = window.__uxv;
    return [...document.querySelectorAll('[aria-expanded]')]
      .filter((el) => u.visible(el) && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'SUMMARY'))
      .slice(0, max)
      .map((el, i) => {
        el.setAttribute('data-uxv-exp', String(i));
        return { i, selector: u.selector(el), html: u.html(el), label: u.label(el) };
      });
  }, MAX_EXPANDED_TESTS);

  const stale = [];
  const startUrl = page.url();
  for (const t of targets) {
    const locator = page.locator(`[data-uxv-exp="${t.i}"]`);
    const before = await locator.getAttribute('aria-expanded').catch(() => null);
    await page.evaluate(() => {
      window.__uxvMutations = 0;
      window.__uxvObserver?.disconnect();
      window.__uxvObserver = new MutationObserver((list) => {
        window.__uxvMutations += list.filter((m) => !(m.target instanceof Element && m.target.hasAttribute('data-uxv-exp'))).length;
      });
      window.__uxvObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const clicked = await locator.click({ timeout: 2000, noWaitAfter: true }).then(() => true, () => false);
    if (!clicked) continue;
    await page.waitForTimeout(300);
    if (page.url() !== startUrl) {
      await page.goBack().catch(() => {});
      break;
    }
    const after = await locator.getAttribute('aria-expanded').catch(() => null);
    const changedPage = await page.evaluate(() => window.__uxvMutations);
    if (before === after && changedPage > 0) stale.push(t);
    await locator.click({ timeout: 2000, noWaitAfter: true }).catch(() => {}); // desfaz
  }

  report(add, base, shot, stale, { severity: 'medium', key: 'expanded' });
}

const toItem = (s) => ({ selector: s.selector, html: s.html, label: s.label });

function report(add, base, shot, items, spec) {
  if (!items.length) return;
  add({
    ...base,
    source: 'check:aria',
    category: 'accessibility',
    severity: spec.severity,
    title: t(`aria.${spec.key}.title`),
    description: t(`aria.${spec.key}.description`, { n: items.length }),
    heuristic: t(`aria.${spec.key}.heuristic`),
    evidence: {
      screenshot: shot,
      selector: items.slice(0, LIST_LIMIT).map((i) => i.selector).join(' | '),
      snippet: items
        .slice(0, LIST_LIMIT)
        .map((i) => i.html)
        .join('\n'),
    },
    suggestion: t(`aria.${spec.key}.suggestion`),
  });
}
