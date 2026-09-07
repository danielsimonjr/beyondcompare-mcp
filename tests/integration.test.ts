// End-to-end against the REAL BComp.com when it is installed.
//
// A mocked comparator proves only that the mock was called. These cases run the
// actual binary on real temp files, so an argument-order or flag regression fails
// here instead of in production. Skipped (not failed) where BC is absent, so CI on
// Linux stays honest rather than green-by-omission.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareFiles, resolveBcompPath } from "../src/bcomp.js";

const INSTALLED = existsSync(resolveBcompPath());
const suite = INSTALLED ? describe : describe.skip;

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "bcmcp-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

suite("compare_files against the real BComp.com", () => {
  it("reports two byte-identical files as SAME", async () => {
    const a = join(dir, "same-a.txt");
    const b = join(dir, "same-b.txt");
    writeFileSync(a, "hello\nworld\n");
    writeFileSync(b, "hello\nworld\n");
    const r = await compareFiles({ left: a, right: b, silent: true });
    expect(r.verdict).toBe("SAME");
  }, 60_000);

  it("reports two differing files as DIFFERENT", async () => {
    const a = join(dir, "diff-a.txt");
    const b = join(dir, "diff-b.txt");
    writeFileSync(a, "hello\nworld\n");
    writeFileSync(b, "hello\nthere\n");
    const r = await compareFiles({ left: a, right: b, silent: true });
    expect(r.verdict).toBe("DIFFERENT");
  }, 60_000);
});

describe("compare_files when the binary is missing", () => {
  it("rejects with a message naming the executable, not a bare ENOENT", async () => {
    process.env.BCOMP_PATH = join(dir, "definitely-not-here.exe");
    try {
      await expect(
        compareFiles({ left: "a", right: "b", silent: true }),
      ).rejects.toThrow(/Failed to execute/);
    } finally {
      delete process.env.BCOMP_PATH;
    }
  }, 30_000);
});
