import fs from 'node:fs';
import path from 'node:path';
import { t } from './i18n.js';

/**
 * Visão de cores (daltonismo).
 *
 * - Simula protanopia, deuteranopia e tritanopia (e, se configurada, acromatopsia) com as matrizes de
 *   Machado, Oliveira e Fernandes (2009), aplicadas em RGB linear;
 * - procura informação que some para quem tem daltonismo: textos que perdem contraste, indicadores sem
 *   texto que ficam da mesma cor e estados (selecionado, ativo) mostrados só pela cor (WCAG 1.4.1 e 1.4.3);
 * - tira capturas da página como cada tipo de daltonismo a vê, com a emulação do próprio Chromium.
 */

export const CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
export const DEFAULT_CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia'];
const LIST_LIMIT = 5;

// Matrizes de severidade 1,0 (Machado et al., 2009), para RGB linear.
const MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v) => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};

/** Cor [r, g, b] (0–255) como alguém com o tipo de daltonismo indicado a percebe. */
export function simulate([r, g, b], type) {
  const lin = [toLinear(r), toLinear(g), toLinear(b)];
  if (type === 'achromatopsia') {
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const v = toSrgb(y);
    return [v, v, v];
  }
  const m = MATRICES[type];
  if (!m) return [r, g, b];
  return m.map((row) => toSrgb(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
}

/** Luminância relativa e razão de contraste do WCAG. */
export function luminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function toLab([r, g, b]) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  // sRGB D65 → XYZ, normalizado pelo branco D65.
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (v) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Diferença de cor percebida (CIEDE2000). Abaixo de ~5, duas cores pequenas parecem a mesma. */
export function deltaE(c1, c2) {
  const [L1, a1, b1] = toLab(c1);
  const [L2, a2, b2] = toLab(c2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lmp = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hmp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hmp += h1p + h2p < 360 ? 360 : -360;
    hmp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hmp - 30) * rad) +
    0.24 * Math.cos(2 * hmp * rad) +
    0.32 * Math.cos((3 * hmp + 6) * rad) -
    0.2 * Math.cos((4 * hmp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// Limiares (CIEDE2000): cores "claramente diferentes" para quem enxerga todas as cores e "iguais" com
// daltonismo. Em elementos pequenos (bolinhas, marcadores) diferenças maiores já passam despercebidas.
const DISTINCT = 15;
const CONFUSED = 7;
const CONFUSED_SMALL = 10;

/**
 * Roda na página: coleta textos (cor do texto e do fundo efetivo), indicadores sem texto e grupos de
 * elementos irmãos iguais que só mudam de cor. As cores voltam como [r, g, b] (0–255).
 */
function collect() {
  const canvas = document.createElement('canvas').getContext('2d');
  // Normaliza qualquer cor do CSS (rgb, hsl, oklch, color()…) para [r, g, b, a].
  const parse = (value) => {
    if (!value || value === 'transparent') return [0, 0, 0, 0];
    const m = value.match(/^rgba?\(([^)]+)\)$/);
    let v = value;
    if (!m) {
      canvas.fillStyle = '#000';
      canvas.fillStyle = value;
      v = canvas.fillStyle;
    }
    if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
    const parts = (v.match(/^rgba?\(([^)]+)\)$/)?.[1] ?? '0,0,0,0').split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a))).concat(1);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.1;
  };
  // Fundo efetivo: compõe os fundos dos ancestrais; com imagem ou gradiente no caminho, não dá para saber.
  const background = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let result = [255, 255, 255, 1];
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };
  const selector = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 4; n = n.parentElement) {
      if (n.id) {
        parts.unshift('#' + CSS.escape(n.id));
        break;
      }
      let part = n.tagName.toLowerCase();
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      parts.unshift(part);
    }
    return parts.join(' > ');
  };
  const html = (el) => el.outerHTML.replace(/\s+/g, ' ').slice(0, 160);
  const rgb = (c) => [c[0], c[1], c[2]];
  const all = [...document.querySelectorAll('body *')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName));

  // 1. Textos: cor do texto sobre o fundo efetivo.
  const texts = [];
  for (const el of all) {
    if (texts.length >= 400) break;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const bg = background(el);
    if (!bg) continue;
    const fg = over(parse(s.color), bg);
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10) || 400;
    texts.push({
      selector: selector(el),
      html: html(el),
      text: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 60),
      fg: rgb(fg),
      bg: rgb(bg),
      large: size >= 24 || (size >= 18.66 && weight >= 700),
    });
  }

  // 2. Indicadores sem texto (bolinhas de status, marcadores de legenda): a cor é toda a informação.
  const indicators = [];
  for (const el of all) {
    if (indicators.length >= 200) break;
    const r = el.getBoundingClientRect();
    if (r.width > 32 || r.height > 32 || r.width < 4 || r.height < 4 || !visible(el)) continue;
    if (el.innerText.trim() || el.querySelector('img,svg,canvas,video') || el.matches('img,svg,canvas,video,input,select,textarea,button')) continue;
    // Com texto ao lado (ex.: "● Pago" numa legenda), a cor não é a única informação.
    if (el.parentElement && el.parentElement.innerText.trim()) continue;
    const s = getComputedStyle(el);
    const fill = parse(s.backgroundColor);
    const border = parse(s.borderTopColor);
    const color = fill[3] > 0.5 ? fill : parseFloat(s.borderTopWidth) >= 2 && border[3] > 0.5 ? border : null;
    if (!color) continue;
    const parentBg = background(el.parentElement ?? document.body);
    indicators.push({
      selector: selector(el),
      html: html(el),
      // Mesma tabela, lista ou seção: os indicadores formam um "código de cores".
      group: selector(el.closest('table,ul,ol,dl,section,article,figure,form,nav,aside,main') ?? document.body),
      label: (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      color: rgb(over(color, parentBg ?? [255, 255, 255, 1])),
    });
  }

  // 3. Irmãos com o mesmo formato que só mudam de cor (abas, botões de filtro, itens de menu, chips).
  const SHAPE = ['fontSize', 'fontWeight', 'fontStyle', 'textDecorationLine', 'borderTopWidth', 'borderBottomWidth', 'borderTopStyle', 'borderBottomStyle', 'outlineStyle', 'boxShadow', 'textTransform', 'opacity'];
  const groups = [];
  const parents = new Set(all.map((el) => el.parentElement).filter(Boolean));
  for (const parent of parents) {
    if (groups.length >= 60) break;
    const kids = [...parent.children].filter((el) => visible(el) && el.innerText.trim() && el.innerText.trim().length <= 40);
    if (kids.length < 2 || kids.length > 12) continue;
    const byTag = new Map();
    for (const el of kids) byTag.set(el.tagName, [...(byTag.get(el.tagName) ?? []), el]);
    for (const list of byTag.values()) {
      if (list.length < 2) continue;
      // O texto pode estar num filho (ex.: <li><a>Mensal</a></li>): usa o elemento que tem o texto.
      const target = (el) => (el.children.length === 1 && el.innerText.trim() === el.children[0].innerText.trim() ? el.children[0] : el);
      const items = list.map((el) => {
        const t = target(el);
        const s = getComputedStyle(t);
        const bg = background(t);
        return {
          el: t,
          shape: SHAPE.map((p) => s[p]).join('|'),
          fg: bg ? rgb(over(parse(s.color), bg)) : null,
          bg: bg ? rgb(bg) : null,
          border: rgb(parse(s.borderBottomColor)),
          hasBorder: parseFloat(s.borderBottomWidth) > 0,
        };
      });
      if (items.some((i) => !i.bg) || new Set(items.map((i) => i.shape)).size !== 1) continue;
      groups.push(
        items.map((i) => ({
          selector: selector(i.el),
          html: html(i.el),
          text: i.el.innerText.trim().replace(/\s+/g, ' ').slice(0, 40),
          fg: i.fg,
          bg: i.bg,
          border: i.hasBorder ? i.border : null,
        })),
      );
    }
  }
  return { texts, indicators, groups };
}

/** Pior simulação (menor valor de `fn`) entre os tipos configurados. */
function worst(types, fn) {
  let best = null;
  for (const type of types) {
    const value = fn(type);
    if (!best || value < best.value) best = { type, value };
  }
  return best;
}

/** Analisa os dados coletados e devolve problemas brutos (sem textos traduzidos), para testar sem navegador. */
export function analyzeColors({ texts = [], indicators = [], groups = [] }, types = DEFAULT_CVD_TYPES) {
  const issues = { contrast: [], indicators: [], state: [] };

  // 1. Contraste que passa normalmente e falha com daltonismo.
  for (const item of texts) {
    const min = item.large ? 3 : 4.5;
    const normal = contrast(item.fg, item.bg);
    if (normal < min) continue; // já é problema para todos (o axe aponta)
    const w = worst(types, (type) => contrast(simulate(item.fg, type), simulate(item.bg, type)));
    if (w.value < min) issues.contrast.push({ ...item, type: w.type, normal, simulated: w.value, min });
  }

  // 2. Indicadores do mesmo grupo com cores diferentes que ficam iguais.
  const byGroup = new Map();
  for (const item of indicators) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
  const seenPairs = new Set();
  for (const list of byGroup.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        // O mesmo par de cores repetido em várias linhas conta uma vez.
        const pairKey = [a.color.join(','), b.color.join(',')].sort().join('|');
        if (seenPairs.has(pairKey) || deltaE(a.color, b.color) < DISTINCT) continue;
        seenPairs.add(pairKey);
        const w = worst(types, (type) => deltaE(simulate(a.color, type), simulate(b.color, type)));
        if (w.value < CONFUSED_SMALL) issues.indicators.push({ a, b, type: w.type, simulated: w.value });
      }
    }
  }

  // 3. Um item que se destaca dos irmãos só pela cor (estado selecionado/ativo) e deixa de se destacar.
  const key = (i) => [i.fg, i.bg, i.border ?? []].flat().join(',');
  for (const group of groups) {
    const counts = new Map();
    for (const i of group) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
    if (counts.size !== 2) continue;
    const [[majorityKey, majority], [, minority]] = [...counts.entries()].sort((x, y) => y[1] - x[1]);
    if (majority === minority) continue; // dois grupos do mesmo tamanho: categorias, não um estado
    const normal = group.find((i) => key(i) === majorityKey);
    for (const odd of group.filter((i) => key(i) !== majorityKey)) {
      const pairs = [
        [odd.bg, normal.bg],
        [odd.fg, normal.fg],
        ...(odd.border && normal.border ? [[odd.border, normal.border]] : []),
      ];
      const visibleNormally = Math.max(...pairs.map(([x, y]) => deltaE(x, y)));
      if (visibleNormally < DISTINCT) continue;
      const w = worst(types, (type) => Math.max(...pairs.map(([x, y]) => deltaE(simulate(x, type), simulate(y, type)))));
      if (w.value < CONFUSED) issues.state.push({ odd, normal, type: w.type, simulated: w.value, others: group.length - 1 });
    }
  }
  return issues;
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const typeName = (type) => t(`colorVision.types.${type}`);

/**
 * Executa a etapa na página: capturas simuladas (Chromium) e checagens.
 * `ctx` segue o padrão das outras checagens: { base, add, runDir, name, entry, types }.
 */
export async function runColorVisionChecks(page, { base, add, shot, runDir, name, entry, types = DEFAULT_CVD_TYPES }) {
  const shots = await captureSimulations(page, { runDir, name, types });
  if (shots) entry.colorVision = shots;

  const data = await page.evaluate(collect);
  const issues = analyzeColors(data, types);
  const shotFor = (type) => shots?.[type] ?? shot;
  const audience = 'color-blind';

  if (issues.contrast.length) {
    const list = issues.contrast;
    const worstItem = [...list].sort((a, b) => a.simulated - b.simulated)[0];
    add({
      ...base,
      source: 'check:color',
      category: 'accessibility',
      audience,
      severity: worstItem.simulated < 3 ? 'high' : 'medium',
      rule: 'cvd-contrast',
      title: t('colorVision.contrast.title'),
      description: t('colorVision.contrast.description', { n: list.length, type: typeName(worstItem.type) }),
      heuristic: 'WCAG 1.4.3 (Contrast)',
      evidence: {
        screenshot: shotFor(worstItem.type),
        selector: list.slice(0, LIST_LIMIT).map((i) => i.selector).join(' | '),
        snippet: list
          .slice(0, LIST_LIMIT)
          .map((i) => `"${i.text}" ${hex(i.fg)} / ${hex(i.bg)}: ${i.normal.toFixed(1)}:1 → ${i.simulated.toFixed(1)}:1 (${typeName(i.type)})`)
          .join('\n'),
        terms: list.slice(0, LIST_LIMIT).map((i) => i.text).filter((x) => x.length >= 4),
      },
      suggestion: t('colorVision.contrast.suggestion'),
    });
  }

  if (issues.indicators.length) {
    const list = issues.indicators;
    add({
      ...base,
      source: 'check:color',
      category: 'accessibility',
      audience,
      severity: 'high',
      rule: 'cvd-indicators',
      title: t('colorVision.indicators.title'),
      description: t('colorVision.indicators.description', { n: list.length, type: typeName(list[0].type) }),
      heuristic: 'WCAG 1.4.1 (Use of Color)',
      evidence: {
        screenshot: shotFor(list[0].type),
        selector: [...new Set(list.slice(0, LIST_LIMIT).flatMap((p) => [p.a.selector, p.b.selector]))].join(' | '),
        snippet: list
          .slice(0, LIST_LIMIT)
          .map((p) => `${hex(p.a.color)} ${p.a.label ? `"${p.a.label}"` : ''} ≈ ${hex(p.b.color)} ${p.b.label ? `"${p.b.label}"` : ''} (${typeName(p.type)})`.replace(/\s+/g, ' '))
          .join('\n'),
      },
      suggestion: t('colorVision.indicators.suggestion'),
    });
  }

  if (issues.state.length) {
    const list = issues.state;
    add({
      ...base,
      source: 'check:color',
      category: 'accessibility',
      audience,
      severity: 'high',
      rule: 'cvd-state',
      title: t('colorVision.state.title'),
      description: t('colorVision.state.description', { text: list[0].odd.text, type: typeName(list[0].type) }),
      heuristic: 'WCAG 1.4.1 (Use of Color)',
      evidence: {
        screenshot: shotFor(list[0].type),
        selector: list.slice(0, LIST_LIMIT).map((i) => i.odd.selector).join(' | '),
        snippet: list
          .slice(0, LIST_LIMIT)
          .map((i) => `"${i.odd.text}" ${hex(i.odd.fg)} / ${hex(i.odd.bg)} × "${i.normal.text}" ${hex(i.normal.fg)} / ${hex(i.normal.bg)} (${typeName(i.type)})`)
          .join('\n'),
        terms: list.slice(0, LIST_LIMIT).map((i) => i.odd.text).filter((x) => x.length >= 4),
      },
      suggestion: t('colorVision.state.suggestion'),
    });
  }
  return issues;
}

/** Capturas da tela como cada tipo de daltonismo a vê (emulação do Chromium via CDP). */
async function captureSimulations(page, { runDir, name, types }) {
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    return null; // outro navegador: sem emulação, as checagens continuam
  }
  const shots = {};
  try {
    fs.mkdirSync(path.join(runDir, 'color-vision'), { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const type of ['none', ...types]) {
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
      const rel = `color-vision/${name}-${type === 'none' ? 'normal' : type}.jpg`;
      await page.screenshot({ path: path.join(runDir, rel), type: 'jpeg', quality: 70 });
      shots[type === 'none' ? 'normal' : type] = rel;
    }
  } catch {
    return Object.keys(shots).length ? shots : null;
  } finally {
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' }).catch(() => {});
    await cdp.detach().catch(() => {});
  }
  return shots;
}
