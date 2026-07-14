# Contributing to wmux

Thanks for helping improve wmux. The project welcomes focused fixes and
features that preserve its purpose: a single-user terminal multiplexer for a
trusted private network.

## Before You Start

Open an issue before investing in a substantial change to authentication,
network boundaries, persisted schemas, terminal rendering, session backends,
vendored dependencies, or the overall UI. These areas have compatibility,
security, or licensing constraints that are easiest to resolve before code is
written.

Report security vulnerabilities privately as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## Development

Use Node.js 22 or newer. Install dependencies and run the local service with:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 3478
```

Before submitting a pull request, run:

```bash
npm run check
```

For user-interface changes, also run the relevant browser coverage:

```bash
npm run test:e2e:chromium
# Run the complete Chromium and WebKit matrix before merging broad UI changes.
npm run test:e2e
```

## Pull Requests

- Keep each pull request focused. Avoid mixing a feature or bug fix with an
  unrelated refactor, dependency update, or documentation rewrite.
- Explain the problem, the chosen behavior, compatibility or risk
  considerations, and the validation performed.
- Include desktop and mobile before/after images for visible UI changes when
  they make the result easier to review. Never include private machine names,
  hosts, usernames, tokens, or terminal history.
- Add or update tests for changed behavior. Platform-specific claims should
  identify the environment on which they were validated.
- Use clear commit messages. Maintainers may amend, squash, or reorganize
  commits while integrating a pull request.
- Keep known or intentionally deferred limitations documented near the
  affected feature.

## Engineering Guardrails

[AGENTS.md](AGENTS.md) is the authoritative engineering reference. In
particular:

- Keep wmux private-network and single-user by design. Do not weaken bind,
  Host, Origin, proxy, WebSocket, or helper-endpoint controls without an
  explicit replacement security control.
- Persisted-state changes require a schema migration, atomic-write and backup
  compatibility, and downgrade refusal.
- Browser/server wire contracts belong in `src/shared/protocol.ts`. Machine
  credentials and other server-only configuration must not enter browser
  payloads.
- Preserve stable machine IDs, durable-session ownership, and direct
  workspace/tab links.
- Keep child-process operations out of request and pane-attach blocking paths.
- Preserve both the canvas-grid and legacy DOM chrome while both remain
  supported. UI work should cover desktop and mobile, keyboard and pointer
  interaction, and accessible touch targets.
- Keep product styling outside the terminal canvas. Terminal protocol changes
  must account for replay, resize, scrollback, multiplexer passthrough, and
  reconnect behavior.

## Dependencies, Assets, and Generated Files

- Every dependency, vendored source tree, font, image, and other asset must
  have clear redistribution terms. Public availability is not a license.
- Update `THIRD_PARTY_NOTICES.md` and adjacent provenance records when adding
  or changing third-party material.
- Keep live configuration and deployment details out of the repository. Use
  `wmux.config.example.json` for reusable examples.
- Do not commit `dist`, `node_modules`, `test-results`, credentials, local
  machine inventories, or temporary planning and handoff documents.
- Regenerate tracked README images with `npm run docs:screenshots`; do not
  replace them with captures containing private data.

AI-assisted contributions are welcome. The contributor remains responsible
for understanding the submitted code and for its correctness, testing,
security, provenance, and licensing.
