# React apps and other SPAs

Use this when `checks-brief.md` shows a framework (`react` or `next`), or when the app switches screens without reloading the page.

1. **Routes that aren't links.** Screens opened by a button (`navigate()`), tabs or modals aren't part of the automatic crawl. If you find important screens like that, suggest the user add them to `crawl.routes` in `ux-validate.config.yml`.
2. **Route changes.** While navigating as the persona, check what the browser would do on a regular page: does the tab title change? Does focus go to the new content or get lost? Screen reader personas need to hear that the page changed. The `check:spa` check tests one change; evaluate the others along the persona's path.
3. **Async states.** Loading, empty and error: do they show up, are they announced (`aria-busy`, `role="status"`) and do they avoid a blank screen? Are buttons disabled while submitting and re-enabled afterwards?
4. **Where to fix.** The checks already include `react.components` (the component that rendered the element and the ones above it) and, on the development server, `sourceHint` with file and line. Use them in your findings: look in the component's file first. Remember that in JSX the `class` attribute is `className` and text may be split across expressions (`{name}`).
5. **Production build.** If `checks-brief.md` says `production build`, there are no component names or files: tell the user that running against the development server (e.g. `npm run dev`) improves where-to-fix hints.
