# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
