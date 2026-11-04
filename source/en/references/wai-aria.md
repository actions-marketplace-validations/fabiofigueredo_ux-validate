# Accessibility with WAI-ARIA

Guide for evaluating the **Accessibility** category (`accessibility`). Based on the [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/) specification and the [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/).

The automated checks already cover ARIA syntax (axe-core) and part of the behavior: invisible focus, keyboard traps, widgets without focus, clickable elements without keyboard access, `aria-expanded` that never changes, and fields labeled only by a placeholder. **Don't repeat those findings.** Your job is to test what requires interaction and judgment: whether each widget behaves as its APG pattern says, and whether the experience makes sense for keyboard and screen reader users.

## The 5 rules of ARIA use

1. **Use native HTML whenever it exists.** `<button>` instead of `<div role="button">`; `<a href>` to navigate; `<input type="checkbox">` instead of `role="checkbox"`.
2. **Don't change native semantics unless you must.** Wrong: `<h2 role="tab">`. Right: `<div role="tab"><h2>…</h2></div>`.
3. **Every interactive ARIA control must work with the keyboard.**
4. **Don't use `role="presentation"` or `aria-hidden="true"` on focusable elements.**
5. **Every interactive element needs an accessible name.**

> "No ARIA is better than bad ARIA": pages with misapplied ARIA tend to have more accessibility errors than pages without ARIA.

## Accessibility tree

The checks save each page's accessibility tree in `<run folder>/aria/<page>.yml`: roles, names and states, which is what a screen reader announces. Use it to answer:

- Does each control have a **name that makes sense out of context**? ("Learn more" repeated five times doesn't.)
- Does the **role** match what the element does? (A link that opens a dialog should be a `button`.)
- Do the **states** (`[expanded]`, `[selected]`, `[checked]`, `[pressed]`, `[disabled]`) match what's on screen?
- Are there **landmarks** (`banner`, `navigation`, `main`, `contentinfo`) and **headings** in a logical hierarchy (h1 → h2 → h3)?
- Does any important content appear **only visually** and vanish from the tree, like text in an image or information conveyed only by color?

In the browser, `browser_snapshot` shows the same tree for the current page.

## Testing with the keyboard

Use `browser_press_key` with `Tab`, `Shift+Tab`, `Enter`, ` ` (space), `Escape` and the arrow keys. After each key, check with `browser_snapshot` where focus is and what changed.

| Key | What should happen |
|---|---|
| `Tab` / `Shift+Tab` | Moves focus between controls, in visual reading order |
| `Enter` | Activates links and buttons |
| `Space` | Activates buttons; toggles checkboxes; opens selects |
| Arrows | Move **within** composite widgets (tabs, menus, lists, radio groups) |
| `Esc` | Closes dialogs, menus and popovers, returning focus to what opened them |
| `Home` / `End` | First and last item in lists, tabs and menus |

## APG patterns: what to check

### Button (`button`)
- Activates with `Enter` **and** `Space`.
- A toggle button uses `aria-pressed` (true/false) and the value changes on click.
- An icon-only button has an accessible name (`aria-label` or visually hidden text).

### Link (`link`)
- Goes somewhere else (a URL). If it performs an action on the same page, it should be a `button`.
- The text says where it leads; links that open in a new tab say so.

### Disclosure and accordion (show/hide)
- The control is a `button` with `aria-expanded` that switches between `true` and `false`.
- `aria-controls` points to the controlled content.
- In an accordion, each header is a button inside a heading (`<h3><button>…</button></h3>`).

### Modal dialog (`dialog`, `alertdialog`)
- When it opens, focus **moves into** the dialog (to the first control or the title).
- `Tab` **cycles inside** the dialog; the content behind is inert (`aria-modal="true"` or `inert`).
- `Esc` closes it, and focus **returns** to the element that opened it.
- It has a name (`aria-labelledby` pointing to the title).

### Tabs (`tablist`, `tab`, `tabpanel`)
- Only the active tab is in the `Tab` order; the **arrow keys** switch tabs (roving tabindex: active `tabindex="0"`, others `tabindex="-1"`).
- The active tab has `aria-selected="true"`; each tab has `aria-controls` pointing to its panel.
- The panel has `role="tabpanel"` and `aria-labelledby` pointing to the tab.

### Menu and menu button (`menu`, `menuitem`)
- Use `role="menu"` only for app-style **action** menus, not for site navigation menus (those are `nav` with links).
- The button that opens it has `aria-haspopup="menu"` and `aria-expanded`.
- The arrow keys move between items; `Esc` closes and returns focus to the button.

### Combobox, autocomplete and custom select
- The field has `role="combobox"`, `aria-expanded` and `aria-controls` pointing to the list (`listbox`).
- The arrow keys go through the options, and the active option is indicated by `aria-activedescendant` (or real focus).
- `Enter` selects, `Esc` closes without selecting.

### Custom checkbox, radio and switch
- They have `aria-checked`, which changes when activated; `Space` toggles.
- Radios form a group (`radiogroup`) and the arrow keys change the option.

### Carousel
- Has a pause button if it rotates on its own (WCAG 2.2.2).
- Previous and next controls are named buttons; slides don't steal focus.

## Dynamic messages (live regions)

- Confirmations and action results ("Message sent", "3 results") go in a region with `role="status"` (or `aria-live="polite"`) that **already exists on the page** before the message appears.
- Urgent errors use `role="alert"`.
- Test: perform the action and check in the tree whether the message is inside a `status`/`alert` region. If it isn't, the screen reader announces nothing.

## Forms

- Each field has a visible label tied to it (`<label for>`).
- Required fields have `required` or `aria-required="true"`, and the label says so (not only with a colored asterisk).
- Errors: the field gets `aria-invalid="true"` and the message is tied to it with `aria-describedby`; when submitting with errors, focus goes to the first invalid field or to an error summary.
- Format instructions ("MM/DD/YYYY") are tied with `aria-describedby`.

## Suggested severity

| Situation | Severity |
|---|---|
| An essential control can't be used with a keyboard or screen reader | `critical` |
| Dialog without focus management; form error not announced | `high` |
| Outdated ARIA state; vague accessible name; confusing focus order | `medium` |
| Redundant ARIA (e.g. `role="button"` on `<button>`) | `low` |

Use the `heuristic` field with the WCAG criterion and the APG pattern, for example: `"WCAG 2.1.2 · APG: Dialog (Modal)"`.
