import { describe, expect, it } from "vitest";

import {
  buildLedgerRoot,
  toDispatchEnvelope,
} from "@/modules/ledger/root-chain";

import { validateDispatchEnvelope } from "./dispatch";

const root = buildLedgerRoot({
  batchKey: "batch-1",
  closedAt: "2026-01-01T21:00:00.000Z",
  attestationDeadline: "2026-01-02T13:30:00.000Z",
  previousRootHash: null,
  commitments: [{ forecastId: "f1", contentHash: "a".repeat(64) }],
});

describe("attestation dispatch verification", () => {
  it("accepts an on-time durable prospective root at the published chain head", () => {
    expect(
      validateDispatchEnvelope(toDispatchEnvelope(root, "abcdef0"), {
        previousPublishedRootHash: null,
        observedAt: "2026-01-01T22:00:00.000Z",
      }),
    ).toMatchObject({ batchKey: "batch-1", prospective: true });
  });

  it("rejects expired roots and mismatched published continuity", () => {
    const envelope = toDispatchEnvelope(root, "abcdef0");
    expect(() =>
      validateDispatchEnvelope(envelope, {
        previousPublishedRootHash: "b".repeat(64),
        observedAt: "2026-01-01T22:00:00.000Z",
      }),
    ).toThrow(/published chain head/i);
    expect(() =>
      validateDispatchEnvelope(envelope, {
        previousPublishedRootHash: null,
        observedAt: "2026-01-03T00:00:00.000Z",
      }),
    ).toThrow(/deadline/i);
  });
});
