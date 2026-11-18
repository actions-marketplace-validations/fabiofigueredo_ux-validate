# Changelog

All notable changes to ux-validate. The npm package, the GitHub Action (`@v1`) and the Claude Code plugin share the same version.

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
