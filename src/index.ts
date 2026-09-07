#!/usr/bin/env node
/**
 * Entry point: build the server and connect it to stdio.
 *
 * This file holds the side effects and nothing else. Every piece of logic lives in a
 * module that can be imported without starting anything.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
  // stdout carries the protocol, so all logging goes to stderr.
  console.error(`Beyond Compare MCP server ${VERSION} running on stdio`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
