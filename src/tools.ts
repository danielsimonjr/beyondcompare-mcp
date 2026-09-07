/**
 * Tool schemas and their handlers.
 *
 * Each tool is one entry in `TOOLS`, pairing the schema the client sees with the
 * function that runs it. Keeping them together stops the two drifting apart: the
 * previous layout declared every schema in one place and dispatched them in an
 * if/else chain somewhere else, so adding a tool meant remembering both.
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compareFiles,
  executeBComp,
  executeScript,
  launchGui,
  type BcompResult,
} from "./bcomp.js";
import { parseXmlReport } from "./report.js";

/** A JSON-Schema object describing one tool's arguments. */
interface InputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

/** One tool: what the client sees, and what runs when it is called. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: InputSchema;
  run: (args: Record<string, unknown>) => Promise<string>;
}

/** Render the common trailing block of a result: stdout and stderr when present. */
function tail(result: BcompResult, stderrLabel = "Stderr"): string[] {
  return [
    result.stdout ? `\nOutput:\n${result.stdout}` : "",
    result.stderr ? `\n${stderrLabel}:\n${result.stderr}` : "",
  ];
}

/** Build the shared prelude of a scripted folder operation. */
function scriptPrelude(left: string, right: string, filters?: string): string[] {
  const lines = ["log verbose", `load "${left}" "${right}"`];
  if (filters) lines.push(`filter "${filters}"`);
  return lines;
}

export const TOOLS: ToolDef[] = [
  {
    name: "compare_files",
    description:
      "Compare two files using Beyond Compare. Returns whether files are identical, similar, or different. Silent mode uses /qc for quick comparison without GUI.",
    inputSchema: {
      type: "object",
      properties: {
        left: { type: "string", description: "Path to the left (source) file" },
        right: { type: "string", description: "Path to the right (target) file" },
        fileViewType: {
          type: "string",
          description:
            "File view type: 'text' for text compare, 'hex' for hex compare, 'table' for table compare, 'mp3' for MP3 compare, 'picture' for picture compare, 'registry' for registry compare, 'version' for version compare",
          enum: ["text", "hex", "table", "mp3", "picture", "registry", "version"],
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
    async run(args) {
      const left = String(args.left);
      const right = String(args.right);
      const result = await compareFiles({
        left,
        right,
        fileViewType: args.fileViewType as string | undefined,
        silent: args.silent !== false,
        readOnly: args.readOnly === true,
      });
      return [
        `Comparison: ${result.verdict}`,
        `Exit code: ${result.code} (${result.meaning})`,
        `Left:  ${left}`,
        `Right: ${right}`,
        ...tail(result),
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "compare_folders",
    description:
      "Compare two folders using Beyond Compare. In silent mode, generates an XML report listing all differences (files that differ, are missing on either side, etc.). In GUI mode, opens an interactive folder comparison window.",
    inputSchema: {
      type: "object",
      properties: {
        left: { type: "string", description: "Path to the left (source) folder" },
        right: { type: "string", description: "Path to the right (target) folder" },
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
    async run(args) {
      const left = String(args.left);
      const right = String(args.right);
      const filters = args.filters as string | undefined;

      if (args.silent === false) {
        launchGui([left, right]);
        return `Opened folder comparison GUI.\nLeft:  ${left}\nRight: ${right}`;
      }

      const reportPath = join(tmpdir(), `bc_report_${Date.now()}.xml`);
      const scriptLines = scriptPrelude(left, right, filters);
      if (args.criteria) scriptLines.push(`criteria ${String(args.criteria)}`);
      scriptLines.push(
        "expand all",
        `folder-report layout:xml output-to:"${reportPath}"`,
      );

      const { result, reportContent } = await executeScript(scriptLines, {
        timeout: 120_000,
        reportPath,
      });

      return [
        "Folder comparison (scripted):",
        `Exit code: ${result.code} (${result.meaning})`,
        `Left:  ${left}`,
        `Right: ${right}`,
        "",
        parseXmlReport(reportContent),
        result.stderr ? `\nLog:\n${result.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "merge_files",
    description:
      "Perform a 3-way merge using Beyond Compare. Takes left, right, and center (base) files and produces a merged output. Can auto-merge non-conflicting changes.",
    inputSchema: {
      type: "object",
      properties: {
        left: { type: "string", description: "Path to the left file" },
        right: { type: "string", description: "Path to the right file" },
        center: {
          type: "string",
          description: "Path to the center (base/ancestor) file",
        },
        output: { type: "string", description: "Path for the merged output file" },
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
    async run(args) {
      const left = String(args.left);
      const right = String(args.right);
      const center = String(args.center);
      const output = String(args.output);

      const bcompArgs: string[] = [];
      if (args.automerge === true) bcompArgs.push("/automerge");
      if (args.reviewConflicts === true) bcompArgs.push("/reviewconflicts");
      if (args.favorLeft === true) bcompArgs.push("/favorleft");
      if (args.favorRight === true) bcompArgs.push("/favorright");
      bcompArgs.push(`/mergeoutput=${output}`, left, right, center);

      const result = await executeBComp(bcompArgs, { timeout: 300_000 });
      const conflicts = result.code === 14 || result.code === 101;
      const state = result.code === 0 ? "SUCCESS" : conflicts ? "CONFLICTS" : "ERROR";

      return [
        `Merge: ${state}`,
        `Exit code: ${result.code} (${result.meaning})`,
        `Left:   ${left}`,
        `Right:  ${right}`,
        `Center: ${center}`,
        `Output: ${output}`,
        ...tail(result),
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "sync_folders",
    description:
      "Synchronize two folders using Beyond Compare scripting. Supports update (copy newer/missing files) and mirror (make target identical to source) modes in either direction.",
    inputSchema: {
      type: "object",
      properties: {
        left: { type: "string", description: "Path to the left (source) folder" },
        right: { type: "string", description: "Path to the right (target) folder" },
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
    async run(args) {
      const left = String(args.left);
      const right = String(args.right);
      const filters = args.filters as string | undefined;
      const mode = (args.mode as string | undefined) ?? "update";
      const direction = (args.direction as string | undefined) ?? "left->right";

      if (args.dryRun === true) {
        const reportPath = join(tmpdir(), `bc_sync_preview_${Date.now()}.xml`);
        const scriptLines = scriptPrelude(left, right, filters);
        scriptLines.push(
          "expand all",
          `folder-report layout:xml output-to:"${reportPath}"`,
        );

        const { result, reportContent } = await executeScript(scriptLines, {
          timeout: 120_000,
          reportPath,
        });

        return [
          `Sync dry run (${mode} ${direction}):`,
          `Exit code: ${result.code} (${result.meaning})`,
          `Left:  ${left}`,
          `Right: ${right}`,
          "",
          "Files that would be affected:",
          parseXmlReport(reportContent),
          result.stderr ? `\nLog:\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }

      const scriptLines = scriptPrelude(left, right, filters);
      scriptLines.push("expand all", `sync ${mode}:${direction}`);
      const { result } = await executeScript(scriptLines, { timeout: 300_000 });

      return [
        `Folder sync: ${result.code === 0 ? "SUCCESS" : "COMPLETED WITH ISSUES"}`,
        `Mode: ${mode} (${direction})`,
        `Exit code: ${result.code} (${result.meaning})`,
        `Left:  ${left}`,
        `Right: ${right}`,
        ...tail(result, "Log"),
      ]
        .filter(Boolean)
        .join("\n");
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
    async run(args) {
      const scriptPath = String(args.scriptPath);
      const bcompArgs = [`@${scriptPath}`];
      if (args.silent !== false) bcompArgs.push("/silent");
      if (args.closeWhenDone !== false) bcompArgs.push("/closescript");

      const result = await executeBComp(bcompArgs, { timeout: 600_000 });
      return [
        `Script: ${result.code === 0 ? "SUCCESS" : "COMPLETED"}`,
        `Exit code: ${result.code} (${result.meaning})`,
        `Script: ${scriptPath}`,
        ...tail(result),
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
];

/** Look up a tool by the name the client sent. */
export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
