---
name: ux-setup
description: Sets up ux-validate in the current project (app URL, language and
  personas) so the other ux-validate skills can run.
argument-hint: "[app URL]"
disable-model-invocation: true
allowed-tools: Bash(npx -y ux-validate@0.5.0 *)
---

# /ux-validate:ux-setup

> **Language:** read `locale` in `ux-validate.config.yml` (`en` or `pt-BR`). Talk to the user in that language and write everything that goes into the report (titles, descriptions, suggestions, persona summaries) in that language. Without a config yet, use the language the user writes in.

You will set up ux-validate in the current project. Ask one question at a time, suggest sensible defaults, and only write files after the user confirms.

Arguments received: `$ARGUMENTS` (optionally, the URL of the app to test).

## Steps

1. **Existing setup.** If `ux-validate.config.yml` already exists, show its main values (`locale`, `app.url`, `app.start`, `language`) and the personas in `.ux-validate/personas/`, and ask whether the user wants to change anything. If not, stop and suggest `/ux-validate:ux-test`.
2. **Language.** Ask which language ux-validate should use for messages and the report: English (`en`) or Portuguese (`pt-BR`). Default: the language the user is writing in. From now on, talk to the user in that language.
3. **App URL and start command.** Read `package.json` (if any) to suggest them: Vite → `http://localhost:5173` and `npm run dev`; Next.js or Create React App → `http://localhost:3000`; otherwise ask. The start command is optional (leave it empty if the app is already running or deployed).
4. **Personas (required step).** ux-validate tests the app through each persona's eyes, so the project needs at least one.
   - Run `npx -y ux-validate@0.5.0 persona examples --lang <language>` and show the user the predefined personas with each one's characteristics (who they are, device, tech literacy, vision, patience, reading level, goals, expectations). Don't summarize them away: the user decides based on them.
   - Ask whether they want to **use the predefined ones** (all or only some), **create their own**, or **both**. Wait for the answer.
5. **Write the setup.** Run, with the values chosen (quote the start command; leave `--start` out if empty):

```bash
npx -y ux-validate@0.5.0 init --tools none --lang <language> --url <url> --start "<command>" --personas <ids separated by commas | all | none>
```

   Use `--personas none` when the user only wants their own personas. Then, if they want their own, follow the `/ux-validate:ux-persona` flow for each one.
6. **Content language.** `language` in the config is the language of the app's content, used by the spell check (default: the same as the tool). If the app's text is in another language (e.g. tool in Portuguese, site in English), change `language` in `ux-validate.config.yml` (`pt-BR`, `en`, `es`, or `other` to turn off the spell check).
7. **Browser.** Install the browser the automated checks use (once per machine):

```bash
npx -y ux-validate@0.5.0 install-browser
```

8. **Done.** Summarize what was created (`ux-validate.config.yml`, `.ux-validate/personas/`, `.ux-validate/references/`) and tell the user they can run `/ux-validate:ux-test` now (with the app running, or with `app.start` set).
