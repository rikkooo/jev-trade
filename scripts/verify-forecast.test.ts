import { describe, expect, it } from "vitest";

import { parseForecastId, verifyFixtureForecast } from "./verify-forecast";

describe("fixture forecast verification command", () => {
  it("reconstructs hashes, score, policy trace, and root membership", () => {
    const result = verifyFixtureForecast("01K4MESA1SPRINTRES00001");

    expect(result).toMatchObject({
      valid: true,
      dataClass: "synthetic_fixture",
      prospectiveScorecardEligible: false,
      externalAttestation: "absent_fixture_manual_proof_only",
      outcome: {
        status: "resolved",
        activeLabel: "flat",
        excludedFromPublicScorecard: true,
      },
      rootMembership: { membershipValid: true, proofValid: true },
    });
    expect(result.outcome.brierScore).toBeCloseTo(
      (0.25 ** 2 + 0.47 ** 2 + 0.22 ** 2) / 3,
      12,
    );
  });

  it("fails closed for an unknown forecast ID", () => {
    expect(() => verifyFixtureForecast("unknown")).toThrow(/unknown/i);
  });

  it("parses the documented --id form and positional shorthand", () => {
    expect(parseForecastId(["--id", "forecast-1"])).toBe("forecast-1");
    expect(parseForecastId(["--", "--id", "forecast-1"])).toBe("forecast-1");
    expect(parseForecastId(["--id=forecast-1"])).toBe("forecast-1");
    expect(parseForecastId(["forecast-1"])).toBe("forecast-1");
    expect(() => parseForecastId(["--id"])).toThrow(/usage/i);
  });
});
