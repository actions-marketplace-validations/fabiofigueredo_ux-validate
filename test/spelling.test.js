import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSpeller, findWords } from '../src/spelling.js';
import { setLocale } from '../src/i18n.js';

// Estes testes conferem as mensagens em português.
setLocale('pt-BR');

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-spell-'));
fs.mkdirSync(path.join(cwd, '.ux-validate'));
fs.writeFileSync(path.join(cwd, '.ux-validate/dicionario.txt'), '# marcas\nnuvemzinha\n');
const speller = await createSpeller({ cwd, language: 'pt-BR', ignore: ['Kanbanize'] });
const words = (segments) => findWords(segments, speller);

test('aponta erros de ortografia com sugestão', () => {
  const { unknown } = words(['Atendimento incrivel e suporte atravez do chat, sem excessão.']);
  assert.deepEqual(unknown.map((u) => u.word), ['incrivel', 'atravez', 'excessão']);
  assert.ok(speller.suggest('excessão').includes('exceção'));
});

test('separa palavras em inglês de erros', () => {
  const { unknown, foreign } = words(['Pricing', 'Clique em Get started']);
  assert.deepEqual(unknown, []);
  assert.deepEqual(foreign.map((f) => f.word).sort(), ['Pricing', 'started']);
});

test('ignora nomes próprios, marcas, siglas, URLs, e-mails, templates e lorem ipsum', () => {
  const { unknown, foreign } = words([
    'Fale com a equipe da Nuvemzinha pelo WhatsApp ou no iPhone.',
    'Envie o CPF para contato@empresa.com.br ou acesse https://exemplo.dev/ajuda',
    '{{plan.limit}} usuários e ${total} reais',
    'Lorem ipsum dolor sit amet, consectetur adipiscing.',
    'Usamos o Kanbanize. kanbanize também.',
    'nuvemzinha é a nossa marca',
  ]);
  assert.deepEqual(unknown, []);
  assert.deepEqual(foreign, []);
});

test('palavra com inicial maiúscula no começo da frase é verificada', () => {
  const { unknown } = words(['Concerteza vamos ajudar. Paciencia é tudo.']);
  assert.deepEqual(unknown.map((u) => u.word), ['Concerteza', 'Paciencia']);
});

test('idioma sem dicionário desativa a verificação', async () => {
  assert.equal(await createSpeller({ cwd, language: 'ja' }), null);
});
