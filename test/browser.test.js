import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installBrowserArgs, playwrightCli } from '../src/browser.js';

test('install-browser usa o cli.js do Playwright do próprio ux-validate', () => {
  assert.ok(fs.existsSync(playwrightCli()));
  assert.ok(playwrightCli().endsWith(path.join('playwright', 'cli.js')));
});

test('install-browser não aciona o aviso de "npm install" quando roda do cache do npx', () => {
  // Um cli.js falso numa pasta "_npx", como no plugin (npx -y ux-validate@…): imprime o que o Playwright veria.
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uxv-')), '_npx', 'abc', 'playwright');
  fs.mkdirSync(dir, { recursive: true });
  const cli = path.join(dir, 'cli.js');
  fs.writeFileSync(cli, 'console.log(JSON.stringify(process.argv.slice(1)));\n');
  const out = spawnSync(process.execPath, installBrowserArgs(cli, ['--with-deps']), { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const argv = JSON.parse(out.stdout);
  assert.doesNotMatch(argv[0], /_npx/, 'o Playwright decide o aviso por process.argv[1]');
  assert.deepEqual(argv.slice(1), ['install', 'chromium', '--with-deps']);
});
