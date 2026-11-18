import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { setLocale } from '../src/i18n.js';
import { leadingLabels, loadTasks, slugifyTask, tasksFor, validateTask, validateTasks, withIds } from '../src/tasks.js';
import { analyze } from '../src/report.js';

setLocale('en');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-tasks-'));
const quiet = async (fn) => {
  const log = console.log;
  const warn = console.warn;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    await fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return lines;
};

test('ids gerados a partir do texto, sem palavras de ligação e sem repetir', () => {
  assert.equal(slugifyTask('Você quer saber quanto custa o plano mais barato.'), 'quanto-custa-plano-barato');
  assert.equal(slugifyTask('You want to find out how much the cheapest plan costs'), 'cheapest-plan-costs');
  const tasks = withIds([{ task: 'Talk to a person' }, { task: 'Talk to a person!' }, { id: 'keep-me', task: 'X task text' }]);
  assert.deepEqual(tasks.map((x) => x.id), ['talk-person', 'talk-person-2', 'keep-me']);
});

test('validação: campos, passo a passo e personas que não existem', () => {
  assert.deepEqual(validateTask({ id: 'price', task: 'You want to know how much the cheapest plan costs.' }), { errors: [], warnings: [] });
  const steps = validateTask({ id: 'price', task: 'Click Pricing → look at the first card' });
  assert.equal(steps.errors.length, 0);
  assert.match(steps.warnings.join(), /step-by-step/);
  assert.match(validateTask({ id: 'Bad Id', task: 'You want to know the price.' }).errors.join(), /invalid id/);
  assert.match(validateTask({ id: 'x', task: '' }).errors.join(), /task/);
  assert.match(validateTask({ id: 'x', task: 'You want to know the price.', personas: ['nobody'] }, ['margaret']).errors.join(), /nobody/);
});

test('tarefa que entrega a resposta: usa o rótulo exato de um link ou botão', () => {
  const tasks = [
    { id: 'a', task: 'Open Pricing and check the cheapest plan' },
    { id: 'b', task: 'You want to know how much the cheapest plan costs' },
    { id: 'c', task: 'Você quer falar com a área de contato' },
  ];
  const labels = ['Pricing', 'Home', 'Contato', 'Ok', 'A very long label that goes on and on beyond forty characters'];
  assert.deepEqual(leadingLabels(tasks, labels), [
    { id: 'a', task: tasks[0].task, labels: ['pricing'] },
    { id: 'c', task: tasks[2].task, labels: ['contato'] },
  ]);
});

test('tarefas por persona', () => {
  const tasks = [{ id: 'all', task: 'For everyone' }, { id: 'only', task: 'Only Margaret', personas: ['margaret'] }];
  assert.deepEqual(tasksFor(tasks, 'margaret').map((x) => x.id), ['all', 'only']);
  assert.deepEqual(tasksFor(tasks, 'lucas').map((x) => x.id), ['all']);
});

test('init --task grava as tarefas sem duplicar ao rodar de novo; task validate confere o arquivo', async () => {
  const { init } = await import('../src/init.js');
  const dir = tmp();
  const args = { cwd: dir, yes: true, tools: 'none', personas: 'margaret', url: 'http://localhost:3000', tasks: ['You want to know how much the cheapest plan costs.'] };
  const lines = await quiet(async () => {
    await init(args);
    await init({ ...args, tasks: ['You want to know how much the cheapest plan costs.', 'You want to talk to a person about your order.'] });
  });
  const { tasks } = loadTasks(dir);
  assert.deepEqual(tasks.map((x) => x.id), ['cheapest-plan-costs', 'talk-person-order']);
  assert.ok(lines.some((l) => /2 task\(s\) in \.ux-validate\/tasks\.yml/.test(l)));
  assert.equal(YAML.parse(fs.readFileSync(path.join(dir, 'ux-validate.config.yml'), 'utf8')).tasks, '.ux-validate/tasks.yml');
  await quiet(() => validateTasks({ cwd: dir }));

  fs.writeFileSync(path.join(dir, '.ux-validate/tasks.yml'), YAML.stringify([{ id: 'x', task: 'Some task text', personas: ['nobody'] }]));
  await assert.rejects(quiet(() => validateTasks({ cwd: dir })), /1 task\(s\) with errors/);
});

test('sem tarefas, o init avisa que o ux-test vai pedir', async () => {
  const { init } = await import('../src/init.js');
  const lines = await quiet(() => init({ cwd: tmp(), yes: true, tools: 'none', personas: 'margaret' }));
  assert.ok(lines.some((l) => /No tasks in \.ux-validate\/tasks\.yml yet/.test(l)));
});

test('check avisa quando uma tarefa usa as palavras de um link do site', { timeout: 120000 }, async () => {
  const { runChecks } = await import('../src/checks.js');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.ux-validate'));
  fs.writeFileSync(
    path.join(dir, '.ux-validate/tasks.yml'),
    YAML.stringify([
      { id: 'leading', task: 'Go to Pricing and find the cheapest plan' },
      { id: 'fine', task: 'You want to know how much the cheapest plan costs' },
    ]),
  );
  const out = path.join(dir, 'run');
  let result;
  const lines = await quiet(async () => {
    ({ result } = await runChecks({ cwd: dir, url: pathToFileURL(path.resolve('examples/demo-site/index.html')).href, out }));
  });
  assert.deepEqual(result.taskWarnings.map((w) => [w.id, w.labels]), [['leading', ['pricing']]]);
  assert.ok(lines.some((l) => /Task "leading" uses the exact words/.test(l)));
});

test('relatório: tabela de tarefas por persona e nota de objetivos com metas e tarefas', () => {
  const tasks = [
    { id: 'price', task: 'You want to know how much the cheapest plan costs.', success: 'The price shows on screen.' },
    { id: 'phone', task: 'You want to talk to a person.', personas: ['margaret'] },
  ];
  const agent = {
    personas: [
      {
        id: 'margaret',
        name: 'Margaret',
        viewport: 'mobile',
        goals: [{ goal: 'Understand the offer', outcome: 'success', steps: 1 }],
        tasks: [
          { id: 'price', outcome: 'partial', steps: 6, firstClick: { label: 'Products', onPath: false }, backtracks: 2, notes: 'Looked under Products first.' },
          { id: 'phone', outcome: 'fail', steps: 5, lostAt: { page: 'http://x/contact', screenshot: 'screenshots/m-phone.png' } },
        ],
      },
      { id: 'lucas', name: 'Lucas', viewport: 'desktop', goals: [], tasks: [{ id: 'price', outcome: 'success', steps: 3, firstClick: { label: 'Pricing', onPath: true } }] },
    ],
    findings: [],
  };
  const checks = { url: 'http://x/', pages: [], findings: [], taskWarnings: [{ id: 'price', labels: ['pricing'] }] };
  const d = analyze(checks, agent, { tasks });
  const price = d.tasks.find((x) => x.id === 'price');
  assert.deepEqual(price.results.map((r) => [r.persona.id, r.applies, r.result?.outcome]), [['margaret', true, 'partial'], ['lucas', true, 'success']]);
  const phone = d.tasks.find((x) => x.id === 'phone');
  assert.deepEqual(phone.results.map((r) => [r.persona.id, r.applies]), [['margaret', true], ['lucas', false]]);
  // Margaret: 1 meta (1) + 2 tarefas (0,5 e 0) = 1,5 de 3 = 50%.
  assert.equal(d.scores.find((s) => s.persona.id === 'margaret').goalRate, 50);
  assert.equal(d.scores.find((s) => s.persona.id === 'lucas').goalRate, 100);
});

test('relatório em Markdown e HTML com a seção de tarefas', async () => {
  const { buildReport } = await import('../src/report.js');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.ux-validate'));
  fs.writeFileSync(path.join(dir, '.ux-validate/tasks.yml'), YAML.stringify([{ id: 'price', task: 'You want to know how much the cheapest plan costs.', success: 'The price shows on screen.' }]));
  const run = path.join(dir, 'run');
  fs.mkdirSync(run);
  fs.writeFileSync(path.join(run, 'checks.json'), JSON.stringify({ url: 'http://x/', pages: [], findings: [], taskWarnings: [{ id: 'price', labels: ['pricing'] }] }));
  fs.writeFileSync(
    path.join(run, 'findings.json'),
    JSON.stringify({ personas: [{ id: 'margaret', name: 'Margaret', goals: [], tasks: [{ id: 'price', outcome: 'fail', steps: 7, firstClick: { label: 'Products', onPath: false } }] }], findings: [] }),
  );
  await quiet(() => buildReport({ cwd: dir, run }));
  const md = fs.readFileSync(path.join(run, 'report.md'), 'utf8');
  assert.match(md, /## Tasks/);
  assert.match(md, /\| You want to know how much the cheapest plan costs\. \| ❌ 7 \|/);
  assert.match(md, /first click: "Products" \(off the path\)/);
  assert.match(md, /Success criterion:\*\* The price shows on screen\./);
  assert.match(md, /Task "price" uses the exact words/);
  const html = fs.readFileSync(path.join(run, 'report.html'), 'utf8');
  assert.match(html, /<table class="tasks">/);
  assert.match(html, /doesn&#39;t replace a usability test with real people/);
});
