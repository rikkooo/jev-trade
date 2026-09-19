import { describe, expect, it } from "vitest";

import {
  buildLedgerRoot,
  createManualFixtureProof,
  verifyLedgerChain,
  verifyManualFixtureProof,
} from "./index";

const commitments = [
  { forecastId: "01A", contentHash: "a".repeat(64) },
  { forecastId: "01B", contentHash: "b".repeat(64) },
] as const;

describe("publication-batch root chain", () => {
  it("is independent of input order and links every batch to its predecessor", () => {
    const first = buildLedgerRoot({
      batchKey: "2026-09-18-eod",
      closedAt: "2026-09-18T21:00:00.000Z",
      attestationDeadline: "2026-09-21T13:30:00.000Z",
      previousRootHash: null,
      commitments: [...commitments].reverse(),
    });
    const same = buildLedgerRoot({
      batchKey: "2026-09-18-eod",
      closedAt: "2026-09-18T21:00:00.000Z",
      attestationDeadline: "2026-09-21T13:30:00.000Z",
      previousRootHash: null,
      commitments,
    });
    const second = buildLedgerRoot({
      batchKey: "2026-09-21-eod",
      closedAt: "2026-09-21T21:00:00.000Z",
      attestationDeadline: "2026-09-22T13:30:00.000Z",
      previousRootHash: first.rootHash,
      commitments: [{ forecastId: "01C", contentHash: "c".repeat(64) }],
    });

    expect(first).toEqual(same);
    expect(verifyLedgerChain([first, second])).toEqual({
      valid: true,
      batchCount: 2,
      forecastCount: 3,
      headRootHash: second.rootHash,
    });
  });

  it("detects a rewritten commitment and broken previous-root continuity", () => {
    const first = buildLedgerRoot({
      batchKey: "batch-1",
      closedAt: "2026-01-01T21:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: null,
      commitments,
    });
    const rewritten = {
      ...first,
      commitments: [
        ...first.commitments.slice(0, 1),
        { forecastId: "01B", contentHash: "f".repeat(64) },
      ],
    };

    expect(() => verifyLedgerChain([rewritten])).toThrow(/root hash mismatch/i);
    expect(() =>
      verifyLedgerChain([{ ...first, previousRootHash: "0".repeat(64) }]),
    ).toThrow(/first root/i);
  });

  it("creates an explicitly non-prospective reproducible manual proof", () => {
    const root = buildLedgerRoot({
      batchKey: "fixture-v1",
      closedAt: "2026-09-19T10:00:00.000Z",
      attestationDeadline: "2026-09-19T10:00:00.000Z",
      previousRootHash: null,
      commitments,
    });
    const proof = createManualFixtureProof([root], "2026-09-19T10:01:00.000Z");

    expect(proof.evidenceClass).toBe("fixture_manual_only");
    expect(proof.prospectiveScorecardEligible).toBe(false);
    expect(verifyManualFixtureProof(proof).valid).toBe(true);
  });
});
