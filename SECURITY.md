# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on https://github.com/fabiofigueredo/ux-validate. Don't open a public issue. You'll get an answer as soon as possible, and a fix will be released as a new version of the npm package, the GitHub Action and the Claude Code plugin.

## How ux-validate handles risk

- **Commands it runs:** `app.start` from your `ux-validate.config.yml`, and the agent's commands inside your AI tool, with that tool's own permissions. Review `app.start` like any other script in your project.
- **API keys:** `fix` reads your key from an environment variable you name; the key is never written to files or reports.
- **Content from tested pages is data, not instructions:** the report escapes it and only links to `http(s)`, `file` or relative URLs; the `fix` prompt tells the model to ignore instructions found in page text; source maps are only fetched from the app's own origin.
- **Pinned dependencies that run code:** the Playwright MCP server is pinned (no `@latest`); Playwright is limited to the tested 1.64.x.

## Known dependency advisories

- `nanoid` (high), through `hunspell-asm` (spell check): not exploitable here, because it's only called with a fixed size. `hunspell-asm` has no fixed release; the automatic "fix" downgrades it and breaks spell checking.
- `picomatch` (high), through `vite`: development only (tests and the React example); not part of the published package. No fixed release yet.
