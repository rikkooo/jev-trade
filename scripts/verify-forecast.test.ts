import { describe, expect, it } from "vitest";

import {
  buildFixtureCommitments,
  buildFixtureManualProof,
  readFixtureManifestAnchor,
  verifyFixtureManifestAnchor,
} from "./fixture-proof";
import { FIXTURE_AUDIT_FORECASTS } from "@/modules/view-model";
import { parseForecastId, verifyFixtureForecast } from "./verify-forecast";

describe("fixture forecast verification command", () => {
  it("reconstructs hashes, score, policy trace, and root membership", () => {
    const result = verifyFixtureForecast("01K4MESA1SPRINTRES00001");

    expect(result).toMatchObject({
      valid: true,
      dataClass: "synthetic_fixture",
      prospectiveScorecardEligible: false,
      externalAttestation: "absent_fixture_manual_proof_only",
      decisionStateHash: {
        reconstruction: "verified_from_synthetic_source_manifest",
      },
      sourceManifest: {
        referenceCount: 602,
        hashMatches: true,
      },
      judgmentInput: {
        reconstructionMatches: true,
      },
      policy: { reconstructionMatches: true },
      outcome: {
        status: "resolved",
        activeLabel: "flat",
        excludedFromPublicScorecard: true,
      },
      rootMembership: { membershipValid: true, proofValid: true },
    });
    expect(result.outcome.brierScore).toBeCloseTo(
      (0.24 ** 2 + 0.44 ** 2 + 0.2 ** 2) / 3,
      12,
    );
  });

  it("pins the independent public manifest to the fixture proof root", () => {
    const proof = buildFixtureManualProof();
    const anchor = readFixtureManifestAnchor();

    expect(() => verifyFixtureManifestAnchor(proof, anchor)).not.toThrow();
    expect(() =>
      verifyFixtureManifestAnchor(proof, {
        ...anchor,
        rootHash: "0".repeat(64),
      }),
    ).toThrow(/deliberately repin/i);
  });

  it("invalidates the manifest anchor when only pick eligibility changes", () => {
    const anchor = readFixtureManifestAnchor();
    const mutatedForecasts = FIXTURE_AUDIT_FORECASTS.map((forecast, index) =>
      index === 0
        ? { ...forecast, pickEligible: !forecast.pickEligible }
        : forecast,
    );
    const originalCommitments = buildFixtureCommitments();
    const mutatedCommitments = buildFixtureCommitments(mutatedForecasts);

    expect(mutatedCommitments[0]?.contentHash).not.toBe(
      originalCommitments[0]?.contentHash,
    );
    expect(() =>
      verifyFixtureManifestAnchor(
        buildFixtureManualProof(mutatedForecasts),
        anchor,
      ),
    ).toThrow(/deliberately repin/i);
  });

  it.each([
    ["01K3HELI20POSINCOMP0001", "not_applicable"],
    ["01K3KITE1SPRINTFAIL0001", "verified"],
  ] as const)(
    "verifies unavailable attempt %s without fabricating a policy record",
    (forecastId, inputStatus) => {
      const result = verifyFixtureForecast(forecastId);
      expect(result.judgmentInput.status).toBe(inputStatus);
      expect(result.policy).toMatchObject({
        action: null,
        reconstructedAction: null,
        reconstructionMatches: true,
        traceHash: null,
        orderedGateCount: 0,
      });
    },
  );

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
