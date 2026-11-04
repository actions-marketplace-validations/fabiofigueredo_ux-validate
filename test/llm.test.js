import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { completeJson } from '../src/llm.js';

/** Servidor local que imita a API de um provedor e guarda o pedido recebido. */
async function fakeServer(handler) {
  const seen = {};
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      Object.assign(seen, { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
      handler(req, res, seen);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() };
}

const req = { system: 'sistema', prompt: 'corrija', schema: { type: 'object', properties: {}, additionalProperties: false } };
const answer = { edits: [], skipped: [{ findingId: 'A1', reason: 'falta dado' }] };

test('Anthropic: usa o SDK com saída estruturada, effort e fallback padrão', async () => {
  const srv = await fakeServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: JSON.stringify(answer) } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } });
    ev('message_stop', {});
    res.end();
  });
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.UXV_TEST_KEY = 'chave-de-teste';
  try {
    const out = await completeJson({ provider: 'anthropic', model: 'claude-opus-5-5', apiKeyEnv: 'UXV_TEST_KEY' }, req);
    assert.deepEqual(out.data, answer);
    assert.deepEqual(out.usage, { input: 100, output: 42 });
    // O SDK 1.x envia a API key como Bearer.
    assert.equal(srv.seen.headers.authorization, 'Bearer chave-de-teste');
    assert.match(srv.seen.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(srv.seen.body.fallbacks, 'default');
    assert.equal(srv.seen.body.output_config.format.type, 'json_schema');
    assert.equal(srv.seen.body.output_config.effort, 'high');
    assert.equal(srv.seen.body.stream, true);
    assert.equal(srv.seen.body.thinking, undefined);
  } finally {
    delete process.env.ANTHROPIC_BASE_URL;
    srv.close();
  }
});

test('Anthropic: recusa vira erro claro', async () => {
  const srv = await fakeServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    ev('message_delta', { delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'teste' } }, usage: { output_tokens: 0 } });
    ev('message_stop', {});
    res.end();
  });
  process.env.ANTHROPIC_BASE_URL = srv.url;
  try {
    await assert.rejects(completeJson({ provider: 'anthropic', model: 'claude-opus-5-5', apiKeyEnv: 'UXV_TEST_KEY' }, req), /recusou/);
  } finally {
    delete process.env.ANTHROPIC_BASE_URL;
    srv.close();
  }
});

test('OpenAI: chat completions com json_schema estrito e a chave do usuário', async () => {
  const srv = await fakeServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: 'x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  process.env.UXV_OPENAI = 'sk-teste';
  try {
    const out = await completeJson({ provider: 'openai', model: 'modelo', apiKeyEnv: 'UXV_OPENAI', baseUrl: srv.url }, req);
    assert.deepEqual(out.data, answer);
    assert.deepEqual(out.usage, { input: 10, output: 5 });
    assert.equal(srv.seen.url, '/v1/chat/completions');
    assert.equal(srv.seen.headers.authorization, 'Bearer sk-teste');
    assert.equal(srv.seen.body.response_format.json_schema.strict, true);
  } finally {
    srv.close();
  }
});

test('Ollama: /api/chat com o schema em format', async () => {
  const srv = await fakeServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: 'llama', message: { content: JSON.stringify(answer) }, prompt_eval_count: 7, eval_count: 3 }));
  });
  try {
    const out = await completeJson({ provider: 'ollama', model: 'llama', baseUrl: srv.url }, req);
    assert.deepEqual(out.usage, { input: 7, output: 3 });
    assert.equal(srv.seen.url, '/api/chat');
    assert.deepEqual(srv.seen.body.format, req.schema);
  } finally {
    srv.close();
  }
});

test('chave ausente gera instrução de como definir', async () => {
  delete process.env.UXV_SEM_CHAVE;
  await assert.rejects(completeJson({ provider: 'openai', model: 'm', apiKeyEnv: 'UXV_SEM_CHAVE' }, req), /\$env:UXV_SEM_CHAVE="sua-chave"/);
});
