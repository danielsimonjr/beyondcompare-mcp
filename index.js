#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

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
 * Create a temporary script file, execute it, read report output, then clean up.
 * Returns { result, reportContent } where reportContent is the file output (if any).
 */
async function executeScript(scriptLines, { timeout = 120000, reportPath = null } = {}) {
  const scriptPath = path.join(os.tmpdir(), `bc_script_${Date.now()}.txt`);
  try {
    fs.writeFileSync(scriptPath, scriptLines.join("\r\n"), "utf-8");
    const result = await executeBComp(
      [`@${scriptPath}`, "/silent", "/closescript"],
      { timeout }
    );
    let reportContent = "";
    if (reportPath) {
      try {
        reportContent = fs.readFileSync(reportPath, "utf-8");
      } catch (e) {
        reportContent = `(Could not read report: ${e.message})`;
      }
    }
    return { result, reportContent };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (_) {}
    if (reportPath) {
      try { fs.unlinkSync(reportPath); } catch (_) {}
    }
  }
}

/**
 * Parse XML folder report into a human-readable summary.
 * BC5 XML format uses <filecomp status="same|diff|left|right|newer|older">
 * with nested <lt>/<rt> blocks containing <name>, <size>, <modified>.
 * Folder entries use <foldercomp> with optional <lt>/<rt> children.
 */
function parseXmlReport(xml) {
  if (!xml || xml.startsWith("(Could not read")) return xml;

  const lines = [];
  let same = 0, diff = 0, leftOnly = 0, rightOnly = 0;

  // Build path context by tracking folder hierarchy
  // We'll use a simpler approach: extract all filecomp entries with their context
  const fileMatches = xml.matchAll(/<filecomp\s+status="([^"]*)">([\s\S]*?)<\/filecomp>/g);

  for (const match of fileMatches) {
    const status = match[1];
    const inner = match[2];

    // Get filename from left or right side
    const ltName = inner.match(/<lt>[\s\S]*?<name>([^<]*)<\/name>/);
    const rtName = inner.match(/<rt>[\s\S]*?<name>([^<]*)<\/name>/);
    const name = (ltName && ltName[1]) || (rtName && rtName[1]) || "unknown";

    if (status === "same") {
      same++;
    } else if (status === "diff" || status === "newer" || status === "older") {
      diff++;
      lines.push(`  DIFF: ${name} (${status})`);
    } else if (status === "left") {
      leftOnly++;
      lines.push(`  LEFT ONLY: ${name}`);
    } else if (status === "right") {
      rightOnly++;
      lines.push(`  RIGHT ONLY: ${name}`);
    } else {
      diff++;
      lines.push(`  ${status.toUpperCase()}: ${name}`);
    }
  }

  // Check for folder-only entries (folders that exist only on one side)
  // These are <foldercomp> with only <lt> or only <rt> (not both)
  const folderMatches = xml.matchAll(/<foldercomp>([\s\S]*?)<\/foldercomp>/g);
  for (const match of folderMatches) {
    const inner = match[1];
    const hasLt = /<lt>/.test(inner);
    const hasRt = /<rt>/.test(inner);
    if (hasLt && !hasRt) {
      const nameMatch = inner.match(/<lt>[\s\S]*?<name>([^<]*)<\/name>/);
      if (nameMatch) {
        leftOnly++;
        lines.push(`  LEFT ONLY (folder): ${nameMatch[1]}`);
      }
    } else if (!hasLt && hasRt) {
      const nameMatch = inner.match(/<rt>[\s\S]*?<name>([^<]*)<\/name>/);
      if (nameMatch) {
        rightOnly++;
        lines.push(`  RIGHT ONLY (folder): ${nameMatch[1]}`);
      }
    }
  }

  const summary = [
    `Summary: ${same} same, ${diff} different, ${leftOnly} left-only, ${rightOnly} right-only`,
  ];

  if (lines.length > 0) {
    summary.push("");
    summary.push("Differences:");
    if (lines.length > 200) {
      summary.push(...lines.slice(0, 200));
      summary.push(`  ... and ${lines.length - 200} more`);
    } else {
      summary.push(...lines);
    }
  }

  return summary.join("\n");
}

/**
 * Create and configure the MCP server
 */
const server = new Server(
  {
    name: "beyondcompare-mcp",
    version: "1.1.0",
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
          "Compare two files using Beyond Compare. Returns whether files are identical, similar, or different. Silent mode uses /qc for quick comparison without GUI.",
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
          "Compare two folders using Beyond Compare. In silent mode, generates an XML report listing all differences (files that differ, are missing on either side, etc.). In GUI mode, opens an interactive folder comparison window.",
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
                "If true, runs a scripted comparison and returns a structured diff report. If false, opens the GUI. Default: true",
              default: true,
            },
            criteria: {
              type: "string",
              description:
                "Comparison criteria: 'binary' for byte-by-byte, 'rules-based' for content rules, 'timestamp' for date comparison, 'size' for size only, 'CRC' for checksum. Default: timestamp + size",
            },
            showMatches: {
              type: "boolean",
              description:
                "If true, includes matching files in the report (not just differences). Default: false",
              default: false,
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
          "Synchronize two folders using Beyond Compare scripting. Supports update (copy newer/missing files) and mirror (make target identical to source) modes in either direction.",
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
            mode: {
              type: "string",
              description:
                "Sync mode: 'update' copies newer/orphan files (non-destructive), 'mirror' makes target identical to source (may delete). Default: update",
              enum: ["update", "mirror"],
              default: "update",
            },
            direction: {
              type: "string",
              description:
                "Sync direction: 'left->right', 'right->left', or 'all' (bidirectional). Default: left->right",
              enum: ["left->right", "right->left", "all"],
              default: "left->right",
            },
            dryRun: {
              type: "boolean",
              description:
                "If true, generates a report of what would be synced without actually syncing. Default: false",
              default: false,
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
      const {
        left,
        right,
        filters,
        silent = true,
        criteria,
        showMatches = false,
      } = args;

      if (!silent) {
        // GUI mode — just open the folder comparison window
        const bcompArgs = [left, right];
        const result = await executeBComp(bcompArgs, { timeout: 5000 });
        return {
          content: [
            {
              type: "text",
              text: `Opened folder comparison GUI.\nLeft:  ${left}\nRight: ${right}`,
            },
          ],
        };
      }

      // Script mode — generate temp report
      const reportPath = path.join(os.tmpdir(), `bc_report_${Date.now()}.xml`);
      const display = showMatches ? "display-all" : "display-mismatches";

      const scriptLines = [
        `log verbose`,
        `load "${left}" "${right}"`,
      ];
      if (filters) scriptLines.push(`filter "${filters}"`);
      if (criteria) scriptLines.push(`criteria ${criteria}`);
      scriptLines.push(
        `expand all`,
        `folder-report layout:xml output-to:"${reportPath}"`,
      );

      const { result, reportContent } = await executeScript(scriptLines, {
        timeout: 120000,
        reportPath,
      });

      const parsed = parseXmlReport(reportContent);

      return {
        content: [
          {
            type: "text",
            text: [
              `Folder comparison (scripted):`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Left:  ${left}`,
              `Right: ${right}`,
              "",
              parsed,
              result.stderr ? `\nLog:\n${result.stderr}` : "",
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
      const {
        left,
        right,
        filters,
        mode = "update",
        direction = "left->right",
        dryRun = false,
      } = args;

      if (dryRun) {
        // Dry run: generate a comparison report showing what would change
        const reportPath = path.join(os.tmpdir(), `bc_sync_preview_${Date.now()}.xml`);
        const scriptLines = [
          `log verbose`,
          `load "${left}" "${right}"`,
        ];
        if (filters) scriptLines.push(`filter "${filters}"`);
        scriptLines.push(
          `expand all`,
          `folder-report layout:xml output-to:"${reportPath}"`,
        );

        const { result, reportContent } = await executeScript(scriptLines, {
          timeout: 120000,
          reportPath,
        });

        const parsed = parseXmlReport(reportContent);

        return {
          content: [
            {
              type: "text",
              text: [
                `Sync dry run (${mode} ${direction}):`,
                `Exit code: ${result.code} (${result.meaning})`,
                `Left:  ${left}`,
                `Right: ${right}`,
                "",
                "Files that would be affected:",
                parsed,
                result.stderr ? `\nLog:\n${result.stderr}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        };
      }

      // Actual sync via script
      const scriptLines = [
        `log verbose`,
        `load "${left}" "${right}"`,
      ];
      if (filters) scriptLines.push(`filter "${filters}"`);
      scriptLines.push(
        `expand all`,
        `sync ${mode}:${direction}`,
      );

      const { result } = await executeScript(scriptLines, { timeout: 300000 });

      return {
        content: [
          {
            type: "text",
            text: [
              `Folder sync: ${result.code === 0 ? "SUCCESS" : "COMPLETED WITH ISSUES"}`,
              `Mode: ${mode} (${direction})`,
              `Exit code: ${result.code} (${result.meaning})`,
              `Left:  ${left}`,
              `Right: ${right}`,
              result.stdout ? `\nOutput:\n${result.stdout}` : "",
              result.stderr ? `\nLog:\n${result.stderr}` : "",
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
