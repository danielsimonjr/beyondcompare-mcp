# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
