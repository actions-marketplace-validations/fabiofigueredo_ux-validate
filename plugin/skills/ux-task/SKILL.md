---
name: ux-task
description: Creates tasks for the simulated personas to try in the app (goals
  without step-by-step), by talking with the user, and saves them in
  .ux-validate/tasks.yml.
argument-hint: '[what users come to do, e.g. "find the price and talk to support"]'
disable-model-invocation: true
allowed-tools: Bash(npx -y ux-validate@1.0.1 *)
---

# /ux-validate:ux-task

> **Language:** read `locale` in `ux-validate.config.yml` (`en` or `pt-BR`). Talk to the user in that language and write everything that goes into the report (titles, descriptions, suggestions, persona summaries) in that language. Without a config yet, use the language the user writes in.
>
> **Setup:** if `ux-validate.config.yml` doesn't exist in the project, follow `/ux-validate:ux-setup` first, then come back to this skill.

You will help the user write the tasks the simulated personas will try in the app, as in a task-based usability test. The test checks whether each persona finds the way **without a step-by-step**, so how the tasks are written matters.

Arguments received: `$ARGUMENTS` (optional: what users come to do in the app).

## Rules

1. **Goal, not path.** "You want to know how much the cheapest plan costs", never "Click Pricing and check the first card".
2. **No interface words.** Don't use the exact labels of menus, links and buttons: the persona would just look for the word. Use the words a user would use.
3. **One goal per task**, with a short, realistic reason when it helps ("You have a question about your order…").
4. **A clear end:** propose a `success` criterion (where to get, not how). If the user doesn't want one, leave it out.
5. **One question at a time**, in plain language. Suggest; don't decide for the user.
6. Follow `${CLAUDE_PLUGIN_ROOT}/references/tasks-format.md`.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/references/tasks-format.md` and the tasks file set in `ux-validate.config.yml` (default `.ux-validate/tasks.yml`). If there are tasks already, show them in one line each: new ones should cover other goals.
2. Find out what people come to do in the app: from the arguments, or by asking ("What are the 3 to 5 most important things a user comes to do here?").
3. **Learn the interface's words** so you can avoid them: open `app.url` with the browser tools (if available) and read the menu, links and buttons, or read the navigation in the code. Don't show the user the path; just use it to avoid giving away the answer.
4. For each goal, write the task as a scenario and propose a `success` criterion. If the task uses an interface label, rewrite it with other words and tell the user why.
5. Ask whether any task applies only to some personas (`personas`, with ids from `.ux-validate/personas/`). By default it applies to all.
6. Show the complete YAML and ask for confirmation. Adjust what the user asks.
7. Save it to the tasks file, keeping the existing tasks and giving each new one a unique `id` (lowercase letters, numbers and hyphens).
8. Validate:

```bash
npx -y ux-validate@1.0.1 task validate
```

9. Tell the user the tasks are ready and that `/ux-validate:ux-test` will have each persona try them.
