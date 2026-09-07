// Server wiring, exercised through a real MCP client over an in-memory transport.
//
// This is what the old single-file layout could not do. `index.js` connected a stdio
// transport as a side effect of being imported, so the only way to test it was to
// spawn a subprocess and speak JSON-RPC by hand. Now the server is a value that
// `buildServer()` returns, and a client can talk to it directly.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import { TOOLS } from "../src/tools.js";

let client: Client;

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "bc-mcp-test", version: "1.0.0" });
  await Promise.all([
    buildServer().connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterEach(async () => {
  await client.close();
});

describe("tools/list", () => {
  it("advertises every tool the module defines, and no others", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
  });

  it("gives every tool a description and a schema requiring its mandatory arguments", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(
        Array.isArray(tool.inputSchema.required),
        `${tool.name} declares no required arguments`,
      ).toBe(true);
    }
  });
});

describe("tools/call", () => {
  it("reports an unknown tool as an error result rather than throwing", async () => {
    // The MCP contract is that a tool failure comes back as isError, not as a
    // protocol-level exception -- a throw here would tear down the connection.
    const res = await client.callTool({ name: "no_such_tool", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("Unknown tool: no_such_tool");
  });

  it("surfaces a failure from the executable as an error result", async () => {
    process.env.BCOMP_PATH = "definitely-not-a-real-binary.exe";
    try {
      const res = await client.callTool({
        name: "compare_files",
        arguments: { left: "a.txt", right: "b.txt" },
      });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res.content)).toContain("Failed to execute");
    } finally {
      delete process.env.BCOMP_PATH;
    }
  }, 30_000);
});
