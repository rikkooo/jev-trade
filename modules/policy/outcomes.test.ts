import { describe, expect, it } from "vitest";

import { resolveDirectionOutcome } from "./outcomes";

describe("fixed-horizon outcome labels", () => {
  it("implements AE4 with inclusive flat boundaries", () => {
    expect(resolveDirectionOutcome(0.005, "sprint", 1)).toBe("flat");
    expect(resolveDirectionOutcome(0.005000_001, "sprint", 1)).toBe("up");
    expect(resolveDirectionOutcome(-0.005, "sprint", 1)).toBe("flat");
    expect(resolveDirectionOutcome(-0.005000_001, "sprint", 1)).toBe("down");
  });

  it.each([
    ["position", 20, 0.02],
    ["sprint", 1, 0.005],
    ["sprint", 5, 0.015],
  ] as const)("uses the %s/%i flat band", (mode, horizon, band) => {
    expect(resolveDirectionOutcome(band, mode, horizon)).toBe("flat");
    expect(resolveDirectionOutcome(-band, mode, horizon)).toBe("flat");
  });

  it("rejects undeclared mode/horizon pairs", () => {
    expect(() => resolveDirectionOutcome(0.01, "position", 5)).toThrow(
      "unsupported outcome contract",
    );
  });
});
