---
name: persona-fix
description: Applies the fixes from the latest ux-validate report to the code, one at a time, showing each change and checking the result.
shortDescription: Apply the fixes from the report
argumentHint: "[ids, e.g. A001,C003] [--severity critical|high|medium|low] [--run <folder>]"
---

# /persona-fix

Fixes the issues from the ux-validate report in the code. You use your own editing tools; usage is billed to the user's account in this tool.

Arguments received: `$ARGUMENTS`
- Comma-separated ids (e.g. `A001,C003`) limit the fixes to those issues.
- `--severity <level>` fixes from the most severe down to that level. Default: `medium` (critical, high and medium).
- `--run <folder>` picks the run. Default: the most recent in `{{WORK_DIR}}/runs/`.

Answer in English.

## Rules

1. **Only fix what is in the report.** No refactoring, reformatting or "improving" code unrelated to the issue.
2. **Smallest change**, in the file's style (indentation, quotes, framework conventions).
3. **Prefer native, semantic HTML over ARIA** (`<button>` instead of `<div role="button">`), following `{{REFERENCES_DIR}}/wai-aria.md`.
4. **Never make up data.** Phone numbers, prices, addresses, testimonials, customer counts and names come from the user. If a fix depends on something like that, ask or leave the issue to them.
5. **Don't commit** or push. The user reviews the changes.

## Steps

1. Find the run folder and read `checks.json` and `findings.json`. Build the list of issues to fix according to the arguments, from most to least severe. The agent's ids start with `A`; automated check ids start with `C`. A finding with `relatedChecks` already covers those checks.
2. If the project uses Git and the files you will touch have uncommitted changes, warn the user before starting.
3. Show the plan: which issues, in which files (use `sourceHint`; without it, search the code for the text, selector or snippet in `evidence`). Separate those that depend on information from the user. Ask for confirmation.
4. Fix one issue at a time. For each:
   - show the file and the change in one sentence;
   - edit;
   - for spelling issues (`check:spelling`), fix only the words that are really wrong. Correct proper names, brands and technical terms go in `{{DICTIONARY}}` (one word per line), not in the code.
5. When done, run the checks again to confirm:

```bash
{{CHECK_CMD}}
```

   Compare with the previous run: what was resolved, what remains, and whether anything new appeared because of the changes. If it did, fix it or explain it.
6. Answer with: issues fixed (file and change, one line each), issues that depend on the user (and what is missing), issues that remain and why, and a suggestion to review with `git diff`.
