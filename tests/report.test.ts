import { describe, it, expect } from "vitest";
import { parseXmlReport } from "../src/report.js";

const xml = (body: string) => `<?xml version="1.0"?><report>${body}</report>`;

describe("parseXmlReport", () => {
  it("counts each status and lists only the non-matching entries", () => {
    const out = parseXmlReport(
      xml(
        `<filecomp status="same"><lt><name>a.txt</name></lt></filecomp>` +
          `<filecomp status="diff"><lt><name>b.txt</name></lt></filecomp>` +
          `<filecomp status="left"><lt><name>c.txt</name></lt></filecomp>` +
          `<filecomp status="right"><rt><name>d.txt</name></rt></filecomp>`,
      ),
    );
    expect(out).toContain("Summary: 1 same, 1 different, 1 left-only, 1 right-only");
    expect(out).toContain("DIFF: b.txt");
    expect(out).toContain("LEFT ONLY: c.txt");
    expect(out).toContain("RIGHT ONLY: d.txt");
    // A matching file is counted but must not be listed -- the report is a diff, not an inventory.
    expect(out).not.toContain("a.txt");
  });

  it("treats an unknown status as a difference rather than dropping it", () => {
    const out = parseXmlReport(xml(`<filecomp status="orphan"><lt><name>e.txt</name></lt></filecomp>`));
    expect(out).toContain("Summary: 0 same, 1 different");
    expect(out).toContain("ORPHAN: e.txt");
  });

  it("reports a folder present on only one side", () => {
    const out = parseXmlReport(
      xml(`<foldercomp><lt><name>only-left</name></lt></foldercomp>`),
    );
    expect(out).toContain("LEFT ONLY (folder): only-left");
    expect(out).toContain("1 left-only");
  });

  it("does NOT count a folder present on both sides as one-sided", () => {
    const out = parseXmlReport(
      xml(`<foldercomp><lt><name>x</name></lt><rt><name>x</name></rt></foldercomp>`),
    );
    expect(out).toContain("Summary: 0 same, 0 different, 0 left-only, 0 right-only");
  });

  it("truncates a very long difference list and says how many were dropped", () => {
    const many = Array.from(
      { length: 205 },
      (_, i) => `<filecomp status="diff"><lt><name>f${i}.txt</name></lt></filecomp>`,
    ).join("");
    const out = parseXmlReport(xml(many));
    expect(out).toContain("... and 5 more");
    expect(out).toContain("Summary: 0 same, 205 different");
  });

  it("passes an unreadable-report placeholder straight through", () => {
    expect(parseXmlReport("(Could not read report: ENOENT)")).toBe(
      "(Could not read report: ENOENT)",
    );
  });

  it("returns the input unchanged when it is empty", () => {
    expect(parseXmlReport("")).toBe("");
  });
});
