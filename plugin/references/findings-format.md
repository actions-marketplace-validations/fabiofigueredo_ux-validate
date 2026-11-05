# findings.json format

File written by the agent at `.ux-validate/runs/<run>/findings.json`. The `ux-validate report` command merges it with `checks.json` to build the report.

```json
{
  "kind": "agent",
  "createdAt": "2026-11-03T14:32:00Z",
  "url": "http://localhost:3000",
  "agent": { "tool": "claude-code", "model": "model name, if known" },
  "personas": [
    {
      "id": "margaret",
      "name": "Margaret",
      "viewport": "mobile",
      "summary": "One or two sentences about her overall experience, including limitations of the test.",
      "goals": [
        {
          "goal": "Find the price of the cheapest plan",
          "outcome": "success",
          "steps": 4,
          "path": ["http://localhost:3000/", "http://localhost:3000/plans"],
          "notes": "Found it in the menu, but hesitated because the item is called 'Tiers'.",
          "blockers": []
        }
      ]
    }
  ],
  "findings": [
    {
      "id": "A001",
      "category": "content",
      "severity": "medium",
      "title": "Menu says 'Tiers' instead of 'Pricing'",
      "description": "What happens, to whom and why it gets in the way. Write it for whoever will fix it.",
      "personas": ["margaret"],
      "page": "http://localhost:3000/",
      "viewport": "mobile",
      "heuristic": "Nielsen #2: match between system and the real world",
      "evidence": {
        "screenshot": "screenshots/margaret-menu-tiers.png",
        "selector": "nav a[href='/plans']",
        "snippet": "<a href=\"/plans\">Tiers</a>"
      },
      "suggestion": "Rename the label to 'Pricing' or 'Plans & pricing'.",
      "sourceHint": { "file": "src/components/Header.tsx", "line": 18 },
      "confidence": "confirmed",
      "relatedChecks": []
    }
  ]
}
```

## Fields

| Field | Values | Notes |
|---|---|---|
| `outcome` | `success`, `partial`, `fail` | `partial` = achieved by luck or without being sure it worked |
| `blockers` | finding ids | Findings that prevented or delayed the goal |
| `category` | `content`, `navigation`, `ui`, `accessibility` | One per finding; if it touches two, pick the cause. Keyboard, screen reader, ARIA and WCAG issues go in `accessibility` |
| `severity` | `critical`, `high`, `medium`, `low` | See the table below |
| `personas` | ids of the affected personas | Required, not empty |
| `evidence.screenshot` | path relative to the run folder | At least one `evidence` field is required |
| `sourceHint` | `{ file, line? }` | Only when you are sure; otherwise leave it out |
| `confidence` | `confirmed`, `likely` | `confirmed` = reproduced in the browser |
| `relatedChecks` | ids from `checks.json` (e.g. `C004`) | When the finding explains the impact of an automated check; the report then stops showing the duplicated check |

The agent's finding ids start with `A` (`A001`, `A002`…). Automated check ids start with `C`.

## Severity

| Severity | When to use |
|---|---|
| `critical` | Prevents the persona from achieving a main goal, or exposes data or serious errors |
| `high` | The goal is achieved only with a lot of effort, or most personas trip over it |
| `medium` | Slows down, confuses or makes a bad impression, but the persona carries on |
| `low` | A polish detail; noticeable, but doesn't get in the way |
