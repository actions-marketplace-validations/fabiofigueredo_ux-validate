---
name: ux-audit
description: Audits a site that is already published (no source code needed) as
  each persona, with the automated checks, and writes a report with a plan for
  whoever maintains the site.
argument-hint: <site URL> [persona] [--only content|navigation|ui|accessibility]
disable-model-invocation: true
allowed-tools: Bash(npx -y ux-validate@1.1.0 *)
---

# /ux-validate:ux-audit

> **Language:** read `locale` in `ux-validate.config.yml` (`en` or `pt-BR`). Talk to the user in that language and write everything that goes into the report (titles, descriptions, suggestions, persona summaries) in that language. Without a config yet, use the language the user writes in.

You will audit a site that is **already published**, from its URL, without its source code: the automated checks plus a test **as if you were each persona**, trying the tasks and goals on the live site. At the end, you produce a report with evidence and a plan for whoever maintains the site.

Arguments received: `$ARGUMENTS`
- The site URL (e.g. `https://www.example.com`). If it is missing, ask for it.
- A persona name (its `id`) limits the test to that persona. With no name, test all of them.
- `--only content|navigation|ui|accessibility` limits the evaluation to one category.

Write everything (findings, summaries, your answer) in English.

## Rules for the whole audit

1. **Only sites the user is responsible for or is authorized to test.** Before anything else, ask: "Are you responsible for this site, or authorized to test it?" If the answer isn't a clear yes, stop.
2. **It's a live site, with real people and real data.** Never submit forms, log in, create accounts, buy, book, subscribe, send messages, or click sign out, delete, cancel or unsubscribe. The persona goes as far as the final button and you judge the path up to it. To see a form's error messages, leave a required field empty and move to the next one (that shows inline validation without submitting); don't press the submit button.
3. **Stop at login.** A page that asks for login or payment is a limit of the audit, not an issue with the site: record it in `limits` (Step 5) and move on.
4. **Every issue needs evidence**: a screenshot, a DOM snippet or the exact text on the page. **Don't make things up.**
5. **Stay in the persona's shoes.** They don't type URLs, don't open DevTools and don't know hidden routes. They only use what is visible on screen.
6. **Be gentle with the server.** Browse at a person's pace and only the site's own public pages. Don't visit the pages the automated audit skipped (listed in `checks-brief.md`).
7. **Save tokens without skipping anything.** Read each reference file once, only when the step that needs it starts. Every browser action already returns the page snapshot: don't call `browser_snapshot` again right after one. Take screenshots only as evidence of a problem or of where a persona got lost, of the visible area (not `fullPage`) or of just the element (`target`), with `scale: "css"`.

## Step 1: prepare

Each site has its own folder, `ux-validate-audits/<domain>/` (e.g. `ux-validate-audits/www.example.com/`), with its personas (`personas/`), its tasks (`tasks.yml`) and one folder per run. If it already exists, reuse its personas and tasks, and tell the user.

1. **Personas.** If the folder has none, run `npx -y ux-validate@1.1.0 persona examples` and show the user the predefined personas with each one's characteristics (who they are, device, tech literacy, vision, patience, reading level, goals). Ask whether they want **the predefined ones** (all or some), **their own**, or **both**, and wait for the answer. Predefined ones are added in Step 2 (`--personas`). To create one, follow the `/ux-validate:ux-persona` flow and save the file in `ux-validate-audits/<domain>/personas/` (format in `${CLAUDE_PLUGIN_ROOT}/references/persona-format.md`).
2. **Tasks (mandatory).** If the folder has no tasks, ask the user what people come to do on the site and write the tasks following `${CLAUDE_PLUGIN_ROOT}/references/tasks-format.md`: goals as scenarios, no step-by-step, without the words of the site's menus and buttons (open the home page and read the menu to avoid them), with a success criterion when possible. Show them and ask for confirmation.

## Step 2: automated audit

Run, with the personas and tasks from Step 1 (each new task in its own `--task`):

```bash
npx -y ux-validate@1.1.0 audit <url> --yes --personas <ids> --task "<task 1>" --task "<task 2>"
```

Use `--yes` only because the user already confirmed the authorization in rule 1. Leave out `--personas` and `--task` when the folder already has them. The command creates the folder, respects robots.txt, waits between pages, doesn't follow sign out/delete links, and writes a run folder `ux-validate-audits/<domain>/<date-time>/` with `checks-brief.md`, `checks.json`, screenshots, `color-vision/` and `aria/`. If you created personas or wrote tasks by hand, check them with `npx -y ux-validate@1.1.0 persona validate --dir ux-validate-audits/<domain>` and `npx -y ux-validate@1.1.0 task validate --dir ux-validate-audits/<domain>`.

Read `checks-brief.md` (not `checks.json`; open it only for the details of a specific id). These issues **are already recorded**: don't repeat them as your own findings. When one of them hurts a persona in a specific way, create your own finding explaining the impact and cite its id in `relatedChecks`.

## Step 3: browse as each persona

**One persona at a time, each in a clean context.** If your tool can delegate to a subagent with the same browser tools (e.g. the Agent/Task tool in Claude Code), give each persona to a subagent, **one after the other, never in parallel**. Pass it: the persona file, the tasks, the run folder, the path to these instructions (rules and Step 3), the references it needs and a range of ids for its findings (first persona `A101`–`A199`, second `A201`–`A299`…). It replies with only its entry in `personas`, its `findings` and its `limits`. Without subagents, do everything here, in order.

For each persona, with the Playwright MCP browser tools:

1. Resize the window to the persona's viewport: mobile 390×844, tablet 768×1024, desktop 1440×900.
2. **Tasks first.** For each task that applies to the persona (no `personas` field, or their id in it), start from the task's `start` (default: the site URL):
   - Read only the `task` text, as the persona would hear it. No typed URLs, no site search unless the persona would think of it, no shortcuts from what you saw with other personas.
   - Write down the **first click** and whether it led toward the goal (`onPath`); count steps and **backtracks**; stop at `success`, at 15 steps, or earlier if the persona would give up (e.g. `patience: low` after 3 or 4 steps without progress).
   - Where they got lost or gave up, take a screenshot (`lostAt`) and record why in `notes`. Create findings for the causes and list them in `blockers`.
   - If the task can only be finished by submitting a form, logging in or paying, stop at the final button: the outcome is `success` if they got there without trouble, and the limit goes in `limits`.
3. Then the persona's **goals**, in the same way, starting from the home page.
4. Along the way, evaluate through the persona's eyes, using `${CLAUDE_PLUGIN_ROOT}/references/heuristics.md` and `${CLAUDE_PLUGIN_ROOT}/references/content-guidelines.md`: **content** (do they understand it?), **navigation** (do they know where they are and how to go back?), **interface** (can they see it and use it?) and **accessibility** (with their tools and limitations).
5. **Cookie banners and pop-ups:** if one covers the content, that is a finding (how much it gets in the way, for whom). Close it the way a person would (the visible button) and go on.

Personas with `vision: screen-reader` browse **without looking at the screen**: only the keyboard (`browser_press_key`) and the accessibility tree. Personas with `vision: color-blind`: read `${CLAUDE_PLUGIN_ROOT}/references/color-vision.md` and simulate their type in the browser; open the images in `color-vision/` only for pages with `check:color` issues or with information told apart by color, and only the `normal` one and the persona's type. Adjust the rigor to the persona's traits (Portuguese values such as `baixa`, `reduzida`, `leitor-de-tela` mean `low`, `reduced`, `screen-reader`).

## Step 4: accessibility audit and spelling

Once per audit (not per persona), unless `--only` excludes them:

1. **WAI-ARIA**, following `${CLAUDE_PLUGIN_ROOT}/references/wai-aria.md`: for the pages visited, use the snapshot you already have (or the file in `aria/` for pages no persona visited). Test each kind of widget (dialogs, tabs, accordions, menus, combobox, carousels) with the keyboard, following its APG pattern, using `browser_snapshot` limited to the widget (`target`); `browser_find` helps locate a widget, but only here, never while browsing as a persona. Record findings with `category: "accessibility"`, the WCAG criterion and the APG pattern in `heuristic`.
2. **Spelling and grammar:** separate the false positives of `check:spelling` (names, brands, correct technical terms; list them in your answer), judge foreign words from each persona's point of view, and review the grammar of the pages you visited (`category: "content"`, `heuristic: "Grammar"`).

## Step 5: record and build the report

1. Write `findings.json` in the run folder, following `${CLAUDE_PLUGIN_ROOT}/references/findings-format.md`, with two differences: **don't fill in `sourceHint`** (there is no code; `page`, `evidence.selector` and the screenshot say where the issue is), and add `limits`, a list of sentences with what couldn't be tested (e.g. "Checkout: requires login", "Contact form: not submitted, as in every audit"). If you used subagents, put all their `personas`, `findings` and `limits` together.
2. Build the report:

```bash
npx -y ux-validate@1.1.0 report --dir ux-validate-audits/<domain>
```

3. If the folder has a previous run, compare: read its `findings.json` and `checks-brief.md` and show what was **resolved**, what **remains** and what is **new** (by title, page and element, not by id).
4. Answer the user with:
   - the table of scores by persona and the tasks table (task × persona), with where the personas got lost;
   - the limits of the audit;
   - the top of the "Plan for whoever maintains the site": what stops the personas, then the critical and high issues;
   - the path to `report.html`, which they can share with whoever maintains the site.

Don't offer `/ux-validate:ux-fix`: an audit has no code to change.
