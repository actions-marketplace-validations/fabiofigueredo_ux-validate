# ux-validate plugin for Claude Code

ux-validate tests a web app the way real people use it. Your AI agent browses the app as each persona (an older person on a phone, a screen reader user, a color-blind user…), tries to reach their goals and reports where they got stuck, why, and which file to fix. Automated checks cover WCAG and WAI-ARIA accessibility, keyboard use, color blindness, broken links and spelling, and the report gives each persona a score.

Install:

```
/plugin marketplace add fabiofigueredo/ux-validate
/plugin install ux-validate@ux-validate
```

Then, in your project: `/ux-validate:ux-setup` once, and `/ux-validate:ux-test` whenever you want to test. Other skills: `/ux-validate:ux-report`, `/ux-validate:ux-fix` and `/ux-validate:ux-persona`. Requires Node.js 20 or later.

These files are generated from the ux-validate repository by `npm run build:plugin`; don't edit them by hand. Docs: https://github.com/fabiofigueredo/ux-validate#readme
