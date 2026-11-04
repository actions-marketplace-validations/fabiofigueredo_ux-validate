// English messages. Keep the same keys as pt-BR.js.
const plural = (n, one, many) => (n === 1 ? one : many);

export default {
  status: {
    created: 'created',
    kept: 'kept',
    updated: 'updated',
    mcpInvalid: 'skipped (invalid JSON; add the Playwright MCP manually)',
    mcpKept: 'kept (Playwright MCP already set up)',
    mcpAdded: 'updated (Playwright MCP added)',
  },

  cli: {
    help: `ux-validate — persona-based testing of content, navigation, UI and accessibility

Usage:
  ux-validate init   [--yes] [--force] [--tools claude-code,cursor,codex,gemini]
                                                 Set up the project and install the commands in your AI tools
  ux-validate check  [--out <dir>] [--url <url>] [--fail-on high]
                                                 Run the automated checks (accessibility, links, spelling, content)
  ux-validate report [--run <dir>]               Build report.md and report.html from a run
  ux-validate sarif  [--run <dir>] [--out <file>]
                                                 Export the issues as SARIF (GitHub code scanning)
  ux-validate comment [--run <dir>] [--out <file>]
                                                 Summary in Markdown for a pull request comment
  ux-validate persona new [--force]              Create a persona with a step-by-step wizard
  ux-validate persona validate [files…]          Check persona files (default: all in the project)
  ux-validate fix    [--run <dir>] [--ids A001,C003] [--severity high] [--dry-run] [--yes]
                                                 Apply the report's fixes with the model set up in init
                                                 (uses your API key and your tokens)

General options:
  --config <file>      Path to the config file (default: ux-validate.config.yml)
  --lang <en|pt-BR>    Language of the tool's messages (default: from the config or your system)
  -h, --help           Show this help
`,
    unknownCommand: 'Unknown command: {command}',
  },

  adapters: {
    argsFromMessage: 'the text the user wrote together with the command (it may be empty)',
    explicitOnly: 'Run only when the user explicitly invokes {invoke}.',
  },

  config: {
    notFound: 'Config not found at {path}. Run "npx ux-validate init" first.',
    unknownViewport: 'Unknown viewport: {list}. Use: {valid}.',
  },

  providers: {
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI',
    google: 'Google (Gemini)',
    ollama: 'Ollama (local model)',
  },

  init: {
    title: 'ux-validate: setup',
    localeQ: 'Language of ux-validate (messages, report and agent instructions):',
    targetsQ: 'Which AI tool will you use the commands in?',
    soon: '(coming soon)',
    unknownTool: 'Unknown AI tool: {list}. Use: {valid}.',
    urlQ: 'URL of the app to test (e.g. http://localhost:3000):',
    startQ: 'Command to start the app (optional, e.g. npm run dev):',
    viewportsQ: 'Screen sizes:',
    languageQ: "Language of the app's content (for the spell check):",
    languages: { 'pt-BR': 'Portuguese (Brazil)', en: 'English', es: 'Spanish', other: 'Other (no spell check)' },
    fixIntro:
      '\n  To apply fixes from the terminal (npx ux-validate fix), ux-validate calls a language model\n' +
      '  with YOUR API key; token usage is billed to your account with the provider.',
    fixQ: 'Set up a model to apply fixes from the terminal?',
    providerQ: 'Language model provider:',
    modelQ: 'Model:',
    apiKeyEnvQ: 'Name of the environment variable that holds your API key (the key is never stored in the file):',
    baseUrlQ: 'Server address:',
    examplesQ: 'Create example personas?',
    invalidUrl: 'Invalid URL. Example: http://localhost:3000',
    fileMissing: "That file doesn't exist. Check the path or use a server URL (http://...).",
    urlProtocol: 'Use a URL that starts with http://, https:// or file://',
    configHeader:
      '# ux-validate config. Docs: README.md of the ux-validate project.\n' +
      '# The API key is never stored here: only the name of the environment variable.\n',
    gitignoreComment: '# ux-validate: run results',
    dictionaryTemplate:
      '# Project dictionary for the ux-validate spell check.\n' +
      '# One word per line: proper names, brands and technical terms that are correct\n' +
      "# but unknown to the dictionary. Lines starting with # are ignored.\n",
    next: {
      title: '\nNext steps:',
      personas: '  1. Review the personas in {dir}/ or create your own (npx ux-validate persona new, or the persona-new command below).',
      useTools: '  2. In your AI tool:',
      tools: {
        'claude-code':
          '     • Claude Code: open it in this project, approve the "playwright" MCP server and run /persona-test.\n' +
          '       Also: /persona-new, /persona-report, /persona-fix',
        cursor:
          '     • Cursor: open this project, enable the "playwright" MCP server in the MCP settings and run /persona-test in the agent chat.\n' +
          '       Also: /persona-new, /persona-report, /persona-fix',
        codex:
          '     • Codex CLI: run codex in this project and trust it (so .codex/config.toml loads the browser), then type $persona-test.\n' +
          '       Also: $persona-new, $persona-report, $persona-fix',
        gemini:
          '     • Gemini CLI: run gemini in this project (trust the folder if asked, so .gemini/settings.json loads the browser) and type /persona-test.\n' +
          '       Also: /persona-new, /persona-report, /persona-fix',
      },
      cliFix: '\n  Fixes from the terminal: npx ux-validate fix (model {provider} · {model}).',
      setKey: '  First, set {env} to your API key:',
      keyPowerShell: '    PowerShell:  $env:{env}="your-key"',
      keyBash: '    macOS/Linux: export {env}=your-key',
    },
  },

  checks: {
    crawling: 'Crawling {url} (up to {max} pages)…',
    invalidFailOn: 'Invalid --fail-on value: {value}. Use: {valid}.',
    failOn: ({ n, severity }) => `\n✖ ${n} ${n === 1 ? 'issue' : 'issues'} with severity "${severity}" or higher (--fail-on).`,
    cannotOpen: "Couldn't open {url}. Is the app running?",
    noDictionary: '⚠ No dictionary for language "{language}"; spelling will not be checked.',
    spellingDisabled: '⚠ Spell check disabled: {message}',
    analyzing: ({ n, viewport }) => `Analyzing ${n} ${plural(n, 'page', 'pages')} on ${viewport}…`,
    summary: ({ total, critical, high, medium, low }) =>
      `\n✔ ${total} ${plural(total, 'issue', 'issues')}: ${critical} critical, ${high} high, ${medium} medium, ${low} low`,
    noText: '(no text)',
    nothing: 'nothing',
    noResponse: 'no response',
    failedRequest: 'failed',
    targetLabel: 'Target',
    linkedFromLabel: 'Linked from',
    emptyLink: {
      title: 'Link with no destination',
      description: 'The link "{text}" points to "{href}" and goes nowhere.',
      suggestion: 'Point the link to the right page or remove it until the destination exists.',
    },
    externalLink: {
      title: 'Broken external link',
      description: '"{text}" points to {url}, which responded {status}.',
      suggestion: 'Update or remove the external link.',
    },
    axe: {
      description: ({ text, n }) => `${text} (${n} ${plural(n, 'element', 'elements')}).`,
      suggestion: '{help}. See fix examples in the documentation for rule "{rule}".',
      bestPractice: 'Accessibility best practices',
    },
    console: {
      title: 'JavaScript errors in the console',
      description: ({ n }) => `${n} ${plural(n, 'error', 'errors')} while loading the page. Features may be broken.`,
      suggestion: 'Fix the listed errors; they usually point to buttons or components that do not work.',
    },
    network: {
      title: 'Resources that failed to load',
      description: ({ n }) => `${n} ${plural(n, 'request', 'requests')} failed (images, scripts, APIs).`,
      suggestion: 'Check file paths and API endpoints.',
    },
    overflow: {
      title: 'Content wider than the screen (horizontal scrolling)',
      description: 'The page is {px}px wider than the screen on {viewport}.',
      suggestion: 'Look for fixed widths (width in px), images without max-width: 100%, or tables without their own scrolling.',
    },
    tinyText: {
      title: 'Text too small to read',
      description: ({ n }) => `${n} ${plural(n, 'text', 'texts')} with a font smaller than 12px.`,
      suggestion: 'Use at least 14px for body text and 12px for captions.',
    },
    leftover: {
      lorem: 'Filler text (lorem ipsum)',
      todo: 'Visible development marker (TODO/FIXME)',
      codeValue: 'Exposed code value (undefined, NaN, [object Object])',
      template: 'Unrendered template variable',
      aiText: 'AI answer pasted into the content',
      fakeData: 'Sample fake data',
      placeholder: 'Placeholder text',
      description: 'Found on the page: "{match}".',
      suggestion: 'Replace it with real content or remove it.',
    },
    duplicateTitle: {
      title: 'Different pages with the same title',
      description: '{n} pages use the title "{title}"; in browser tabs and search engines they look the same.',
      empty: '(empty)',
      suggestion: 'Give each page a <title> that describes its content.',
    },
    homeDown: {
      title: "The start page doesn't open ({status})",
      description: '{url} responded {status}.',
      suggestion: 'Check that the app is running and that the configured URL is correct.',
    },
    brokenLink: {
      title404: "Link to a page that doesn't exist (404)",
      title: 'Broken internal link',
      description: ({ n, url, status }) => `${n} ${plural(n, 'page points', 'pages point')} to ${url}, which doesn't open (${status}).`,
      suggestion: 'Fix the link address or create the destination page.',
    },
    axeExtra: {
      'target-size': {
        help: 'Touch targets must be at least 24×24px or have enough space around them',
        description: 'Ensures buttons and links are easy to tap without hitting the neighbor by mistake',
      },
    },
  },

  aria: {
    roleNoFocus: {
      title: "Widget with an ARIA role that can't receive keyboard focus",
      description: ({ n }) =>
        `${n} ${plural(n, 'element declares', 'elements declare')} an interactive role but can't be reached with Tab. Keyboard and screen reader users hear "button", "tab"… and can't activate it.`,
      heuristic: 'WCAG 2.1.1, 4.1.2 · WAI-ARIA APG: Keyboard Interaction',
      suggestion:
        'Prefer the native element (<button>, <a href>, <input type="checkbox">). If you need the role, add tabindex="0" and handle Enter/Space (or the arrow keys, in composite widgets).',
    },
    clickable: {
      title: 'Clickable element not reachable by keyboard',
      description: ({ n }) =>
        `${n} ${plural(n, 'element looks', 'elements look')} clickable (onclick or pointer cursor) but ${plural(n, "isn't a button or link: it gets", "aren't buttons or links: they get")} no focus and ${plural(n, "isn't", "aren't")} announced as interactive.`,
      heuristic: 'WCAG 2.1.1, 4.1.2 · WAI-ARIA: first rule of ARIA (use native HTML)',
      suggestion: 'Use <button type="button"> (action) or <a href> (navigation). Adding role="button" is not enough: focus and keyboard would still be missing.',
    },
    placeholderOnly: {
      title: 'Form field identified only by its placeholder',
      description: ({ n }) =>
        `${n} ${plural(n, 'field has', 'fields have')} no label (label, aria-label or aria-labelledby). The placeholder disappears while typing and isn't reliably announced by screen readers.`,
      heuristic: 'WCAG 1.3.1, 3.3.2, 4.1.2',
      suggestion: "Add a visible <label for=\"field-id\">. If the layout doesn't allow it, use aria-label with the same text.",
    },
    trap: {
      title: 'Keyboard trap: focus gets stuck',
      description: 'After reaching "{name}", pressing Tab goes nowhere. Keyboard users get stuck and can\'t continue on the page.',
      heuristic: 'WCAG 2.1.2 (No Keyboard Trap)',
      suggestion: 'Check scripts that call focus() or capture the Tab key. In modal dialogs, focus should cycle inside the dialog and leave with Esc.',
    },
    noIndicator: {
      title: 'Invisible keyboard focus',
      description: ({ n }) =>
        `${n} ${plural(n, "element doesn't", "elements don't")} change appearance when focused. Keyboard users can't tell where they are on the page.`,
      heuristic: 'WCAG 2.4.7 (Focus Visible)',
      suggestion: "Don't remove the outline without a replacement. For example: :focus-visible { outline: 3px solid #1a5fd0; outline-offset: 2px; }.",
    },
    hiddenFocus: {
      title: 'Focus moves to a hidden element',
      description: ({ n }) =>
        `${n} ${plural(n, 'element receives', 'elements receive')} focus but ${plural(n, 'is', 'are')} off screen or have no size. The user presses Tab and "disappears" from the page.`,
      heuristic: 'WCAG 2.4.3, 2.4.7',
      suggestion: 'Hidden elements must not receive focus: use hidden, display:none or inert. "Skip to content" links should appear when focused.',
    },
    expanded: {
      title: "aria-expanded doesn't follow opening and closing",
      description: ({ n }) =>
        `${n} ${plural(n, 'control opens', 'controls open')} or ${plural(n, 'closes', 'close')} content, but aria-expanded doesn't change. The screen reader keeps announcing the old state ("collapsed" while it's open).`,
      heuristic: 'WCAG 4.1.2 · WAI-ARIA APG: Disclosure / Accordion',
      suggestion: 'Set aria-expanded="true" when opening and "false" when closing. Link the button to the content with aria-controls.',
    },
  },

  spelling: {
    unknown: {
      title: 'Possible spelling mistakes',
      description: ({ n, language, dictionary }) =>
        `${n} ${plural(n, 'word', 'words')} not recognized by the dictionary (${language}). Spelling mistakes look careless and reduce trust in the site. ` +
        `Proper names and technical terms may show up here: add them to ${dictionary} (one word per line).`,
      heuristic: 'Content credibility (spelling)',
      suggestion: "Fix the words using the suggestions. For correct terms the dictionary doesn't know, add them to the project dictionary.",
    },
    foreign: {
      title: 'English words in the middle of the text',
      description: ({ n, language }) =>
        `${n} English ${plural(n, 'word', 'words')} in ${language} content. People who don't read English may not understand labels and buttons.`,
      heuristic: 'Nielsen #2: match between system and the real world',
      suggestion:
        'Translate the terms (e.g. "Pricing" → "Preços", "Get started" → "Começar"). If the English term is intentional (brand, jargon your audience uses), add it to the project dictionary.',
    },
  },

  report: {
    title: 'ux-validate report',
    generated: '✔ Report generated:',
    noRun: 'No run found. Run /persona-test or "npx ux-validate check".',
    noData: 'Neither checks.json nor findings.json in {dir}.',
    invalidJson: '{file} is not valid JSON: {message}',
    generalPersona: 'Overall (no persona)',
    app: 'App',
    date: 'Date',
    evaluatedBy: 'Evaluated by',
    pagesAnalyzed: 'Pages analyzed',
    pagesCount: ({ n }) => `${n} ${plural(n, 'page', 'pages')}`,
    scoresTitle: 'Scores by persona',
    persona: 'Persona',
    overall: 'Overall',
    goalsDone: 'Goals achieved',
    goals: 'Goals',
    steps: 'steps',
    blockers: 'Blockers',
    fixFirst: 'Fix first',
    noTop: 'No critical or high issues. 🎉',
    applyFixes:
      '**To apply the fixes:** run `/persona-fix` in Claude Code (uses the tool\'s model and account) or `npx ux-validate fix` in the terminal (uses the model and API key set up in init). Both show each change before saving.',
    applyFixesHtml:
      '<strong>To apply the fixes:</strong> run <code>/persona-fix</code> in Claude Code (uses the tool\'s model and account) or <code>npx ux-validate fix</code> in the terminal (uses the model and API key set up in init). Both show each change before saving.',
    noIssues: 'No issues found.',
    noIssuesHtml: 'No issues found. 🎉',
    severity: 'Severity',
    origin: 'Source',
    originAgent: 'persona evaluation',
    originCheck: 'check ({name})',
    confidence: 'Confidence',
    confirmed: 'confirmed',
    likely: 'likely',
    personas: 'Personas',
    screens: 'Screens',
    page: 'Page',
    criterion: 'Criterion',
    whereToFix: 'Where to fix',
    elements: 'Element(s)',
    element: 'Element',
    ariaTree: "Page's accessibility tree",
    screenReader: 'Screen reader',
    howToFix: 'How to fix',
    reference: 'reference',
    referenceHtml: 'Reference',
    issues: 'Issues',
    all: 'All',
    tagPersona: 'persona',
    tagCheck: 'check: {name}',
    seeScreenshot: 'See screenshot',
    screenshotOf: 'Screenshot of {page}',
    severities: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    categories: { content: 'Content', navigation: 'Navigation', ui: 'Interface', accessibility: 'Accessibility' },
    outcomes: { success: '✅ Achieved', partial: '⚠️ Partly', fail: '❌ Not achieved' },
  },

  fix: {
    noModel:
      'No model set up for fixes. Run "npx ux-validate init" and set up a model for the terminal ' +
      '(provider, model and API key), or use /persona-fix inside Claude Code.',
    noRun: 'No run found. Run "npx ux-validate check" or /persona-test first.',
    invalidSeverity: 'Invalid severity: {value}. Use: {valid}.',
    nothingSelected: 'No issues selected to fix.',
    notLocated: "Couldn't find the source file in the project.",
    plan: ({ n, files }) => `\n${n} ${plural(n, 'issue', 'issues')} selected; ${files} ${plural(files, 'file', 'files')} to fix.`,
    notLocatedList: '  (no file found: {ids})',
    estimate: '\nModel: {provider} · {model}. Estimate: ~{tokens} input tokens, billed to your account.',
    needsYes: 'Confirmation needed. Run again with --yes to continue without asking.',
    confirmCall: 'Call the model to propose the fixes?',
    confirmWrite: ({ n, file }) => `Save ${n} ${plural(n, 'fix', 'fixes')} to ${file}?`,
    stopped: '  Stopped: fix the problem above and run again.',
    skippedLine: '  – {id}: skipped. {reason}',
    failedLine: '  ✖ {id}: edit discarded ({reason}).',
    appliedLine: '\n  ✔ {id}: {explanation}',
    reasons: {
      notSent: 'issue id that was not sent for this file',
      emptyFind: 'empty text to replace',
      notFound: "the text to replace doesn't exist in the file",
      multiple: 'the text to replace appears more than once',
    },
    summary: {
      title: '\nSummary:',
      line1: '  {applied} applied, {proposed} proposed without saving, {declined} declined by you,',
      line2: '  {skipped} skipped by the model, {failed} with errors, {notLocated} with no file found.',
      tokens: '  Tokens used: {input} input, {output} output.',
      backup: '  Backup of the original files: {dir}',
      review: '  Review the changes (e.g. git diff) and run "npx ux-validate check" to confirm the fixes.',
    },
    systemPrompt: `You fix content, navigation, interface and accessibility issues in the files of a web app.
You receive one project file and a list of issues found by a UX test. For each issue that can be fixed in this file, propose edits.

Rules:
- Each edit replaces an exact piece of the file ("find") with new text ("replace"). Copy "find" exactly as it appears in the file, including spaces and line breaks, with enough context that it appears only once.
- Make the smallest change that solves the issue. Keep the file's style, indentation and conventions. Don't reformat or refactor anything unrelated to the issue.
- Prefer native, semantic HTML over ARIA (e.g. <button> instead of <div role="button">), following the WAI-ARIA Authoring Practices.
- Text for end users stays in the site's content language, clear and natural.
- Never make up data: phone numbers, prices, addresses, testimonials, customer counts, names. If the fix depends on information you don't have, skip the issue and say what is missing.
- If the issue is not in this file, or the fix requires changes to other files, skip it and explain.
- Write "explanation" and "reason" in English, in one sentence.`,
    promptLanguage: "Language of the site's content: {language}.",
    promptFile: 'File: {file}',
    promptIssues: 'Issues to fix in this file:',
  },

  llm: {
    unknownProvider: 'Unknown provider: "{provider}". Use: {valid}.',
    noModel: 'No model set in standalone.model.',
    missingKey: ({ env }) =>
      `The environment variable ${env} is not set. Set it to your API key and run again:\n` +
      `    PowerShell:   $env:${env}="your-key"\n` +
      `    macOS/Linux:  export ${env}=your-key`,
    invalidAnthropicKey: 'Invalid Anthropic API key or missing permission ({env}).',
    modelNotFound: 'Model not found: {model}.',
    rateLimited: 'API usage limit reached. Try again in a few minutes.',
    badRequest: 'Request rejected by the API: {message}',
    apiError: 'Anthropic API error ({status}): {message}',
    refused: ({ explanation }) => `The model declined the request${explanation ? `: ${explanation}` : ''}.`,
    truncated: 'The answer was cut off for being too long.',
    noAnswer: ({ reason }) => `The model didn't answer${reason ? ` (blocked: ${reason})` : ''}.`,
    connect: "Couldn't connect to {host}: {message}",
    invalidKey: 'Invalid API key or missing permission ({status}): {detail}',
    notFound: 'Model or address not found (404): {detail}',
    httpError: 'API error ({status}): {detail}',
    invalidJson: "The model didn't return valid JSON.",
    jsonFormat: 'Answer only with JSON in this format (JSON Schema):',
  },

  persona: {
    title: 'ux-validate: new persona',
    intro:
      'Describe a real kind of user of your app, not a stereotype. Goals should be concrete tasks\n' +
      '(e.g. "find the price of the basic plan"), not wishes ("like the site").',
    nameQ: 'Name (e.g. Margaret):',
    idQ: 'Identifier (used in the file name and the report):',
    idInvalid: 'Use only lowercase letters, numbers and hyphens (e.g. margaret or raj-dev).',
    idExists: 'A persona with the id "{id}" already exists. Pick another or run with --force to overwrite.',
    descriptionQ: 'Short description (age, occupation, context, how they use technology):',
    viewportQ: 'Which device do they use your app on?',
    viewports: { mobile: 'Phone (mobile)', tablet: 'Tablet', desktop: 'Computer (desktop)' },
    traits: {
      tech_literacy: {
        question: 'Familiarity with technology:',
        options: ['Low: uses the basics, gets lost with jargon and icons without text', 'Medium: everyday apps without trouble', 'High: tech-savvy, uses shortcuts and advanced features'],
      },
      vision: {
        question: 'Vision:',
        options: ['Normal', 'Reduced: needs large text and good contrast', 'Color-blind: can\'t rely on color alone', 'Screen reader: blind, browses only with keyboard and screen reader'],
      },
      patience: {
        question: 'Patience:',
        options: ['Low: gives up after a few steps without progress', 'Medium', 'High: insists until it works'],
      },
      reading_level: {
        question: 'Reading level:',
        options: ['Basic: skips long text, struggles with technical terms', 'Intermediate', 'Advanced: reads everything, handles technical text'],
      },
    },
    languageQ: 'Language they read (e.g. en, pt-BR, es):',
    goalsHint: 'Goals: what does this person come to your app to do? One per line; leave empty to finish.',
    goalQ: 'Goal {n}:',
    expectationsHint: 'Expectations (optional): what do they expect to find? Leave empty to skip.',
    expectationQ: 'Expectation {n}:',
    preview: 'Persona file:',
    saveQ: 'Save this persona?',
    cancelled: 'Persona not saved.',
    saved: '✔ Persona saved to {file}',
    next: '  Test with it: /persona-test {id}',
    fileHeader: '# Persona created with "ux-validate persona new". Format: .ux-validate/references/persona-format.md',
    validate: {
      parseError: 'invalid YAML: {message}',
      notObject: 'the file must contain the persona fields (id, name, viewport, goals…)',
      missingField: 'required field missing: {field}',
      invalidId: 'invalid id "{id}": use lowercase letters, numbers and hyphens',
      idMismatch: 'the id "{id}" differs from the file name ({file}); keeping them equal makes the persona easier to find',
      invalidViewport: 'invalid viewport "{value}"; use: {valid}',
      goals: 'goals must be a non-empty list of text items',
      expectations: 'expectations must be a list of text items',
      missingTrait: 'trait "{trait}" not set; the agent will assume an average value',
      invalidTrait: 'invalid value "{value}" for {trait}; use: {valid}',
      duplicateId: 'id "{id}" is also used by {other}',
      fileMissing: 'file not found',
      noneFound: 'No personas found in {dir}. Create one with "npx ux-validate persona new" or /persona-new.',
      summary: '{ok} of {total} persona(s) valid.',
      failed: '{n} persona(s) with errors.',
    },
  },

  sarif: {
    written: ({ n, file }) => `✔ SARIF with ${n} ${n === 1 ? 'result' : 'results'}: ${file}`,
  },

  comment: {
    title: 'ux-validate',
    noIssues: '✅ No issues found by the automated checks.',
    failing: ({ n, severity }) => `❌ **${n} ${n === 1 ? 'issue' : 'issues'}** with severity ${severity.toLowerCase()} or higher: this check fails.`,
    passing: ({ severity }) => `✅ No issues with severity ${severity.toLowerCase()} or higher.`,
    allIssues: ({ n }) => `All issues (${n})`,
    category: 'Category',
    issue: 'Issue',
    truncated: ({ n }) => `…and ${n} more. See the full report.`,
    fullReport: '[Full report with screenshots]({url})',
    codeScanning: 'Annotations on the changed lines and in the **Security → Code scanning** tab',
    footer: 'Automated checks by ux-validate (accessibility, WAI-ARIA, links, spelling, layout). Persona evaluation runs in your AI tool with /persona-test.',
  },
};
