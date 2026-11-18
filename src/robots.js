/**
 * robots.txt (RFC 9309): quais caminhos o ux-validate pode visitar num site publicado.
 * Vale o grupo do nosso agente (`ux-validate`) ou, sem ele, o grupo `*`. Entre as regras que casam
 * com o caminho, vence a mais longa; no empate, `Allow`. `*` casa qualquer sequência e `$` marca o fim.
 */

export const ROBOTS_AGENT = 'ux-validate';

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      // Várias linhas User-agent seguidas formam um grupo só.
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      // "Disallow:" vazio não bloqueia nada.
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const pick = (name) => groups.filter((g) => g.agents.includes(name)).flatMap((g) => g.rules);
  const ours = pick(ROBOTS_AGENT);
  return ours.length || groups.some((g) => g.agents.includes(ROBOTS_AGENT)) ? ours : pick('*');
}

function toRegex(rulePath) {
  const anchored = rulePath.endsWith('$');
  const body = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** O caminho (com a query string) pode ser visitado? */
export function isAllowed(rules, url) {
  const u = new URL(url);
  const target = decodeSafe(`${u.pathname}${u.search}`);
  let best = null;
  for (const rule of rules) {
    if (!toRegex(decodeSafe(rule.path)).test(target)) continue;
    const len = rule.path.length;
    if (!best || len > best.len || (len === best.len && rule.allow)) best = { len, allow: rule.allow };
  }
  return best ? best.allow : true;
}

function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Baixa o robots.txt da origem da URL e devolve `allowed(url)`. Sem arquivo (404) tudo é permitido;
 * se o servidor negar o acesso a ele (401/403), por cautela nada é permitido, como manda a RFC.
 */
export async function loadRobots(startUrl, { userAgent, timeout = 10000 } = {}) {
  const robotsUrl = new URL('/robots.txt', startUrl).href;
  let rules = [];
  let blockedAll = false;
  let found = false;
  try {
    const res = await fetch(robotsUrl, { headers: userAgent ? { 'user-agent': userAgent } : {}, signal: AbortSignal.timeout(timeout) });
    if (res.ok) {
      rules = parseRobots(await res.text());
      found = true;
    } else if (res.status === 401 || res.status === 403) {
      blockedAll = true;
      found = true;
    }
  } catch {
    // Sem resposta: segue sem restrições, como um site sem robots.txt.
  }
  return {
    url: robotsUrl,
    found,
    rules,
    allowed: (url) => !blockedAll && isAllowed(rules, url),
  };
}
