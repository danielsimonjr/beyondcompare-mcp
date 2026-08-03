# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security (2026-08-03)

- `@hono/node-server` 1.19.x -> 2.0.12 (medium, needs 2.0.5), via
  `@modelcontextprotocol/sdk` 1.29.0 -> 1.30.0.

The hono fix required an indirection: the MCP SDK pinned `@hono/node-server`
to `^1.19.9`, so no in-range update could reach 2.x. SDK 1.30.0 widened that
to `^1.19.9 || ^2.0.5` and is itself inside the existing SDK range, so the
fix is lock-only — no manifest change.


### Added

- **Windows CI leg.** CI ran on `ubuntu-latest` only — but Windows is the *production*
  platform for this MCP server (it runs on Daniel's Windows box), so CI had never once
  tested the OS the server actually ships on. The `build` job now runs a
  `[ubuntu-latest, windows-latest]` matrix.

### Fixed

- **CI never ran on the default branch.** `.github/workflows/ci.yml` filtered its
  `push` trigger to `branches: [main]`, but this repository's default branch is
  `master` — so no push to `master` has ever triggered CI, leaving the default
  branch with no build status. (Pull-request CI was unaffected: the
  `pull_request:` trigger carries no branch filter, so PRs were always checked.)
  The push trigger now targets `master`.
