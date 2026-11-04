# Persona format

Each persona is a `.yml` file in the personas folder (default `.ux-validate/personas/`).

```yaml
id: margaret                # short identifier, no spaces (used in the report)
name: Margaret
description: >
  68, retired. Uses her phone for messaging and banking, sometimes with her grandson's help.
  Distrusts sites that ask for personal data right away.
viewport: mobile            # mobile | tablet | desktop
traits:
  tech_literacy: low        # low | medium | high
  vision: reduced           # normal | reduced | color-blind | screen-reader
  patience: low             # low | medium | high
  language: en
  reading_level: basic      # basic | intermediate | advanced
goals:
  - Find out how much the cheapest plan costs
  - Talk to someone from support
expectations:               # optional: what she expects to find
  - A visible phone number
  - Large text
```

Portuguese trait values (`baixa`, `média`, `alta`, `reduzida`, `daltonismo`, `leitor-de-tela`, `básico`…) are also accepted.

## How traits change the test

| Trait | Effect on behavior | Effect on evaluation |
|---|---|---|
| `tech_literacy: low` | Doesn't use advanced search or shortcuts; icons without text mean nothing to them | Jargon, foreign words and unlabeled icons become more severe |
| `vision: reduced` | Ignores small or low-contrast text | Contrast and font size become more severe |
| `vision: screen-reader` | Uses only the keyboard and the accessibility tree (`browser_snapshot`), without looking at the visuals or using a mouse | Accessible names, focus order, ARIA states and announced messages become the priority |
| `vision: color-blind` | Can't tell apart information conveyed only by color | States and errors shown only by color become severe |
| `patience: low` | Gives up after 3 or 4 steps without visible progress | Extra steps and slow loading become more severe |
| `reading_level: basic` | Skips long text | Long sentences and technical terms become more severe |

## Tips for writing good personas

- Base them on the product's real users, not on stereotypes.
- Write goals as concrete, verifiable tasks ("find the price of plan X"), not vague wishes ("like the site").
- Three to five very different personas cover more issues than ten similar ones.
