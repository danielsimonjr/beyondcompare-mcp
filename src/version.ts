/**
 * The server's version, read from `package.json` at startup.
 *
 * The version used to be written a second time as a literal in the server
 * constructor, so a release bumped the manifest and left the server reporting the
 * previous number. One source of truth removes the drift instead of asking someone
 * to remember two places.
 *
 * `createRequire` is used rather than a JSON import because `package.json` sits
 * outside `rootDir`; importing it would pull the manifest into `dist/` and change the
 * published layout.
 */
import { createRequire } from "node:module";

interface Manifest {
  version?: string;
}

function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    // From dist/version.js this resolves to the package root manifest, which is
    // present in the published tarball as well as in a checkout.
    const pkg = require("../package.json") as Manifest;
    return pkg.version ?? "0.0.0";
  } catch {
    // A missing or unreadable manifest must not stop the server from starting.
    // Reporting 0.0.0 is visibly wrong, which is better than crashing on startup.
    return "0.0.0";
  }
}

export const VERSION: string = readVersion();
