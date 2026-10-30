import { beforeEach, describe, expect, it } from "vite-plus/test";
import { useMatchMode } from "~/composables/useMatchMode";

describe("useMatchMode", () => {
  beforeEach(() => {
    const m = useMatchMode();
    m.setMatchMode("geometry");
    m.setUseOverpass(false);
  });

  it("defaults to geometry matching at 85% without Overpass", () => {
    const { matchMode, geometryThreshold, useOverpass } = useMatchMode();
    expect(matchMode.value).toBe("geometry");
    expect(geometryThreshold.value).toBe(0.85);
    expect(useOverpass.value).toBe(false);
  });

  it("shares state between callers", () => {
    useMatchMode().setMatchMode("both");
    expect(useMatchMode().matchMode.value).toBe("both");
  });

  it("toggles between geometry and source", () => {
    const m = useMatchMode();
    m.toggleMatchMode();
    expect(m.matchMode.value).toBe("source");
    m.toggleMatchMode();
    expect(m.matchMode.value).toBe("geometry");
    // 'both' is not geometry, so it toggles to geometry
    m.setMatchMode("both");
    m.toggleMatchMode();
    expect(m.matchMode.value).toBe("geometry");
  });

  it("clamps the geometry threshold to [0.3, 0.95] and ignores NaN", () => {
    const m = useMatchMode();
    m.setGeometryThreshold(0.5);
    expect(m.geometryThreshold.value).toBe(0.5);
    m.setGeometryThreshold(0.1);
    expect(m.geometryThreshold.value).toBe(0.3);
    m.setGeometryThreshold(2);
    expect(m.geometryThreshold.value).toBe(0.95);
    m.setGeometryThreshold(Number.NaN);
    expect(m.geometryThreshold.value).toBe(0.95);
  });

  it("switches the Overpass source on and off", () => {
    const m = useMatchMode();
    m.setUseOverpass(true);
    expect(useMatchMode().useOverpass.value).toBe(true);
    m.setUseOverpass(false);
    expect(m.useOverpass.value).toBe(false);
  });
});
