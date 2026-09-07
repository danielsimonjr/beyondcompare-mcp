# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Migrated to TypeScript on Bun.** The single 709-line `index.js` (CommonJS) is now
  five ES modules under `src/`, compiled by `tsc` to `dist/`. Bun 1.4.2 is the
  development toolchain; Node >= 24 remains the runtime the server ships on.
  `bin` now points at `dist/index.js`, and `prepublishOnly` builds it.

- **Split the entry point from the logic.** `index.js` connected a stdio transport as
  a side effect of being imported, so nothing in it could be tested except through a
  subprocess. `buildServer()` now returns a server, and the entry point is the only
  file with side effects: `src/bcomp.ts` (locate/run the executable), `src/report.ts`
  (XML report parsing), `src/tools.ts` (schemas paired with handlers),
  `src/server.ts` (wiring), `src/index.ts` (start).

- **Tool schemas now sit next to their handlers.** They were declared in one place and
  dispatched in an if/else chain in another, so adding a tool meant editing two
  unrelated blocks and nothing failed if you edited only one.

### Fixed

- **The default Beyond Compare path pointed at one developer's user profile.** When
  `LOCALAPPDATA` was unset, the fallback was a hard-coded absolute path under a named
  Windows account that does not exist on anyone else's machine. The fallback is now
  derived from the running user's home directory.

- **GUI mode killed the window it had just opened.** `compare_folders` with
  `silent: false` spawned Beyond Compare with a 5-second timeout, so the interactive
  window the caller asked for was terminated a few seconds later. The GUI is now
  launched detached and unawaited, with no timeout.

- **A killed run reported "Unknown exit code: null".** `spawn` gives a null exit code
  when the child is terminated by a signal, which is what a timeout looks like. That
  case now says so.

- **An unknown report status was counted but never listed.** A `<filecomp>` whose
  status is not one of the six known values now appears in the difference list as well
  as in the count -- silently shrinking a diff is the one direction this report must
  not err in.

- **A thrown non-Error produced "Error: undefined".** The tool-call handler read
  `.message` off whatever was thrown; it now narrows first, so an unexpected throw is
  reported instead of hidden.

- **The version was written in two places.** The server reported a literal `1.1.0`
  that a release would leave behind. It now reads `package.json`.

- **CI could pass without running anything.** Every stage was invoked with
  `--if-present`, which succeeds silently when a script is missing, and the repo had
  no `typecheck` script at all. The stages are now required, and a new
  `scripts/smoke.mjs` starts the BUILT server and checks it answers `initialize` and
  `tools/list` -- verified to fail when `dist/index.js` is absent.

### Added

- **A test suite: 20 tests across four files**, where there had been one subprocess
  smoke test whose comments described a different server (they referred to Ollama and
  to a `src/index.mjs` that never existed here). Coverage includes the report parser,
  exit-code and path resolution, MCP wiring through an in-memory transport, and
  **integration tests that run the real BComp.com** on temp files -- asserting SAME
  for identical input and DIFFERENT for differing input, so a mocked comparator cannot
  pass them. Those cases skip, rather than fail, where Beyond Compare is not installed.

- **`types: ["node"]` in `tsconfig.json`.** TypeScript 7.0.2 does not auto-include
  `node_modules/@types` here; repos that typecheck without this are relying on a
  dependency that happens to ship its own node reference, which breaks when that
  dependency changes.

## [1.1.0] - 2026-08-12

> First tagged release. This repo had never been given a git tag or a GitHub
> release before, and its CHANGELOG had never grown past `[Unreleased]` — so
> this section rolls up everything since the initial commit, not just the
> most recent work. `index.js`'s self-reported MCP handshake version was
> already `1.1.0` (bumped for the executeScript/XML feature below, with no
> matching `package.json` bump or CHANGELOG entry); `package.json` is
> brought up to match rather than starting a fresh number.

### Added

- **`executeScript()` helper + XML folder-report parser.** Writes script
  lines to a temp file, runs BComp with `/silent /closescript`, optionally
  reads back a report file, then cleans up — letting tools build multi-step
  BC scripts without piling them onto the command line. `parseXmlReport()`
  converts BC5 XML folder-report output into a human-readable summary
  (DIFF / LEFT ONLY / RIGHT ONLY counts, per-file lines).
- CI + Dependabot + auto-merge, with a Windows leg — Windows is the
  production platform for this MCP server (it wraps a Windows-only desktop
  app), so CI had never once tested the OS the server actually ships on.

### Security (2026-08-03)

- `@hono/node-server` 1.19.x -> 2.0.12 (medium, needs 2.0.5), via
  `@modelcontextprotocol/sdk` 1.29.0 -> 1.30.0.

The hono fix required an indirection: the MCP SDK pinned `@hono/node-server`
to `^1.19.9`, so no in-range update could reach 2.x. SDK 1.30.0 widened that
to `^1.19.9 || ^2.0.5` and is itself inside the existing SDK range, so the
fix is lock-only — no manifest change.

### Fixed

- **CI never ran on the default branch.** `.github/workflows/ci.yml` filtered its
  `push` trigger to `branches: [main]`, but this repository's default branch is
  `master` — so no push to `master` has ever triggered CI, leaving the default
  branch with no build status. (Pull-request CI was unaffected: the
  `pull_request:` trigger carries no branch filter, so PRs were always checked.)
  The push trigger now targets `master`.
