/**
 * Everything that touches the Beyond Compare executable: locating it, running it,
 * and turning its exit codes back into words.
 *
 * Kept separate from the MCP wiring so the logic can be imported and tested without
 * starting a server on stdio.
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Exit codes documented by Beyond Compare, mapped to their meaning. */
export const EXIT_CODES: Readonly<Record<number, string>> = Object.freeze({
  0: "Success",
  1: "Binary same",
  2: "Rules-based same",
  11: "Binary differences",
  12: "Similar",
  13: "Rules-based differences",
  14: "Conflicts detected",
  100: "Error",
  101: "Conflicts detected, merge output not saved",
});

/** Result of one BComp.com invocation. */
export interface BcompResult {
  stdout: string;
  stderr: string;
  /** `null` when the child was killed by a signal rather than exiting. */
  code: number | null;
  meaning: string;
}

/**
 * Describe an exit code in words.
 *
 * `null` is handled explicitly: `spawn` reports it when the child was terminated by a
 * signal, which is what a timeout looks like. Reporting "Unknown exit code: null"
 * would tell the caller nothing about why the run produced no verdict.
 */
export function describeExitCode(code: number | null): string {
  if (code === null) return "Terminated before exit (killed or timed out)";
  return EXIT_CODES[code] ?? `Unknown exit code: ${code}`;
}

/**
 * Locate BComp.com.
 *
 * Order: an explicit `BCOMP_PATH`, then the standard install directory under
 * `LOCALAPPDATA`, then the same directory derived from the CURRENT user's home.
 * The last step matters: the previous default was a literal path under one
 * developer's profile, so on a machine without `LOCALAPPDATA` it named an account
 * that did not exist there.
 */
export function resolveBcompPath(): string {
  const explicit = process.env.BCOMP_PATH;
  if (explicit) return explicit;

  const localAppData =
    process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  return join(localAppData, "Programs", "Beyond Compare 5", "BComp.com");
}

/** Run BComp.com with the given arguments and collect its output. */
export function executeBComp(
  args: string[],
  { timeout = 60_000 }: { timeout?: number } = {},
): Promise<BcompResult> {
  return new Promise((resolve, reject) => {
    const exe = resolveBcompPath();
    const proc = spawn(exe, args, { timeout });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      resolve({ stdout, stderr, code, meaning: describeExitCode(code) });
    });
    proc.on("error", (err: Error) => {
      reject(new Error(`Failed to execute ${exe}: ${err.message}`));
    });
  });
}

/**
 * Open Beyond Compare's GUI and return as soon as it has been launched.
 *
 * The GUI is deliberately NOT awaited and carries no timeout. The previous code
 * spawned it with a 60-second cap, so the window the user was invited to work in was
 * killed out from under them once the timer expired.
 */
export function launchGui(args: string[]): void {
  const proc = spawn(resolveBcompPath(), args, {
    detached: true,
    stdio: "ignore",
  });
  proc.unref();
}

/**
 * Write a temporary script, run it, read back the report it produced, then remove
 * both files.
 *
 * Cleanup is in a `finally` so a failed run does not leave scripts in the temp
 * directory.
 */
export async function executeScript(
  scriptLines: string[],
  {
    timeout = 120_000,
    reportPath = null,
  }: { timeout?: number; reportPath?: string | null } = {},
): Promise<{ result: BcompResult; reportContent: string }> {
  const scriptPath = join(tmpdir(), `bc_script_${Date.now()}.txt`);
  try {
    writeFileSync(scriptPath, scriptLines.join("\r\n"), "utf-8");
    const result = await executeBComp([`@${scriptPath}`, "/silent", "/closescript"], {
      timeout,
    });

    let reportContent = "";
    if (reportPath) {
      try {
        reportContent = readFileSync(reportPath, "utf-8");
      } catch (e) {
        reportContent = `(Could not read report: ${(e as Error).message})`;
      }
    }
    return { result, reportContent };
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {
      /* the script may never have been written; nothing to clean up */
    }
    if (reportPath) {
      try {
        unlinkSync(reportPath);
      } catch {
        /* no report was produced */
      }
    }
  }
}

/** How a file comparison came out. */
export type Verdict = "SAME" | "SIMILAR" | "DIFFERENT" | "ERROR";

/**
 * Map a comparison exit code to a verdict.
 *
 * Ordering matters: 12 ("Similar") sits inside the 11-13 difference band, so it must
 * be tested before the band.
 */
export function verdictFor(code: number | null): Verdict {
  if (code === null) return "ERROR";
  if (code <= 2) return "SAME";
  if (code === 12) return "SIMILAR";
  if (code >= 11 && code <= 13) return "DIFFERENT";
  return "ERROR";
}

/** Compare two files and return the raw result alongside its verdict. */
export async function compareFiles(opts: {
  left: string;
  right: string;
  fileViewType?: string;
  silent?: boolean;
  readOnly?: boolean;
}): Promise<BcompResult & { verdict: Verdict }> {
  const { left, right, fileViewType, silent = true, readOnly = false } = opts;
  const args: string[] = [];

  if (silent) args.push(fileViewType ? `/qc=${fileViewType}` : "/qc");
  else if (fileViewType) args.push(`/fv=${fileViewType}`);
  if (readOnly) args.push("/ro");
  args.push(left, right);

  const result = await executeBComp(args);
  return { ...result, verdict: verdictFor(result.code) };
}
