---
name: persona-new
description: Creates a persona for ux-validate tests by talking with the user about who uses the app, and saves the file in .ux-validate/personas/.
argumentHint: "[free description, e.g. \"older customer who shops on their phone\"]"
---

# /persona-new

You'll help the user create a persona: a real kind of user of the app, with traits that change how `/persona-test` runs its tests. Talk it through, propose, and only save after confirmation.

Arguments received: `$ARGUMENTS` (an optional free description of the persona).

Talk to the user in English.

## Rules

1. **Base it on real users.** Ask who actually uses the app (support data, analytics, research). Avoid stereotypes: age doesn't define tech skills.
2. **Concrete, verifiable goals** the agent can try to achieve in the browser: "find the price of the basic plan", not "like the site".
3. **One question at a time**, in plain language. When the user doesn't know an answer, suggest a sensible value and say it can be changed later.
4. **Don't overwrite** an existing persona without asking.
5. Follow the format in `{{REFERENCES_DIR}}/persona-format.md`.

## Steps

1. Read `{{REFERENCES_DIR}}/persona-format.md` and list the personas that already exist in the folder set in `ux-validate.config.yml` (default `{{WORK_DIR}}/personas/`). If there are any, show a one-line summary of each: the new persona should be **different** from them.
2. If the arguments already describe the persona, start from them. Otherwise, ask who the person is.
3. Find out what's missing by talking:
   - who they are (approximate age, occupation, context of use) → `description`;
   - which device they use the app on → `viewport` (`mobile`, `tablet`, `desktop`);
   - familiarity with technology, vision, patience and reading level → `traits` (values in `persona-format.md`);
   - which language they read → `traits.language`;
   - what they come to the app to do → `goals` (2 to 4 goals);
   - what they expect to find → `expectations` (optional).
4. **Suggest goals based on the app**, if it helps: open the `app.url` from `ux-validate.config.yml` with the browser tools (if available) or read the routes and pages in the code, and propose goals that make sense for this persona. Say they are suggestions.
5. Show the full YAML file and ask for confirmation. Adjust whatever the user asks.
6. Save it to `<personas folder>/<id>.yml`, with an `id` in lowercase with hyphens (e.g. `margaret`), the same as the file name.
7. Validate:

```bash
{{PERSONA_VALIDATE_CMD}} <file path>
```

   Fix any errors.
8. Answer with a one-line summary of the persona and the next step: `/persona-test <id>`. If the project's personas are similar to each other, suggest creating a very different one (another device, another limitation, another goal).
