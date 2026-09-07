import { describe, it, expect, afterEach } from "vitest";
import { describeExitCode, resolveBcompPath, EXIT_CODES } from "../src/bcomp.js";
import { homedir } from "node:os";
import { join } from "node:path";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("describeExitCode", () => {
  it("names every documented Beyond Compare exit code", () => {
    for (const [code, meaning] of Object.entries(EXIT_CODES)) {
      expect(describeExitCode(Number(code))).toBe(meaning);
    }
  });

  it("says the code back when it is not one Beyond Compare documents", () => {
    expect(describeExitCode(77)).toBe("Unknown exit code: 77");
  });

  it("handles the null code a killed process reports", () => {
    // spawn() gives code === null when the child was terminated by a signal.
    // "Unknown exit code: null" is useless; the caller needs to know it was killed.
    expect(describeExitCode(null)).toBe("Terminated before exit (killed or timed out)");
  });
});

describe("resolveBcompPath", () => {
  it("prefers an explicit BCOMP_PATH", () => {
    process.env.BCOMP_PATH = "D:/custom/BComp.com";
    expect(resolveBcompPath()).toBe("D:/custom/BComp.com");
  });

  it("derives the default from LOCALAPPDATA when BCOMP_PATH is unset", () => {
    delete process.env.BCOMP_PATH;
    process.env.LOCALAPPDATA = "E:/appdata";
    expect(resolveBcompPath()).toBe(
      join("E:/appdata", "Programs", "Beyond Compare 5", "BComp.com"),
    );
  });

  it("falls back to the CURRENT user's home, never a hard-coded account", () => {
    // The shipped default used to be a literal path under one developer's profile,
    // so on any machine without LOCALAPPDATA it pointed at an account that does not
    // exist there. The fallback must be derived from the running user.
    delete process.env.BCOMP_PATH;
    delete process.env.LOCALAPPDATA;
    const resolved = resolveBcompPath();
    expect(resolved.startsWith(homedir())).toBe(true);
    expect(resolved).toContain("BComp.com");
  });
});
