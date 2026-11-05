---
name: ux-report
description: Builds or refreshes the report for the latest ux-validate run and
  summarizes what to fix first (optionally comparing with the previous run).
argument-hint: "[run folder] [--compare]"
disable-model-invocation: true
allowed-tools: Bash(npx -y ux-validate@0.5.1 *)
---

# /ux-validate:ux-report

> **Language:** read `locale` in `ux-validate.config.yml` (`en` or `pt-BR`). Talk to the user in that language and write everything that goes into the report (titles, descriptions, suggestions, persona summaries) in that language. Without a config yet, use the language the user writes in.
>
> **Setup:** if `ux-validate.config.yml` doesn't exist in the project, follow `/ux-validate:ux-setup` first, then come back to this skill.

Builds the report for a ux-validate run and tells the user what to fix first.

Arguments received: `$ARGUMENTS`
- A run folder (e.g. `.ux-validate/runs/2026-11-03T14-20-00`). With no folder, use the most recent one in `.ux-validate/runs/`.
- `--compare` compares with the previous run.

Answer in English.

## Steps

1. Find the run folder. If `.ux-validate/runs/` is empty, tell the user to run `/ux-validate:ux-test` first and stop.
2. Build the report:

```bash
npx -y ux-validate@0.5.1 report --run <run folder>
```

   If the folder only has `checks.json` (no `findings.json`), the report has no scores by persona. Tell the user and suggest `/ux-validate:ux-test` for the full evaluation.
3. Read the generated `report.md` and answer with:
   - the table of scores by persona;
   - the goals that failed and why;
   - a **fix plan in order**: first what blocks goals, then critical and high issues that affect the most personas, then the rest grouped by file (to fix several at once);
   - the path to `report.html`;
   - a suggestion to apply the fixes with `/ux-validate:ux-fix` (or `npx -y ux-validate@0.5.1 fix`, outside Claude Code).
4. With `--compare`: read `findings.json` and `checks.json` from the previous run and show what was **resolved**, what **remains** and what is **new** (compare by title, page and element, not by id). Also show how the scores changed.

Don't change the app's code in this command.
