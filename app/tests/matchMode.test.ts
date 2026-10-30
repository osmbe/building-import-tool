import { describe, expect, it } from "vite-plus/test";
import {
  isCandidate,
  resolveMatchMode,
  supportsSourceTags,
} from "~/utils/matchMode";

// [matched by geometry, matched by source tag]
const cases: [boolean, boolean][] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

const run = (mode: "geometry" | "source" | "both") =>
  cases.map(([byGeometry, bySourceTag]) =>
    isCandidate(mode, { byGeometry, bySourceTag }),
  );

describe("isCandidate", () => {
  it("geometry mode only looks at geometry", () => {
    expect(run("geometry")).toEqual([true, false, true, false]);
  });

  it("source mode only looks at the source tag", () => {
    expect(run("source")).toEqual([true, true, false, false]);
  });

  it("both mode drops a building matched by geometry OR source tag", () => {
    expect(run("both")).toEqual([true, false, false, false]);
  });
});

describe("resolveMatchMode", () => {
  it("keeps every mode for GRB", () => {
    for (const mode of ["geometry", "source", "both"] as const)
      expect(resolveMatchMode(mode, "grb")).toEqual({
        downgraded: false,
        mode,
      });
  });

  it("falls back to geometry for sources without source tags", () => {
    for (const src of ["knw", "picc", "urbis"] as const) {
      expect(resolveMatchMode("both", src)).toEqual({
        downgraded: true,
        mode: "geometry",
      });
      expect(resolveMatchMode("source", src)).toEqual({
        downgraded: true,
        mode: "geometry",
      });
      expect(resolveMatchMode("geometry", src)).toEqual({
        downgraded: false,
        mode: "geometry",
      });
    }
  });

  it("only GRB supports source tags", () => {
    expect(supportsSourceTags("grb")).toBe(true);
    expect(supportsSourceTags("picc")).toBe(false);
  });
});
