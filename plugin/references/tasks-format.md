# Tasks format

File `.ux-validate/tasks.yml` (path in `tasks` in `ux-validate.config.yml`). Each simulated persona tries every task that applies to them, the way a participant does in a task-based usability test.

```yaml
- id: cheapest-plan-price
  task: You want to know how much the cheapest plan costs.
  success: The page shows the price of the cheapest plan.
- id: talk-to-someone
  task: You have a question about your order and want to talk to a person.
  success: A phone number, chat or email appears on the screen.
  personas: [margaret]        # optional: only these personas
  start: /                    # optional: starting page (default: app.url)
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lowercase letters, numbers and hyphens; unique |
| `task` | yes | The goal, written as a scenario from the user's side |
| `success` | no | Where the persona needs to get, not how. Makes the outcome objective |
| `personas` | no | Persona ids; without it, the task applies to all |
| `start` | no | Path or URL to start from |

## Writing good tasks

1. **Goal, not path.** "You want to know how much the cheapest plan costs", not "Click Pricing and look at the first card".
2. **No interface words.** Avoid the exact labels of menus, links and buttons ("Pricing", "Contact us", "My account"): the persona would just look for the word. `npx ux-validate check` warns when a task uses the exact label of a link or button.
3. **A realistic reason.** A short context helps: "You have a question about your order…".
4. **One goal per task.** Split "compare the plans and sign up" into two tasks.
5. **A clear end.** If you can't say what `success` is, the task is too vague.

Check the file with `npx ux-validate task validate`.
