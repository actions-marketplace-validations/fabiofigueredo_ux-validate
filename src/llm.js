import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { PROVIDERS } from './config.js';

/** Erro que interrompe tudo (ex.: chave ausente ou inválida): não adianta tentar o próximo arquivo. */
export class FatalLlmError extends Error {}

function missingKey(envName) {
  return new FatalLlmError(
    `A variável de ambiente ${envName} não está definida. Defina-a com a sua API key e rode de novo:\n` +
      `    PowerShell:   $env:${envName}="sua-chave"\n` +
      `    macOS/Linux:  export ${envName}=sua-chave`,
  );
}

/** Confere, antes de gastar qualquer token, se há credencial para o provedor configurado. */
export function checkCredentials(standalone) {
  const provider = standalone?.provider;
  if (!CLIENTS[provider]) throw new FatalLlmError(`Provedor desconhecido: "${provider}". Use: ${Object.keys(CLIENTS).join(', ')}.`);
  if (provider === 'anthropic') {
    const envName = standalone.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
    const hasProfile = process.env.ANTHROPIC_PROFILE || fs.existsSync(path.join(os.homedir(), '.config', 'anthropic'));
    if (!process.env[envName] && !process.env.ANTHROPIC_AUTH_TOKEN && !hasProfile) throw missingKey(envName);
    return;
  }
  apiKey(standalone);
}

/**
 * Chama o modelo escolhido no setup (bloco `standalone` do ux-validate.config.yml), com a API key
 * do próprio usuário. Devolve o JSON pedido e o consumo de tokens.
 *
 * Cada provedor recebe o mesmo pedido: um prompt de sistema, um prompt do usuário e um JSON Schema
 * da resposta esperada.
 */
export async function completeJson(standalone, { system, prompt, schema }) {
  const provider = standalone?.provider;
  const call = CLIENTS[provider];
  if (!call) throw new Error(`Provedor desconhecido: "${provider}". Use: ${Object.keys(CLIENTS).join(', ')}.`);
  if (!standalone.model) throw new Error('Nenhum modelo configurado em standalone.model.');
  return call(standalone, { system, prompt, schema });
}

/** Nome da variável de ambiente com a chave e o valor dela (quando o provedor usa chave). */
function apiKey(standalone) {
  const envName = standalone.apiKeyEnv ?? PROVIDERS[standalone.provider]?.apiKeyEnv;
  if (!envName) return null;
  const value = process.env[envName];
  if (!value) throw missingKey(envName);
  return value;
}

// Modelos que aceitam o fallback automático do servidor quando um pedido é recusado pelos filtros de segurança.
const ANTHROPIC_DEFAULT_FALLBACK = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
// Modelos que aceitam o parâmetro effort.
const ANTHROPIC_EFFORT = /^claude-(fable-5|mythos-5|opus-5|sonnet-5|haiku-5-5|opus-4-[5-8])/;

async function anthropic(standalone, { system, prompt, schema }) {
  const envName = standalone.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
  // Sem a variável, o SDK ainda tenta as outras credenciais (ANTHROPIC_AUTH_TOKEN, perfil do `ant auth login`).
  let client;
  try {
    client = new Anthropic(process.env[envName] ? { apiKey: process.env[envName] } : {});
  } catch {
    throw missingKey(envName);
  }
  const params = {
    model: standalone.model,
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: { type: 'json_schema', schema },
      ...(ANTHROPIC_EFFORT.test(standalone.model) ? { effort: standalone.effort ?? 'high' } : {}),
    },
  };
  if (ANTHROPIC_DEFAULT_FALLBACK.has(standalone.model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  let message;
  try {
    // Streaming evita timeout em respostas longas; finalMessage() junta tudo no fim.
    message = await client.beta.messages.stream(params).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new FatalLlmError(`API key da Anthropic inválida ou sem permissão (${envName}).`);
    if (err instanceof Anthropic.NotFoundError) throw new Error(`Modelo não encontrado: ${standalone.model}.`);
    if (err instanceof Anthropic.RateLimitError) throw new Error('Limite de uso da API atingido. Tente de novo em alguns minutos.');
    if (err instanceof Anthropic.BadRequestError) throw new Error(`Pedido recusado pela API: ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new Error(`Erro da API da Anthropic (${err.status}): ${err.message}`);
    if (/authentication method/i.test(err?.message ?? '')) throw missingKey(envName);
    throw err;
  }

  if (message.stop_reason === 'refusal') {
    throw new Error(`O modelo recusou o pedido${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ''}.`);
  }
  if (message.stop_reason === 'max_tokens') throw new Error('A resposta foi cortada por ser longa demais.');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return {
    data: parseJson(text),
    model: message.model,
    usage: {
      input: (message.usage.input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
      output: message.usage.output_tokens ?? 0,
    },
  };
}

async function openai(standalone, { system, prompt, schema }) {
  const key = apiKey(standalone);
  const base = (standalone.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
  const body = await postJson(
    `${base}/v1/chat/completions`,
    { Authorization: `Bearer ${key}` },
    {
      model: standalone.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'resultado', schema, strict: true } },
    },
  );
  const choice = body.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`O modelo recusou o pedido: ${choice.message.refusal}`);
  if (choice?.finish_reason === 'length') throw new Error('A resposta foi cortada por ser longa demais.');
  return {
    data: parseJson(choice?.message?.content ?? ''),
    model: body.model ?? standalone.model,
    usage: { input: body.usage?.prompt_tokens ?? 0, output: body.usage?.completion_tokens ?? 0 },
  };
}

async function google(standalone, { system, prompt, schema }) {
  const key = apiKey(standalone);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(standalone.model)}:generateContent`;
  const body = await postJson(
    url,
    { 'x-goog-api-key': key },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nResponda só com JSON neste formato (JSON Schema):\n${JSON.stringify(schema)}` }] }],
      generationConfig: { responseMimeType: 'application/json' },
    },
  );
  const candidate = body.candidates?.[0];
  if (!candidate) throw new Error(`O modelo não respondeu${body.promptFeedback?.blockReason ? ` (bloqueado: ${body.promptFeedback.blockReason})` : ''}.`);
  if (candidate.finishReason === 'MAX_TOKENS') throw new Error('A resposta foi cortada por ser longa demais.');
  return {
    data: parseJson((candidate.content?.parts ?? []).map((p) => p.text ?? '').join('')),
    model: body.modelVersion ?? standalone.model,
    usage: { input: body.usageMetadata?.promptTokenCount ?? 0, output: body.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

async function ollama(standalone, { system, prompt, schema }) {
  const base = (standalone.baseUrl ?? PROVIDERS.ollama.baseUrl).replace(/\/+$/, '');
  const body = await postJson(
    `${base}/api/chat`,
    {},
    {
      model: standalone.model,
      stream: false,
      format: schema,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    },
  );
  return {
    data: parseJson(body.message?.content ?? ''),
    model: body.model ?? standalone.model,
    usage: { input: body.prompt_eval_count ?? 0, output: body.eval_count ?? 0 },
  };
}

const CLIENTS = { anthropic, openai, google, ollama };

async function postJson(url, headers, payload) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch (err) {
    throw new Error(`Não consegui conectar a ${new URL(url).host}: ${err.cause?.message ?? err.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const json = JSON.parse(text);
      detail = json.error?.message ?? json.error ?? detail;
    } catch {
      // resposta não é JSON: mostra o começo do texto
    }
    if (res.status === 401 || res.status === 403) throw new FatalLlmError(`API key inválida ou sem permissão (${res.status}): ${detail}`);
    if (res.status === 404) throw new Error(`Modelo ou endereço não encontrado (404): ${detail}`);
    if (res.status === 429) throw new Error('Limite de uso da API atingido. Tente de novo em alguns minutos.');
    throw new Error(`Erro da API (${res.status}): ${detail}`);
  }
  return JSON.parse(text);
}

function parseJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('O modelo não devolveu um JSON válido.');
  }
}
