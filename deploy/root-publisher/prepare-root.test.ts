import { describe, expect, it, vi } from "vitest";

import {
  buildLedgerRoot,
  toDispatchEnvelope,
  type LedgerRootDispatchEnvelope,
} from "@/modules/ledger/root-chain";

import type { GitRef } from "./archive";
import { GitHubArchiveError } from "./github-archive-client";
import {
  parsePrepareRootArguments,
  prepareLedgerRoot,
  type LedgerRootReadClient,
} from "./prepare-root";

function envelope(
  batchKey: string,
  previousRootHash: string | null,
): LedgerRootDispatchEnvelope {
  return toDispatchEnvelope(
    buildLedgerRoot({
      batchKey,
      closedAt: "2026-01-01T21:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash,
      commitments: [
        { forecastId: `${batchKey}-forecast`, contentHash: "a".repeat(64) },
      ],
    }),
    "abcdef0",
  );
}

function archived(
  value: LedgerRootDispatchEnvelope,
  verifiedAt = "2026-01-01T22:00:00.000Z",
): string {
  return `${JSON.stringify({ ...value, verifiedAt }, null, 2)}\n`;
}

function client(
  overrides: Partial<LedgerRootReadClient> = {},
): LedgerRootReadClient {
  return {
    getRef: vi.fn().mockResolvedValue(null),
    getFile: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function advancingTime(start: string) {
  let milliseconds = Date.parse(start);
  return {
    now: () => new Date(milliseconds),
    sleep: async (delay: number) => {
      milliseconds += delay;
    },
  };
}

describe("prospective root preparation", () => {
  it("prepares genesis only while the durable branch is absent", async () => {
    const genesis = envelope("batch-1", null);
    await expect(
      prepareLedgerRoot(genesis, client(), {
        now: () => new Date("2026-01-01T22:00:00.000Z"),
      }),
    ).resolves.toBe(archived(genesis));

    await expect(
      prepareLedgerRoot(
        genesis,
        client({
          getRef: vi
            .fn()
            .mockResolvedValue({ sha: "current" } satisfies GitRef),
        }),
        { now: () => new Date("2026-01-01T22:00:00.000Z") },
      ),
    ).rejects.toThrow(/genesis root is stale/i);
  });

  it("polls until the incoming predecessor becomes the durable head", async () => {
    const prior = envelope("batch-1", null);
    const predecessor = envelope("batch-2", prior.rootHash);
    const next = envelope("batch-3", predecessor.rootHash);
    const getRef = vi
      .fn()
      .mockResolvedValueOnce({ sha: "prior-commit" } satisfies GitRef)
      .mockResolvedValue({ sha: "predecessor-commit" } satisfies GitRef);
    const getFile = vi.fn(async (path: string, ref: string) => {
      if (path === "head.json" && ref === "prior-commit") {
        return archived(prior);
      }
      if (path === "head.json" && ref === "predecessor-commit") {
        return archived(predecessor);
      }
      return null;
    });
    const time = advancingTime("2026-01-01T22:00:00.000Z");

    const result = await prepareLedgerRoot(next, client({ getRef, getFile }), {
      ...time,
      timeoutMs: 20,
      pollIntervalMs: 5,
    });

    expect(JSON.parse(result)).toMatchObject({
      rootHash: next.rootHash,
      previousRootHash: predecessor.rootHash,
      verifiedAt: "2026-01-01T22:00:00.005Z",
    });
    expect(getRef).toHaveBeenCalledTimes(2);
  });

  it("returns exact durable bytes for an archived replay after head advances", async () => {
    const prior = envelope("batch-1", null);
    const replay = envelope("batch-2", prior.rootHash);
    const later = envelope("batch-3", replay.rootHash);
    const durableBytes = JSON.stringify(
      { ...replay, verifiedAt: "2026-01-01T22:00:01.000Z" },
      null,
      4,
    );
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValue({ sha: "later-commit" } satisfies GitRef),
      getFile: vi.fn(async (path: string) => {
        if (path === `roots/${replay.rootHash}.json`) return durableBytes;
        if (path === "head.json") return archived(later);
        return null;
      }),
    });

    await expect(
      prepareLedgerRoot(replay, git, {
        allowExpiredForArchive: true,
        now: () => new Date("2026-01-03T22:00:02.000Z"),
      }),
    ).resolves.toBe(durableBytes);
  });

  it("rejects an unarchived root whose predecessor is no longer head", async () => {
    const prior = envelope("batch-1", null);
    const skipped = envelope("batch-2", prior.rootHash);
    const current = envelope("batch-3", skipped.rootHash);
    const incoming = envelope("competing-batch", skipped.rootHash);
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValue({ sha: "current-commit" } satisfies GitRef),
      getFile: vi.fn(async (path: string) => {
        if (path === "head.json") return archived(current);
        if (path === `roots/${skipped.rootHash}.json`) return archived(skipped);
        return null;
      }),
    });

    await expect(
      prepareLedgerRoot(incoming, git, {
        now: () => new Date("2026-01-01T22:00:02.000Z"),
      }),
    ).rejects.toThrow(/stale or forks durable history/i);
  });

  it("fails loudly when the predecessor does not arrive before the bound", async () => {
    const missingPredecessor = "b".repeat(64);
    const incoming = envelope("batch-2", missingPredecessor);
    const time = advancingTime("2026-01-01T22:00:00.000Z");

    await expect(
      prepareLedgerRoot(incoming, client(), {
        ...time,
        timeoutMs: 10,
        pollIntervalMs: 5,
      }),
    ).rejects.toThrow(
      /timed out after 10ms waiting for durable predecessor.*branch is not published/i,
    );
  });

  it("retries transient GitHub reads within the same bounded wait", async () => {
    const genesis = envelope("batch-1", null);
    const getRef = vi
      .fn()
      .mockRejectedValueOnce(
        new GitHubArchiveError("GitHub unavailable", "github_retryable", true),
      )
      .mockResolvedValue(null);
    const time = advancingTime("2026-01-01T22:00:00.000Z");

    await expect(
      prepareLedgerRoot(genesis, client({ getRef }), {
        ...time,
        timeoutMs: 10,
        pollIntervalMs: 5,
      }),
    ).resolves.toContain(`"rootHash": "${genesis.rootHash}"`);
    expect(getRef).toHaveBeenCalledTimes(2);
  });

  it("parses bounded-wait CLI arguments strictly", () => {
    expect(
      parsePrepareRootArguments([
        "dispatch.json",
        "--allow-expired-for-archive",
        "--timeout-ms",
        "120000",
        "--poll-interval-ms",
        "2000",
      ]),
    ).toEqual({
      payloadPath: "dispatch.json",
      allowExpiredForArchive: true,
      timeoutMs: 120000,
      pollIntervalMs: 2000,
    });
    expect(() =>
      parsePrepareRootArguments(["dispatch.json", "--timeout-ms", "0"]),
    ).toThrow(/positive integer/i);
  });
});
