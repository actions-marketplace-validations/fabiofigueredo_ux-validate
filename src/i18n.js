import ptBR from './locales/pt-BR.js';
import en from './locales/en.js';

/**
 * Idioma da ferramenta (CLI, setup, relatório, achados e instruções do agente).
 * Não confundir com `language` da configuração, que é o idioma do CONTEÚDO da aplicação testada
 * (usado pela verificação ortográfica).
 */

export const LOCALES = { 'pt-BR': ptBR, en };
export const DEFAULT_LOCALE = 'en';

let current = DEFAULT_LOCALE;

export function normalizeLocale(value) {
  if (!value) return null;
  const lower = String(value).toLowerCase().replace('_', '-');
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('en')) return 'en';
  return null;
}

/** Idioma do sistema operacional (variáveis LANG/LC_* ou Intl), com inglês como padrão. */
export function detectLocale(env = process.env) {
  for (const key of ['UX_VALIDATE_LOCALE', 'LC_ALL', 'LC_MESSAGES', 'LANG', 'LANGUAGE']) {
    const found = normalizeLocale(env[key]);
    if (found) return found;
  }
  try {
    return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setLocale(value) {
  current = normalizeLocale(value) ?? DEFAULT_LOCALE;
  return current;
}

export function getLocale() {
  return current;
}

/**
 * Traduz uma chave. Parâmetros entram como {nome}; valores que são funções recebem os parâmetros
 * (para plurais e frases montadas).
 */
export function t(key, params = {}) {
  const entry = lookup(LOCALES[current], key) ?? lookup(LOCALES[DEFAULT_LOCALE], key);
  if (entry === undefined) return key;
  if (typeof entry === 'function') return entry(params);
  if (typeof entry !== 'string') return entry;
  return entry.replace(/\{(\w+)\}/g, (all, name) => (params[name] ?? all).toString());
}

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

/** Formata números no idioma atual (1.234 em pt-BR, 1,234 em inglês). */
export function formatNumber(n) {
  return Number(n).toLocaleString(current === 'pt-BR' ? 'pt-BR' : 'en-US');
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(current === 'pt-BR' ? 'pt-BR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
}
