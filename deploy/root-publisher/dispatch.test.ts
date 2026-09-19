import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildLedgerRoot,
  toDispatchEnvelope,
} from "@/modules/ledger/root-chain";

import {
  assertBeforeAttestationDeadline,
  validateDispatchEnvelope,
  verifyAndSerializeDispatchArtifact,
} from "./dispatch";

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

  it("allows an expired original root to be archived but not attested", () => {
    const envelope = toDispatchEnvelope(root, "abcdef0");
    expect(
      validateDispatchEnvelope(envelope, {
        previousPublishedRootHash: null,
        observedAt: "2026-01-03T00:00:00.000Z",
        allowExpiredForArchive: true,
      }),
    ).toEqual(envelope);
  });

  it("accepts an exact archived replay even after the chain head advances", () => {
    const envelope = toDispatchEnvelope(root, "abcdef0");
    expect(
      validateDispatchEnvelope(envelope, {
        previousPublishedRootHash: "b".repeat(64),
        observedAt: "2026-01-01T22:00:00.000Z",
        existingPublishedRoot: {
          ...envelope,
          verifiedAt: "2026-01-01T22:00:01.000Z",
        },
      }),
    ).toEqual(envelope);
  });

  it("replays validated archived roots with their durable bytes unchanged", () => {
    const envelope = toDispatchEnvelope(root, "abcdef0");
    const durableBytes = JSON.stringify(
      { ...envelope, verifiedAt: "2026-01-01T22:00:01.000Z" },
      null,
      4,
    );
    const output = verifyAndSerializeDispatchArtifact(envelope, {
      previousPublishedRootHash: "b".repeat(64),
      observedAt: "2026-01-01T22:00:02.000Z",
      existingPublishedRootBytes: durableBytes,
    });

    expect(output).toBe(durableBytes);
    expect(createHash("sha256").update(output).digest("hex")).toBe(
      createHash("sha256").update(durableBytes).digest("hex"),
    );
  });

  it("rejects a same-hash replay whose immutable dispatch fields changed", () => {
    const envelope = toDispatchEnvelope(root, "abcdef0");
    expect(() =>
      validateDispatchEnvelope(envelope, {
        previousPublishedRootHash: "b".repeat(64),
        observedAt: "2026-01-01T22:00:00.000Z",
        existingPublishedRoot: {
          ...envelope,
          batchKey: "rewritten-batch",
          verifiedAt: "2026-01-01T22:00:01.000Z",
        },
      }),
    ).toThrow(/archived replay/i);
  });

  it("rejects a changed replay even when its predecessor is still current", () => {
    const envelope = toDispatchEnvelope(root, "abcdef0");
    expect(() =>
      verifyAndSerializeDispatchArtifact(
        { ...envelope, batchKey: "rewritten-batch" },
        {
          previousPublishedRootHash: null,
          observedAt: "2026-01-01T22:00:00.000Z",
          existingPublishedRootBytes: JSON.stringify({
            ...envelope,
            verifiedAt: "2026-01-01T22:00:01.000Z",
          }),
        },
      ),
    ).toThrow(/archived replay/i);
  });

  it("requires positive time remaining immediately before attestation", () => {
    const archived = {
      ...toDispatchEnvelope(root, "abcdef0"),
      verifiedAt: "2026-01-01T22:00:00.000Z",
    };
    expect(
      assertBeforeAttestationDeadline(archived, "2026-01-02T13:29:59.900Z"),
    ).toBe(100);
    expect(() =>
      assertBeforeAttestationDeadline(archived, "2026-01-02T13:30:00.000Z"),
    ).toThrow(/deadline has been reached/i);
  });
});
