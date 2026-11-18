# Changelog

All notable changes to ux-validate. The npm package, the GitHub Action (`@v1`) and the Claude Code plugin share the same version.

## 1.1.1 — 2026-11-18

- `audit` adds `ux-validate-audits/` to `.gitignore` when it runs inside a Git repository, so audit results don't end up in a commit by accident (existing entries are kept, with or without slashes).
- Website: a section on auditing a published site (what it does, the safeguards, with and without AI), the audit command in "Get started", the audit plan in "What you get" and the audit's limits in "What ux-validate doesn't do".

## 1.1.0 — 2026-11-18

- **Audit of a published site, without its code.** `npx ux-validate audit <url>` runs the automated checks on a site that is already online, and `/ux-audit <url>` (`$ux-audit` in Codex, `/ux-validate:ux-audit` with the plugin) adds the persona and task test.
  - Each site gets its own folder, `ux-validate-audits/<domain>/`, with its personas, tasks and one folder per run; the next audit reuses them.
  - Safe for a live site: asks for confirmation that you are responsible for the site or authorized to test it (`--yes` in CI), respects `robots.txt`, visits at most one page per second, identifies itself as `ux-validate` in the user agent, doesn't follow sign out/delete/cancel links and never submits forms. Spelling uses the language the site declares (`<html lang>`).
  - Report: "Audit of a published site", "Limits of this audit" (pages not visited and what the personas couldn't test) and a "Plan for whoever maintains the site". `fix` and `sarif` don't apply to an audit and say so.
  - Options: `--personas`, `--task`, `--max-pages`, `--viewports`, `--fail-on`.
- `--dir <folder>` runs any command in another folder (e.g. `npx ux-validate report --dir ux-validate-audits/<domain>`).
- `findings.json` accepts `limits` (what couldn't be tested), shown in the audit report.

## 1.0.1 — 2026-11-18

- **Fewer tokens in `/ux-test`, same test:**
  - `check` also writes `checks-brief.md`, a summary of `checks.json` for the agent: the same issue on several pages becomes one group, URLs are short, and screenshots, documentation links and generic suggestions stay in `checks.json` (looked up by id when needed). About 84% smaller on the demo site; `/ux-fix` and `/ux-report --compare` use it too.
  - Each persona is tested in a clean context when the tool has subagents (e.g. Claude Code), one at a time, so what one persona saw doesn't fill the context (or influence) the next.
  - Color-blindness images are opened only for pages with color issues, and only the persona's type; the accessibility audit reuses the snapshots from browsing instead of rereading the `aria/` files.
  - Leaner browser use: no extra `browser_snapshot` after actions that already return one, screenshots of the visible area or the element, `browser_fill_form` for forms, `browser_find` and partial snapshots in the accessibility audit.
  - The React/SPA step moved to a reference file (`spa.md`) read only when the app uses React or switches screens without reloading.
  - The Playwright MCP server starts with `--console-level error`: console logs are no longer repeated at every step (errors are still reported, and `check:console` records them). `init` updates the entry an earlier ux-validate version wrote and keeps any other.
- Clear everywhere that the complete test (personas and tasks) requires an AI tool (Claude Code, Cursor, Codex CLI or Gemini CLI), and that without one only the automated validation runs: READMEs (highlighted notice and usage section), `--help`, the end of `init` and the website's "Get started".

## 1.0.0 — 2026-11-18

First stable release.

- **Complete validation, step by step** in both READMEs: what runs without AI (`check`), what needs an AI tool (`/ux-test`), and the three ways to use it (npm package, Claude Code plugin, from the source).
- `check` now tells you the next step (the persona and task test), and a report built only from the automated checks says so at the top.
- `comment --out` confirms the file it wrote.
- Website: "Get started" uses `npx ux-validate install-browser` and mentions the plugin.
- Dependencies updated within their ranges (Anthropic SDK 1.10, Inquirer 8.8; Vite 8.3.8 in development).
- `SECURITY.md` with how to report vulnerabilities and the known dependency advisories.

## 0.6.1 — 2026-11-17

- `check` starts the app with `app.start` when it isn't running, waits for it and stops it at the end; without `app.start` it stops with a clear message.
- `init` and the plugin's setup detect plain HTML sites and suggest `npx -y http-server <folder> -p 3000 -c-1`.
- `/ux-test` runs exactly the configured `app.start` and doesn't improvise another command.
- Crawler: `/` and `/index.html` count as the same page (no duplicated home page issues).

## 0.6.0 — 2026-11-17

- **Tasks**: goals the simulated personas try without step-by-step (`.ux-validate/tasks.yml`), required in setup; `/ux-task`, `task new`, `task validate`; warning when a task uses the interface's own words; first click, backtracks and a task × persona table in the report.
- Website and READMEs: clear about limits (simulated personas, partial WCAG coverage, external AI tools).

## 0.5.1 — 2026-11-05

- `install-browser` no longer shows Playwright's false "npm install" warning when run from the npx cache (the plugin's case).

## 0.5.0 — 2026-11-05

- **Claude Code plugin** (`/plugin marketplace add fabiofigueredo/ux-validate`), as an alternative to `init`.
- CLI: `install-browser`, `init --tools none --url --start`.

## 0.4.1 — 2026-11-05

- Playwright pinned to 1.64.x (Playwright 1.65.0 was published without its `playwright-core`, breaking fresh installs).

## 0.4.0 — 2026-11-05

- **Color vision**: protanopia, deuteranopia and tritanopia simulation; checks for text that loses contrast, indicators that look the same and state shown only by color; predefined color-blind personas (Tom, Carlos).

## 0.3.x — 2026-11-04 to 2026-11-05

- **React and SPA support**: component and JSX file/line for each issue, SPA routes and soft 404s, React warnings, route-change focus and title.
- Fixed a hang on sites without client-side routing; faster on apps that never reach network idle; cached source lookup.
- Security: safe links in `report.html`, same-origin source maps, fix prompt treats page text as data, pinned Playwright MCP.
- SARIF points to the right files; the action's `upload-sarif` input.

## 0.2.0 — 2026-11-04

- Agent commands renamed to `/ux-test`, `/ux-report`, `/ux-fix`, `/ux-persona`; choosing personas is a required setup step.

## 0.1.0 — 2026-11-04

- First public version: automated checks (axe-core, WAI-ARIA behavior, keyboard, links, spelling), persona tests in Claude Code, Cursor, Codex CLI and Gemini CLI, report, `fix` with your own model, English and Portuguese, GitHub Action with PR comment and SARIF.
