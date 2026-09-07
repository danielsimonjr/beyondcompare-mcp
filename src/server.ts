/**
 * MCP server construction.
 *
 * Separate from `index.ts` so the server can be built and inspected without
 * connecting a transport. Importing the old single-file entry point started a real
 * server on the importer's stdio, which is why it could only ever be tested through
 * a subprocess.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, findTool } from "./tools.js";
import { VERSION } from "./version.js";

/** Build a configured server with every tool registered. */
export function buildServer(): Server {
  const server = new Server(
    { name: "beyondcompare-mcp", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const tool = findTool(name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const text = await tool.run(args ?? {});
      return { content: [{ type: "text", text }] };
    } catch (error) {
      // A thrown value is not necessarily an Error. Reading `.message` off an
      // arbitrary throw yields "undefined", which reports a failure while hiding it.
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}
