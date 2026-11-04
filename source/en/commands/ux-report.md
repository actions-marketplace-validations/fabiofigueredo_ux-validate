---
name: ux-report
description: Builds or refreshes the report for the latest ux-validate run and summarizes what to fix first (optionally comparing with the previous run).
shortDescription: Build the report and fix plan
argumentHint: "[run folder] [--compare]"
---

# /ux-report

Builds the report for a ux-validate run and tells the user what to fix first.

Arguments received: `$ARGUMENTS`
- A run folder (e.g. `{{WORK_DIR}}/runs/2026-11-03T14-20-00`). With no folder, use the most recent one in `{{WORK_DIR}}/runs/`.
- `--compare` compares with the previous run.

Answer in English.

## Steps

1. Find the run folder. If `{{WORK_DIR}}/runs/` is empty, tell the user to run `/ux-test` first and stop.
2. Build the report:

```bash
{{REPORT_CMD}} --run <run folder>
```

   If the folder only has `checks.json` (no `findings.json`), the report has no scores by persona. Tell the user and suggest `/ux-test` for the full evaluation.
3. Read the generated `report.md` and answer with:
   - the table of scores by persona;
   - the goals that failed and why;
   - a **fix plan in order**: first what blocks goals, then critical and high issues that affect the most personas, then the rest grouped by file (to fix several at once);
   - the path to `report.html`;
   - a suggestion to apply the fixes with `/ux-fix` (or `npx ux-validate fix`, outside Claude Code).
4. With `--compare`: read `findings.json` and `checks.json` from the previous run and show what was **resolved**, what **remains** and what is **new** (compare by title, page and element, not by id). Also show how the scores changed.

Don't change the app's code in this command.
