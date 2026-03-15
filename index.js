#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { spawn } = require("child_process");
const path = require("path");

// Path to BComp.com (console version) - can be overridden via environment variable
const BCOMP_PATH =
  process.env.BCOMP_PATH ||
  path.join(
    process.env.LOCALAPPDATA || "C:\\Users\\danie\\AppData\\Local",
    "Programs",
    "Beyond Compare 5",
    "BComp.com"
  );

// Exit code meanings from Beyond Compare
const EXIT_CODES = {
  0: "Success",
  1: "Binary same",
  2: "Rules-based same",
  11: "Binary differences",
  12: "Similar",
  13: "Rules-based differences",
  14: "Conflicts detected",
  100: "Error",
  101: "Conflicts detected, merge output not saved",
};

function describeExitCode(code) {
  return EXIT_CODES[code] || `Unknown exit code: ${code}`;
}

/**
 * Execute BComp.com with the given arguments
 */
function executeBComp(args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(BCOMP_PATH, args, { timeout });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code, meaning: describeExitCode(code) });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to execute BComp.com: ${err.message}`));
    });
  });
}

/**
 * Create and configure the MCP server
 */
const server = new Server(
  {
    name: "beyondcompare-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "compare_files",
        description:
          "Compare two files using Beyond Compare. Returns whether files are identical, similar, or different. Use /qc for silent comparison (no GUI) or omit for interactive GUI comparison.",
        inputSchema: {
          type: "object",
          properties: {
            left: {
              type: "string",
              description: "Path to the left (source) file",
            },
            right: {
              type: "string",
              description: "Path to the right (target) file",
            },
            fileViewType: {
              type: "string",
              description:
                "File view type: 'text' for text compare, 'hex' for hex compare, 'table' for table compare, 'mp3' for MP3 compare, 'picture' for picture compare, 'registry' for registry compare, 'version' for version compare",
              enum: [
                "text",
                "hex",
                "table",
                "mp3",
                "picture",
                "registry",
                "version",
              ],
            },
            silent: {
              type: "boolean",
              description:
                "If true, performs a quick silent comparison (no GUI) and returns only the result code. Default: true",
              default: true,
            },
            readOnly: {
              type: "boolean",
              description: "Open files as read-only",
              default: false,
            },
          },
          required: ["left", "right"],
        },
      },
      {
        name: "compare_folders",
        description:
          "Compare two folders using Beyond Compare. Shows differences between directory contents including file presence, size, and modification dates.",
        inputSchema: {
          type: "object",
          properties: {
            left: {
              type: "string",
              description: "Path to the left (source) folder",
            },
            right: {
              type: "string",
              description: "Path to the right (target) folder",
            },
            filters: {
              type: "string",
              description:
                "File filter pattern (e.g., '*.js;*.ts' to include, '-*.log' to exclude)",
            },
            silent: {
              type: "boolean",
              description:
                "If true, performs a quick silent comparison (no GUI). Default: true",
              default: true,
            },
          },
          required: ["left", "right"],
        },
      },
      {
        name: "merge_files",
        description:
          "Perform a 3-way merge using Beyond Compare. Takes left, right, and center (base) files and produces a merged output. Can auto-merge non-conflicting changes.",
        inputSchema: {
          type: "object",
          properties: {
            left: {
              type: "string",
              description: "Path to the left file",
            },
            right: {
              type: "string",
              description: "Path to the right file",
            },
            center: {
              type: "string",
              description: "Path to the center (base/ancestor) file",
            },
            output: {
              type: "string",
              description: "Path for the merged output file",
            },
            automerge: {
              type: "boolean",
              description:
                "Automatically merge non-conflicting changes without user interaction",
              default: false,
            },
            reviewConflicts: {
              type: "boolean",
              description:
                "If automerge is true, opens interactive window when conflicts are found",
              default: false,
            },
            favorLeft: {
              type: "boolean",
              description: "Favor the left side when resolving conflicts",
              default: false,
            },
            favorRight: {
              type: "boolean",
              description: "Favor the right side when resolving conflicts",
              default: false,
            },
          },
          required: ["left", "right", "center", "output"],
        },
      },
      {
        name: "sync_folders",
        description:
          "Open a Folder Sync session in Beyond Compare to synchronize two directories. Can mirror, update, or bidirectionally sync folder contents.",
        inputSchema: {
          type: "object",
          properties: {
            left: {
              type: "string",
              description: "Path to the left (source) folder",
            },
            right: {
              type: "string",
              description: "Path to the right (target) folder",
            },
            filters: {
              type: "string",
              description:
                "File filter pattern (e.g., '*.js;*.ts' to include, '-*.log;-node_modules' to exclude)",
            },
          },
          required: ["left", "right"],
        },
      },
      {
        name: "run_script",
        description:
          "Run a Beyond Compare script file for automated batch operations. Scripts can perform comparisons, syncs, and merges without GUI interaction. Script files use Beyond Compare's scripting language.",
        inputSchema: {
          type: "object",
          properties: {
            scriptPath: {
              type: "string",
              description: "Path to the Beyond Compare script file",
            },
            silent: {
              type: "boolean",
              description: "Run without showing a window",
              default: true,
            },
            closeWhenDone: {
              type: "boolean",
              description: "Close the script window when finished",
              default: true,
            },
          },
          required: ["scriptPath"],
        },
      },
    ],
  };
});

/**
 * Handle tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "compare_files") {
      const {
        left,
        right,
        fileViewType,
        silent = true,
        readOnly = false,
      } = args;

      const bcompArgs = [];

      if (silent) {
        bcompArgs.push(fileViewType ? `/qc=${fileViewType}` : "/qc");
      } else if (fileViewType) {
        bcompArgs.push(`/fv=${fileViewType}`);
      }

      if (readOnly) bcompArgs.push("/ro");

      bcompArgs.push(left, right);

      const result = await executeBComp(bcompArgs);

      const verdict =
        result.code <= 2
          ? "SAME"
          : result.code === 12
            ? "SIMILAR"
            : result.code >= 11 && result.code <= 13
              ? "DIFFERENT"
              : "ERROR";

      return {
        content: [
          {
            type: "text",
            text: [
              `Comparison: ${verdict}`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Left:  ${left}`,
              `Right: ${right}`,
              result.stdout ? `\nOutput:\n${result.stdout}` : "",
              result.stderr ? `\nStderr:\n${result.stderr}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    } else if (name === "compare_folders") {
      const { left, right, filters, silent = true } = args;

      const bcompArgs = [];

      if (silent) {
        bcompArgs.push("/qc");
      }

      if (filters) {
        bcompArgs.push(`/filters=${filters}`);
      }

      bcompArgs.push(left, right);

      const result = await executeBComp(bcompArgs, { timeout: 120000 });

      const verdict =
        result.code <= 2
          ? "SAME"
          : result.code >= 11 && result.code <= 13
            ? "DIFFERENT"
            : "ERROR";

      return {
        content: [
          {
            type: "text",
            text: [
              `Folder comparison: ${verdict}`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Left:  ${left}`,
              `Right: ${right}`,
              result.stdout ? `\nOutput:\n${result.stdout}` : "",
              result.stderr ? `\nStderr:\n${result.stderr}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    } else if (name === "merge_files") {
      const {
        left,
        right,
        center,
        output,
        automerge = false,
        reviewConflicts = false,
        favorLeft = false,
        favorRight = false,
      } = args;

      const bcompArgs = [];

      if (automerge) bcompArgs.push("/automerge");
      if (reviewConflicts) bcompArgs.push("/reviewconflicts");
      if (favorLeft) bcompArgs.push("/favorleft");
      if (favorRight) bcompArgs.push("/favorright");

      bcompArgs.push(`/mergeoutput=${output}`);
      bcompArgs.push(left, right, center);

      const result = await executeBComp(bcompArgs, { timeout: 300000 });

      const success = result.code === 0;
      const conflicts = result.code === 14 || result.code === 101;

      return {
        content: [
          {
            type: "text",
            text: [
              `Merge: ${success ? "SUCCESS" : conflicts ? "CONFLICTS" : "ERROR"}`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Left:   ${left}`,
              `Right:  ${right}`,
              `Center: ${center}`,
              `Output: ${output}`,
              result.stdout ? `\nOutput:\n${result.stdout}` : "",
              result.stderr ? `\nStderr:\n${result.stderr}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    } else if (name === "sync_folders") {
      const { left, right, filters } = args;

      const bcompArgs = ["/sync"];

      if (filters) {
        bcompArgs.push(`/filters=${filters}`);
      }

      bcompArgs.push(left, right);

      const result = await executeBComp(bcompArgs, { timeout: 300000 });

      return {
        content: [
          {
            type: "text",
            text: [
              `Folder sync: ${result.code === 0 ? "SUCCESS" : "COMPLETED WITH ISSUES"}`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Left:  ${left}`,
              `Right: ${right}`,
              result.stdout ? `\nOutput:\n${result.stdout}` : "",
              result.stderr ? `\nStderr:\n${result.stderr}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    } else if (name === "run_script") {
      const { scriptPath, silent = true, closeWhenDone = true } = args;

      const bcompArgs = [`@${scriptPath}`];

      if (silent) bcompArgs.push("/silent");
      if (closeWhenDone) bcompArgs.push("/closescript");

      const result = await executeBComp(bcompArgs, { timeout: 600000 });

      return {
        content: [
          {
            type: "text",
            text: [
              `Script: ${result.code === 0 ? "SUCCESS" : "COMPLETED"}`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Script: ${scriptPath}`,
              result.stdout ? `\nOutput:\n${result.stdout}` : "",
              result.stderr ? `\nStderr:\n${result.stderr}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Beyond Compare MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
