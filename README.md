# ux-validate

**English** · [Português](README.pt-BR.md)

Persona-based testing of the **content**, **navigation**, **interface** and **accessibility** of web apps, whether AI-generated or not, run by the AI agent you already use.

Instead of just saying "contrast is below 4.5:1", ux-validate answers: *can Margaret, 68, on her phone, find out how much your product costs?* And if she can't, it shows where she got stuck, why, and which file to fix.

![ux-validate report with scores by persona and goals achieved](docs/report-example.png)

> **Status:** early version (0.3). Works with **Claude Code**, **Cursor**, **Codex CLI** and **Gemini CLI**.

## How it works

```
/ux-test
   │
   ├─ 1. Automated checks  (npx ux-validate check)
   │     axe-core, WAI-ARIA and keyboard, broken links, console errors,
   │     horizontal scrolling, spelling, placeholder text (lorem ipsum, NaN)…
   │     → same result with any language model
   │
   ├─ 2. Browsing as each persona  (agent + Playwright MCP)
   │     tries to achieve their goals, with their limitations,
   │     and evaluates content, navigation, interface and accessibility
   │     through their eyes; tests widgets with the keyboard (APG patterns)
   │     and reviews spelling and grammar
   │
   ├─ 3. Points to the likely file for each issue in your code
   │
   └─ 4. Report  (npx ux-validate report)
         scores by persona, goals achieved, issues with evidence
         and suggested fixes → report.md + report.html

/ux-fix  or  npx ux-validate fix
   └─ applies the fixes to the code, showing each change before saving
```

ux-validate runs **inside your AI tool**: the model used is whichever one that tool is using.

## Supported AI tools

Setup installs the same commands (`ux-test`, `ux-report`, `ux-fix`, `ux-persona`) in each tool's own format, plus the Playwright MCP server the agent uses as its browser. You can pick several tools at once.

| Tool | Commands are installed in | How to call them | Browser (MCP) registered in |
|---|---|---|---|
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | `/ux-test` | `.mcp.json` |
| **Cursor** | `.cursor/commands/<name>.md` | `/ux-test` in the agent chat | `.cursor/mcp.json` |
| **Codex CLI** | `.agents/skills/<name>/SKILL.md` (with `agents/openai.yaml`) | `$ux-test` | `.codex/config.toml` |
| **Gemini CLI** | `.gemini/commands/<name>.toml` | `/ux-test` | `.gemini/settings.json` |

Notes:

- The commands only run when you call them: the tests open a browser and use tokens. In Claude Code this is `disable-model-invocation`; in Codex, `allow_implicit_invocation: false`.
- Codex reads `.codex/config.toml` and Gemini reads `.gemini/settings.json` only in folders you **trust**; accept the prompt the first time you open the project.
- Existing config files are preserved: setup only adds the `playwright` server if it isn't there.
- The Playwright MCP server is installed at a **pinned version** (`@playwright/mcp@0.0.83`), not `@latest`, so no new, unreviewed version is downloaded and run without you knowing. If you installed an earlier ux-validate version, replace `@latest` with the pinned version in your tool's MCP file.
- Gemini CLI also reads `.agents/skills/`. If you install both Codex and Gemini, Gemini may list the Codex skills too; use the `/ux-…` commands, and Gemini asks for confirmation before activating any skill.
- Arguments go after the command name in every tool, e.g. `/ux-test margaret` or `$ux-test margaret`.

## Languages

ux-validate speaks **English** and **Portuguese**: terminal messages, setup, report, check findings and agent instructions.

- Setup detects your system language and asks which one to use. The choice is saved as `locale` in `ux-validate.config.yml`.
- To switch for a single command: `npx ux-validate check --lang pt-BR`.
- The **tool's language** (`locale`) is separate from the **language of your app's content** (`language`), which the spell check uses. You can run the tool in English on a site written in Portuguese, and vice versa.

## Accessibility and WAI-ARIA

The **Accessibility** category combines three layers:

| Layer | What it checks |
|---|---|
| **axe-core** | ARIA syntax (valid roles, attributes and values), accessible names, contrast, alternative text and the other WCAG 2.2 AA rules |
| **ARIA behavior checks** | Tabs through every page and finds: keyboard traps, invisible focus, focus on hidden elements, widgets with a `role` that can't receive focus, clickable elements with no keyboard access (`<div onclick>`), `aria-expanded` that doesn't change on open/close, fields labeled only by a placeholder |
| **Agent** | Tests each widget with the keyboard following the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) (dialogs, tabs, accordions, menus, combobox…), checks whether dynamic messages are announced (`role="status"`/`alert`) and browses as a screen reader user would |

Each run also saves every page's **accessibility tree** in `.ux-validate/runs/<date-time>/aria/`: roles, names and states, i.e. what a screen reader announces. The report links each accessibility issue to its page's tree.

## React apps

ux-validate tests the app in the browser, so it works with any React setup: Vite, Next.js, Create React App, React Router, Remix or Gatsby. For React apps and other SPAs (which switch screens without reloading), it does more:

- **Setup:** detects the framework in `package.json` and suggests the development server URL and command (e.g. Vite → `http://localhost:5173` and `npm run dev`).
- **Where to fix:** on the development server, each issue comes with the **component** that rendered the element (`Home › App`) and the **JSX file and line** (e.g. `src/App.jsx:9`), read from React's debug info and the server's source map. This feeds the report, SARIF (annotation on the right PR line) and `fix`.
- **Routes:** waits for React to render before analyzing, follows History API and hash routes (`#/plans`) and recognizes the app's "page not found" screen even when the server answers 200 (a broken link in an SPA).
- **Dedicated checks:**

| Check | What it finds |
|---|---|
| Blank page | Render error without an Error Boundary, which unmounts the whole tree |
| React warnings | List without `key`, hydration error, invalid HTML nesting, render loop, controlled/uncontrolled field |
| Route change | Focus that doesn't move and nothing announced to screen readers; tab title that doesn't change |
| Clickable elements | React `<div onClick>`, which doesn't show up as `onclick` in the HTML |

Screens without a link (opened by a button, for example) go in the config:

```yaml
crawl:
  routes: [/checkout, /account/orders]
```

> Use the development server to get components, files and lines. With a production build the checks still work, but names are minified and there are no source files.

To see it working, there's a sample app with issues on purpose in `examples/react-demo`:

```bash
npm run demo:react
```

```bash
npx ux-validate check --url http://localhost:5173
```

## Spell check

Spelling is checked **offline**, with Hunspell and the LibreOffice dictionaries. No text leaves your machine. Languages: English, Brazilian Portuguese and Spanish (`language` in `ux-validate.config.yml`).

- Flags unknown words with suggested corrections (`recieve` → `receive`) and, in Portuguese or Spanish content, English words in the middle of the text.
- Ignores proper names, brands (`WhatsApp`), acronyms, URLs, emails and template variables.
- Correct words the dictionary doesn't know (your company name, technical terms) go in `.ux-validate/dictionary.txt` (or `dicionario.txt` when the tool runs in Portuguese; both are read), one per line, or in `spelling.ignore` in the config.
- In `/ux-test`, the agent reviews these findings, discards false positives and reviews the **grammar** ("their" × "there", "its" × "it's"…), which the dictionary doesn't catch.

## Applying the fixes

After the report, ux-validate can fix the code for you, in two ways:

| | `/ux-fix` (in Claude Code) | `npx ux-validate fix` (in the terminal) |
|---|---|---|
| **Model** | Whatever Claude Code is using | The provider and model chosen in setup: Anthropic, OpenAI, Google or Ollama (local) |
| **Cost** | Usage of your Claude Code account | Tokens billed to **your** provider account, with **your** API key |
| **How it works** | The agent fixes one issue at a time and runs the checks again to confirm | Sends each file with its issues to the model, gets the proposed text replacements and shows the diff before saving |

Both fix only what is in the report, prefer semantic HTML over ARIA and **never make up data** (phone numbers, prices, testimonials): when information is missing, they tell you what's needed.

```bash
npx ux-validate fix                       # critical, high and medium issues from the latest run
npx ux-validate fix --ids A001,C003       # only these issues
npx ux-validate fix --severity high       # only critical and high
npx ux-validate fix --dry-run             # show the fixes without saving
```

Before calling the model, `fix` shows which files it will send and an estimate of tokens, and asks for confirmation. Each proposed replacement must match exactly one unique piece of the file; those that don't are discarded. The original files are saved in `.ux-validate/runs/<date-time>/fixes/backup/`, and the result for each issue (with the tokens used) in `fixes/fixes.json`.

> **Privacy:** with `fix` in the terminal, the content of the files being fixed is sent to the chosen provider. With Ollama, everything runs on your machine.

The API key is never stored in `ux-validate.config.yml`, which only keeps the name of the environment variable. Set the key before running:

```bash
export ANTHROPIC_API_KEY=your-key
```

```powershell
$env:ANTHROPIC_API_KEY="your-key"
```

## Installation

Requirements: **Node.js 20+** and one of the supported AI tools: **Claude Code**, **Cursor**, **Codex CLI** or **Gemini CLI**.

In the project you want to test:

```bash
npm install -D ux-validate
```

```bash
npx playwright install chromium
```

```bash
npx ux-validate init
```

Setup asks for:

- the **tool's language** (English or Portuguese);
- **which AI tools** you'll use the commands in (Claude Code, Cursor, Codex CLI, Gemini CLI; one or more);
- the app's **URL** and, optionally, the command to start it;
- the **screen sizes** (mobile, tablet, desktop);
- the **language of the content**, for the spell check;
- whether to set up a **model to apply fixes from the terminal** (`npx ux-validate fix`): **provider** (Anthropic, OpenAI, Google, Ollama), **model** and the name of the environment variable holding your API key;
- **which personas to use** (mandatory step): setup shows the predefined personas with each one's characteristics, and you choose to use them (all or only some), create your own right there, or both. See [Personas](#personas).

And creates:

| File | Purpose |
|---|---|
| `ux-validate.config.yml` | Configuration |
| `.ux-validate/personas/*.yml` | Your personas |
| `.ux-validate/references/` | Heuristics and formats the agent consults |
| `.ux-validate/dictionary.txt` | Correct words the dictionary doesn't know |
| The commands and MCP files for each chosen tool | See [Supported AI tools](#supported-ai-tools) |

Use `--yes` to accept the defaults without questions, `--tools claude-code,cursor,codex,gemini` to choose the tools without questions, `--personas all|none|margaret,raj-dev` to choose the predefined personas without questions (default: `all`), and `--force` to overwrite existing files.

> **Upgrading from an earlier version?** The agent commands were renamed: `/persona-test` → `/ux-test`, `/persona-report` → `/ux-report`, `/persona-fix` → `/ux-fix` and `/persona-new` → `/ux-persona`. Run `npx ux-validate init` again: it installs the new ones and removes the old ones it had created.

## Usage

In your AI tool, inside your project (in Codex, use `$` instead of `/`):

| Command | What it does |
|---|---|
| `/ux-persona` | Creates a persona by talking with you about who uses the app |
| `/ux-test` | Tests with every persona and builds the report |
| `/ux-test margaret` | Tests with a single persona |
| `/ux-test --only accessibility` | Evaluates a single category (`content`, `navigation`, `ui`, `accessibility`) |
| `/ux-report` | Rebuilds the latest run's report and drafts a fix plan |
| `/ux-report --compare` | Shows what was resolved, what remains and what's new |
| `/ux-fix` | Applies the report's fixes (critical, high and medium) |
| `/ux-fix A001,C003` | Applies only the fixes for these issues |

From the terminal (useful in CI):

```bash
npx ux-validate persona examples # show the predefined personas and their characteristics
npx ux-validate persona add all  # copy the predefined ones into the project (or: add margaret)
npx ux-validate persona new      # create a persona with a step-by-step wizard
npx ux-validate persona validate # check the persona files
npx ux-validate check            # automated checks only
npx ux-validate report           # report for the latest run
npx ux-validate fix              # apply the fixes with the model set up in init
```

Results go in `.ux-validate/runs/<date-time>/` (already added to `.gitignore`).

## GitHub Action

Run the automated checks on every pull request, with a summary comment on the PR, annotations on the changed lines (SARIF / code scanning) and the full report as a downloadable artifact.

```yaml
# .github/workflows/ux-validate.yml
name: ux-validate
on: pull_request

permissions:
  contents: read
  pull-requests: write   # PR comment
  security-events: write # SARIF upload to code scanning

jobs:
  ux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci
      - uses: fabiofigueredo/ux-validate@main
        with:
          start: npm run dev
          url: http://localhost:3000
          fail-on: critical
```

| Input | Default | What it does |
|---|---|---|
| `url` | `app.url` from the config | URL to test (a local server or a preview deployment) |
| `start` | — | Command that starts the app in the background; the action waits for the URL to respond |
| `wait-timeout` | `120` | Seconds to wait for the URL |
| `working-directory` | `.` | Folder of the app (monorepos) |
| `fail-on` | — (never fails) | Fail the job with issues of this severity or worse: `critical`, `high`, `medium`, `low` |
| `comment` | `true` | Post a summary on the PR, updating the same comment on every push |
| `sarif` | `true` | Upload SARIF to code scanning |
| `upload-sarif` | `true` | With `false`, builds the SARIF file (kept in the report artifact) without sending it to code scanning, e.g. when testing on a demo site with issues on purpose |
| `language` | config `locale`, then English | `en` or `pt-BR` for the comment and report |

Outputs: `issues`, `critical`, `high`, `report-dir`, `sarif-file`. The summary also appears in the job's summary page.

Notes:

- The action runs the **automated checks** (accessibility, WAI-ARIA, links, spelling, layout). The persona evaluation needs an AI tool and runs locally with `/ux-test`.
- Code scanning is free on public repositories; on private ones it needs GitHub Advanced Security. Without it, the SARIF upload step is skipped with a warning and everything else still works.
- On pull requests from forks, GitHub gives a read-only token: the comment step is skipped with a warning.
- A sample workflow is in [`examples/github-workflow.yml`](examples/github-workflow.yml).

Without the action, in any CI:

```bash
npx ux-validate check --url http://localhost:3000 --fail-on high   # exit code 2 when the threshold is hit
npx ux-validate sarif --out ux-validate.sarif
npx ux-validate comment --out comment.md
```

## Personas

A persona is a real kind of user of your app, written as a YAML file in `.ux-validate/personas/`. There's no test without at least one persona, so **choosing personas is a mandatory step**: during setup and, if the folder is empty, at the start of `/ux-test`, which shows the predefined personas and asks what you prefer before opening the browser.

### Predefined personas

| Persona | Who they are | Device | Tech literacy | Vision | Patience | Reading | Goals |
|---|---|---|---|---|---|---|---|
| **Margaret** (`margaret`) | 68, retired; uses messaging and her banking app, sometimes with her grandson's help | Phone | Low | Reduced | Low | Basic | Understand what the company offers; find out the price; find a phone number |
| **Lucas** (`lucas-screen-reader`) | 35, financial analyst, blind since childhood; uses a screen reader and keyboard | Computer | High | Screen reader | Medium | Advanced | Understand the offer by navigating headings only; fill in the contact form |
| **Raj** (`raj-dev`) | 29, developer; evaluates tools for the team and compares with competitors | Computer | High | Normal | Medium | Advanced | Compare plans and limits; create a trial account; find the docs |

To see the full card (with expectations) run `npx ux-validate persona examples`; to add them later, `npx ux-validate persona add <id>` or `all`. Adjust the goals to your product.

### Create your own

- **`/ux-persona` in Claude Code:** the agent interviews you about the real user (who they are, which device, limitations, what they come to do), can look at your app to suggest goals, shows the file and saves it after you confirm. You can start with a description: `/ux-persona older customer who shops on their phone`.
- **`npx ux-validate persona new` in the terminal:** a step-by-step wizard with multiple-choice questions for each trait. It doesn't use a language model.

Both check the file with `npx ux-validate persona validate`, which you can also run any time to check every persona in the project (required fields, valid values, repeated ids).

```yaml
id: margaret
name: Margaret
description: 68, retired, uses her phone with her grandson's help.
viewport: mobile
traits:
  tech_literacy: low        # raises the weight of jargon and unlabeled icons
  vision: reduced           # raises the weight of contrast and small fonts
  patience: low             # gives up after a few steps without progress
  language: en
  reading_level: basic
goals:
  - Find out how much it costs
  - Find a phone number to talk to a person
```

Full format and the effect of each trait: [`source/en/references/persona-format.md`](source/en/references/persona-format.md). Trait values can be in English or Portuguese.

## Try it with the demo site

`examples/demo-site` is a site with problems planted on purpose (broken links, lorem ipsum, a layout that overflows on mobile, an inaccessible form, tabs and an accordion with broken ARIA, spelling mistakes…). Its content is in Portuguese, which also shows the tool and content languages working independently. Great for seeing the tool at work before using it on your project.

**1. Clone and serve the site** (keep this terminal open):

```bash
git clone https://github.com/fabiofigueredo/ux-validate.git
```

```bash
cd ux-validate && npm install && npx playwright install chromium
```

```bash
npm run demo:serve
```

The site is at http://localhost:4321/index.html.

**2. Create a test project** in another terminal, next to the `ux-validate` folder:

```bash
mkdir test-project && cd test-project && npm init -y
```

```bash
npm install -D ../ux-validate
```

```bash
npx ux-validate init
```

When setup asks for the URL, enter `http://localhost:4321/index.html`, and choose **Portuguese (Brazil)** as the content language.

> You can also test HTML files straight from disk, with no server, using a `file://` URL (e.g. `file:///C:/projects/my-site/index.html`). Prefer `http://` whenever the app has a server: that's how real users will reach it.

**3. Run the automated checks:**

```bash
npx ux-validate check
```

```bash
npx ux-validate report
```

Open `report.html` in `.ux-validate/runs/<date-time>/`.

**4. Run the persona test:** open the `test-project` folder in VS Code, open Claude Code, approve the `playwright` MCP server (or enable it with `/mcp`) and type `/ux-test margaret`.

`examples/sample-findings.en.json` shows the kind of result the agent produces.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `/ux-test` doesn't show up | The open folder must be the project where you ran `init` (the one with `.claude/`, `.cursor/`, `.agents/` or `.gemini/`). In Gemini CLI, run `/commands reload` |
| The agent has no browser tools | Approve or enable the `playwright` MCP server in your tool; in Codex and Gemini, trust the project folder |
| Error saying the browser wasn't found | Run `npx playwright install chromium` in the project |
| "The start page doesn't open" | Check that the app is running and that `app.url` is right |
| You want to change the URL after setup | Edit `app.url` in `ux-validate.config.yml` |

## Project structure

```
bin/ux-validate.js           CLI (init, check, report, fix, persona)
src/init.js                  interactive setup
src/checks.js                automated checks (Playwright + axe-core)
src/aria.js                  WAI-ARIA and keyboard checks
src/spelling.js              spell check (Hunspell)
src/fix.js                   automatic fixes from the report
src/llm.js                   provider clients (Anthropic, OpenAI, Google, Ollama)
src/persona.js               persona wizard and validation
src/report.js                scores and report (Markdown + HTML)
src/sarif.js                 SARIF export (GitHub code scanning)
src/comment.js               pull request comment
action.yml                   GitHub Action
src/i18n.js                  tool language
src/locales/                 messages in English (en.js) and Portuguese (pt-BR.js)
src/adapters/                one adapter per AI tool
source/<lang>/commands/      commands written once, independent of the AI tool
source/<lang>/references/    heuristics, content guide, WAI-ARIA guide, persona and findings formats
source/<lang>/personas/      example personas
examples/                    demo site and sample results
test/                        tests (npm test)
```

### Adding an AI tool

The commands in `source/<lang>/commands/` use placeholders (`{{WORK_DIR}}`, `{{CHECK_CMD}}`…) and don't depend on any tool. To support a new one, create `src/adapters/<tool>.js` with `{ id, label, available: true, invoke(name), install({ cwd, commands, force }) }`, writing the commands in the format that tool understands (`src/adapters/shared.js` has helpers to adapt the argument placeholder and register the MCP server), register it in `src/adapters/index.js`, and add its next-step line to `init.next.tools` in the message catalogs.

### Adding a language

1. Copy `src/locales/en.js` to `src/locales/<lang>.js`, translate it and register it in `src/i18n.js`.
2. Copy `source/en/` to `source/<lang>/` and translate the commands, references and personas.
3. Run `npm test`: a test checks that every catalog has the same keys.

## Roadmap

- [x] Interactive setup, Claude Code adapter, `/ux-test` and `/ux-report`
- [x] Automated checks and report with scores by persona
- [x] Accessibility with WAI-ARIA, and spell check
- [x] `/ux-fix` and `npx ux-validate fix` (apply fixes with the user's model)
- [x] English and Portuguese
- [x] Adapters for Cursor, Codex CLI and Gemini CLI
- [x] GitHub Action with a PR comment and SARIF output
- [x] `/ux-persona` and `npx ux-validate persona new` (create personas)
- [x] React apps: component, file and line for each issue, SPA routes and React warnings
- [ ] Persona browsing from the terminal (no AI tool), with the model chosen in setup
- [ ] Repeat the browsing and only confirm issues that show up in more than one run

## Contributing

Suggestions and PRs are welcome. Run `npm test` before opening a PR. To change the agent's behavior, edit the commands in `source/<lang>/commands/` and the references in `source/<lang>/references/` (keep both languages in sync): they apply to every AI tool.

## Environment variables

| Variable | Purpose |
|---|---|
| `UX_VALIDATE_LOCALE` | Tool language (`en` or `pt-BR`) when the config has no `locale` |
| `UX_VALIDATE_CHROMIUM` | Path to an already-installed Chromium, if you don't want Playwright's |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | API key used by `npx ux-validate fix` (the variable name is configurable in setup) |
| `DEBUG` | Shows the full error when a command fails |

## License

[MIT](LICENSE) © Fabio Figueredo
