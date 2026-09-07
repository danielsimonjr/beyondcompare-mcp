#!/usr/bin/env node
// Start the BUILT server and confirm it speaks MCP.
//
// The unit and server tests import TypeScript sources. This one runs dist/index.js
// the way a consumer does -- through the `bin` entry, as a subprocess over stdio --
// so a packaging fault that the source tests cannot see (a missing shebang, a bad
// import specifier in the emitted JavaScript, an unbuilt dist) fails here.
//
// It must not require Beyond Compare to be installed: listing tools is a protocol
// operation, and making it depend on a Windows executable would turn this into a
// platform test instead of a packaging test.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "dist", "index.js");
const BUDGET_MS = 30_000;

const requests = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "smoke", version: "1.0.0" },
    },
  },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
];

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
}

const child = spawn(process.execPath, [ENTRY], {
  cwd: ROOT,
  stdio: ["pipe", "pipe", "pipe"],
  // Point at a path that does not exist. Startup must not depend on the binary.
  env: { ...process.env, BCOMP_PATH: join(ROOT, "no-such-bcomp.exe") },
});

let buffer = "";
let stderr = "";
const seen = new Map();

const timer = setTimeout(() => {
  child.kill();
  fail(`no response within ${BUDGET_MS}ms. stderr:\n${stderr}`);
}, BUDGET_MS);

child.stderr.on("data", (d) => {
  stderr += d.toString();
});

child.stdout.on("data", (d) => {
  buffer += d.toString();
  // Responses are newline-delimited JSON; the last element is a partial line.
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // not a complete JSON-RPC frame
    }
    if (msg.id !== undefined) seen.set(msg.id, msg);
  }

  if (seen.size === requests.length) {
    clearTimeout(timer);
    child.kill();

    const init = seen.get(1);
    if (init?.error) fail(`initialize returned an error: ${JSON.stringify(init.error)}`);
    if (!init?.result?.serverInfo?.name) fail("initialize returned no serverInfo.name");

    const list = seen.get(2);
    if (list?.error) fail(`tools/list returned an error: ${JSON.stringify(list.error)}`);
    const tools = list?.result?.tools;
    if (!Array.isArray(tools) || tools.length === 0) fail("tools/list returned no tools");

    console.log(
      `SMOKE OK: ${init.result.serverInfo.name} ${init.result.serverInfo.version} — ${tools.length} tools`,
    );
    process.exit(0);
  }
});

child.on("error", (err) => {
  clearTimeout(timer);
  fail(`could not start ${ENTRY}: ${err.message}`);
});

child.on("exit", (code) => {
  if (seen.size !== requests.length) {
    clearTimeout(timer);
    fail(`server exited early with code ${code}. stderr:\n${stderr}`);
  }
});

for (const req of requests) child.stdin.write(`${JSON.stringify(req)}\n`);
