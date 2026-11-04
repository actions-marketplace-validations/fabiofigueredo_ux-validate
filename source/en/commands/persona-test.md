---
name: persona-test
description: Tests the web app's content, navigation, interface and accessibility from each persona's point of view and writes a report with the issues and how to fix them.
shortDescription: Test the app as each persona
argumentHint: "[persona] [--only content|navigation|ui|accessibility]"
---

# /persona-test

You will test the app **as if you were each persona**: try to achieve their goals in the browser, with their limitations, and evaluate content, navigation, interface and accessibility from their point of view. At the end, you produce a report with evidence and suggested fixes.

Arguments received: `$ARGUMENTS`
- A persona name (its `id` or file name) limits the test to that persona. With no name, test all of them.
- `--only content|navigation|ui|accessibility` limits the evaluation to one category.

Write everything (findings, summaries, your answer) in English.

## Rules for the whole test

1. **Every issue needs evidence**: a screenshot, a DOM snippet or the exact text on the page. No evidence, no finding.
2. **Don't make things up.** If you couldn't check something (login, payment, a locked area), record it as a limitation in the persona's summary, not as an issue with the app.
3. **Stay in the persona's shoes.** They don't read the code, don't type URLs in the address bar, don't open DevTools and don't know hidden routes. They only use what is visible on screen.
4. **Don't change the app's code** during the test. This command only diagnoses. Fixes come later, if the user asks.
5. **Don't use real data.** In forms, use obvious test data (e.g. `test+persona@example.com`). Don't complete payments or send messages to third parties.

## Step 1: prepare

1. Read `ux-validate.config.yml`. It has `app.url`, the `app.start` command (optional), the `viewports`, the personas folder and `agent.maxStepsPerGoal`.
2. Read the personas in the configured folder (default `{{WORK_DIR}}/personas/*.yml`). The format is in `{{REFERENCES_DIR}}/persona-format.md`. If there are none, stop and suggest creating one with `/persona-new`. If a file looks invalid, run `{{PERSONA_VALIDATE_CMD}}` and show the errors.
3. Check that the app responds at `app.url`. If it doesn't and there is an `app.start`, start it in the background and wait until it is available (up to ~60s). If it is still down, stop and explain to the user.

## Step 2: automated checks

Run:

```bash
{{CHECK_CMD}}
```

This creates a run folder at `{{WORK_DIR}}/runs/<date-time>/` with `checks.json` (accessibility via axe-core and WAI-ARIA, keyboard navigation, broken links, console errors, horizontal scrolling, placeholder text, spelling), screenshots and, in `aria/`, each page's accessibility tree (what a screen reader announces). Note the folder path: everything from this run goes there.

Read `checks.json`. These issues **are already recorded**: don't repeat them as your own findings. When one of them hurts a persona in a specific way, create your own finding explaining the impact on them and cite the check's id in `relatedChecks`.

## Step 3: browse as each persona

For each persona, use the Playwright MCP browser tools (`browser_resize`, `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, etc.):

1. Resize the window to the persona's viewport: mobile 390×844, tablet 768×1024, desktop 1440×900.
2. Open `app.url`. For **each goal** of the persona:
   - Try to achieve it starting from the home page, the way they would. Use `browser_snapshot` to read the page and decide the next step.
   - Count each action (click, typing, scrolling to look for something) as one step. Stop when the goal is achieved, when you reach `maxStepsPerGoal`, or earlier if the persona's behavior says they would give up (e.g. `patience: low` gives up after 3 or 4 steps without visible progress).
   - Record the path (URLs visited), the outcome (`success`, `partial` or `fail`) and, in `notes`, the exact moment they hesitated or got stuck and why.
   - At each friction point, take a screenshot with `browser_take_screenshot` and save it in `<run folder>/screenshots/` with a descriptive name (e.g. `anna-checkout-hidden-button.png`).
3. Along the way, evaluate the four categories through the persona's eyes, using `{{REFERENCES_DIR}}/heuristics.md`, `{{REFERENCES_DIR}}/content-guidelines.md` and `{{REFERENCES_DIR}}/wai-aria.md`:
   - **Content**: do they understand the text? Jargon, unexplained foreign terms, wrong tone, information they look for and can't find, contradictory or overly generic text.
   - **Navigation**: do they know where they are and how to go back? Clear menus, labels that say where they lead, dead ends, unnecessary steps, feedback after actions.
   - **Interface**: can they see it and use it? Size and readability for their eyesight, touch targets on mobile, loading and error states, visual consistency, things that look clickable and aren't (or the other way around).
   - **Accessibility**: can they use it with their tools and limitations? Keyboard, screen reader, contrast, information conveyed only by color, dynamic messages announced. Details in Step 3b.

Personas with `vision: screen-reader` browse **without looking at the screen**: use only the keyboard (`browser_press_key`) and the accessibility tree (`browser_snapshot`), never `browser_click` on coordinates or on elements the keyboard can't reach. If something only works with a mouse, it is a blocker for them.

Adjust the rigor to the persona's traits (e.g. `vision: reduced` raises the severity of contrast and small fonts; `tech_literacy: low` raises it for jargon and unlabeled icons). Persona files may use Portuguese trait values (`baixa`, `reduzida`, `leitor-de-tela`); treat them as `low`, `reduced`, `screen-reader`.

## Step 3b: accessibility audit (WAI-ARIA)

Do this once per run (not per persona), unless `--only` excludes `accessibility`. Follow `{{REFERENCES_DIR}}/wai-aria.md`.

1. For each page visited, read its tree in `<run folder>/aria/`. Check accessible names, roles, states, landmarks and the heading hierarchy.
2. Identify the app's **widgets**: dialogs, tabs, accordions, menus, combobox/autocomplete, carousels, custom checkboxes or selects, forms.
3. Test each kind of widget **with the keyboard**, following the matching APG pattern: open, operate, close, and where focus goes afterwards. Use `browser_press_key` and check the result with `browser_snapshot`.
4. In forms, submit with an error on purpose (test data) and check whether the error is announced: `aria-invalid`, `aria-describedby`, focus on the first error, messages in `role="alert"`/`status`.
5. Record findings with `category: "accessibility"`, citing the WCAG criterion and the APG pattern in `heuristic`. In `personas`, list who is affected: usually the personas whose `vision` isn't `normal`, but think about who suffers most (e.g. invisible focus hurts anyone using a keyboard).

## Step 3c: spelling and grammar review

The dictionary (check `check:spelling`) flags unknown words and foreign words in the middle of the text. Review these findings:

1. **Separate the false positives:** proper names, brands, product names and correct technical terms. Don't record them as issues; list them in the final summary, suggesting they be added to `{{DICTIONARY}}` (one word per line).
2. **Judge foreign words from the persona's point of view:** a borrowed term may be fine for a tech-savvy persona but not for others. If it gets in someone's way, create your own finding explaining the impact and cite the check's id in `relatedChecks`.
3. **Review the grammar** of the pages you visited, which the dictionary doesn't catch: agreement, punctuation, words that exist but are wrong in context (e.g. "their" × "there", "its" × "it's", "lose" × "loose"), inconsistent tone, truncated sentences. Record them with `category: "content"`, the exact text in `evidence.snippet` and the fix in `suggestion`. Use `heuristic: "Grammar"`.

## Step 4: point to where to fix

For each of your findings, look in the project's code for the likely file. Search for the exact text visible on the page, the component name or the route. Fill in `sourceHint` with `file` (relative path) and `line` when you are sure. If you can't find it, leave `sourceHint` out; don't guess.

## Step 5: record and build the report

1. Write `<run folder>/findings.json` following `{{REFERENCES_DIR}}/findings-format.md` exactly. Rate severity with the table in that file. Use `confidence: "confirmed"` only when you reproduced the issue; otherwise `"likely"`.
2. Build the report:

```bash
{{REPORT_CMD}} --run <run folder>
```

3. Answer the user with:
   - the table of scores by persona (at the top of `report.md`);
   - the goals that failed and why, one line each;
   - the 5 most important issues, with the likely file to fix;
   - the path to `report.html` to see everything with screenshots;
   - an offer to fix the issues with `/persona-fix`, starting with the critical ones.
