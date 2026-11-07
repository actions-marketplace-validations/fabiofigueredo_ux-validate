# Evaluation heuristics

Cite the criterion you used in each finding's `heuristic` field (e.g. "Nielsen #4" or "WCAG 1.4.3").

## Nielsen's 10 heuristics

| # | Heuristic | What to look for |
|---|---|---|
| 1 | Visibility of system status | Feedback after clicking/submitting, loading indicators, current page highlighted in the menu |
| 2 | Match between system and the real world | The user's words, not the system's; no internal terms or unnecessary jargon |
| 3 | User control and freedom | Back, cancel and undo always possible; no dead ends |
| 4 | Consistency and standards | Same name and look for the same action; web conventions respected |
| 5 | Error prevention | Confirmation before destructive actions, validation before submitting, fields with a clear format |
| 6 | Recognition rather than recall | Options visible; the user doesn't need to memorize information between screens |
| 7 | Flexibility and efficiency of use | Short paths for frequent tasks |
| 8 | Aesthetic and minimalist design | No irrelevant information competing with the main content |
| 9 | Help users recognize, diagnose and recover from errors | Error messages in plain language that say what to do |
| 10 | Help and documentation | Help is easy to find when needed |

## Essential WCAG (level AA)

For ARIA, keyboard and screen readers, see also `wai-aria.md`.

| Criterion | Summary |
|---|---|
| 1.1.1 | Informative images have alternative text |
| 1.3.1 | Structure (headings, lists, labels) is in the code, not only in the visuals |
| 1.4.1 | Information isn't conveyed by color alone |
| 1.4.3 | Minimum contrast of 4.5:1 for text (3:1 for large text) |
| 1.4.4 | Text can be zoomed to 200% without breaking |
| 1.4.10 | No horizontal scrolling at 320px width |
| 2.1.1 | Everything works with the keyboard |
| 2.4.3 | Focus order makes sense |
| 2.4.4 | Link text says where it leads |
| 2.4.7 | Keyboard focus is visible |
| 2.5.8 | Touch targets of at least 24×24px |
| 3.3.1 / 3.3.3 | Form errors are identified and come with a suggested fix |
| 4.1.2 | Components have an accessible name, role and state |

## Typical signs of AI-generated apps

Worth looking for actively:

- Buttons and links that look like they work but do nothing (no handler, `href="#"`).
- Pages listed in the menu that don't exist or are empty.
- Forms that show "success" without sending anything, or that validate nothing.
- Generic marketing copy ("Innovative solutions for your business") with no concrete information.
- Made-up numbers, testimonials and customer logos.
- Mixed languages (an interface in one language with snippets in another).
- Missing empty, loading and error states (the screen goes blank).
- Inconsistent visuals between pages (each with different spacing, buttons and fonts).
