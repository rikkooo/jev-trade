import { describe, expect, it, vi } from "vitest";

import {
  buildLedgerRoot,
  toDispatchEnvelope,
  type LedgerRoot,
} from "@/modules/ledger/root-chain";

import { publishLedgerRoot, RootDispatchError } from "./index";

const root = buildLedgerRoot({
  batchKey: "batch-1",
  closedAt: "2026-01-01T21:00:00.000Z",
  attestationDeadline: "2026-01-02T13:30:00.000Z",
  previousRootHash: null,
  commitments: [{ forecastId: "f1", contentHash: "a".repeat(64) }],
});

function archived(rootValue: LedgerRoot, sourceRevision = "a1b2c3d") {
  return {
    ...toDispatchEnvelope(rootValue, sourceRevision),
    verifiedAt: "2026-01-01T21:30:00.000Z",
  };
}

function archiveResponse(value: unknown): Response {
  return new Response(
    JSON.stringify({
      type: "file",
      encoding: "base64",
      content: Buffer.from(JSON.stringify(value)).toString("base64"),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("root publisher", () => {
  it("fails closed before network access without durable mode and credentials", async () => {
    const fetch = vi.fn();

    await expect(
      publishLedgerRoot(root, {}, fetch as unknown as typeof globalThis.fetch),
    ).rejects.toThrow(/disabled/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dispatches only the minimal root envelope and never returns the token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const receipt = await publishLedgerRoot(
      root,
      {
        DURABLE_WRITES: "true",
        ROOT_ATTESTATION_ENABLED: "true",
        ROOT_ARCHIVE_ENABLED: "true",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
        DEPLOYMENT_SHA: "a1b2c3d",
      },
      fetch as unknown as typeof globalThis.fetch,
      () => new Date("2026-01-01T22:00:00.000Z"),
    );

    expect(fetch).toHaveBeenCalledTimes(3);
    const [, request] = fetch.mock.calls[2] as [string, RequestInit];
    expect(JSON.stringify(request.body)).not.toContain("commitments");
    expect(JSON.stringify(request.body)).not.toContain("secret-token");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
    expect(JSON.stringify(receipt)).not.toContain("secret-token");
    expect(receipt).toMatchObject({ accepted: true, batchKey: "batch-1" });
  });

  it("dispatches a successor only after its predecessor is the durable head", async () => {
    const successor = buildLedgerRoot({
      batchKey: "batch-2",
      closedAt: "2026-01-01T22:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: root.rootHash,
      commitments: [{ forecastId: "f2", contentHash: "b".repeat(64) }],
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(archiveResponse(archived(root)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      publishLedgerRoot(
        successor,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-01T22:01:00.000Z"),
      ),
    ).resolves.toMatchObject({ rootHash: successor.rootHash });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((fetch.mock.calls[2]?.[1] as RequestInit).method).toBe("POST");
  });

  it("dispatches an exact archived replay without requiring it to remain the head", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(archiveResponse(archived(root)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      publishLedgerRoot(
        root,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-01T22:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ rootHash: root.rootHash });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls[1]?.[1] as RequestInit).method).toBe("POST");
  });

  it("rejects a same-hash archive with different immutable fields", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(archiveResponse(archived(root, "fffffff")));

    await expect(
      publishLedgerRoot(
        root,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-01T22:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "github_rejected", retryable: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps a successor retryable until its predecessor is archived", async () => {
    const predecessor = buildLedgerRoot({
      batchKey: "batch-2",
      closedAt: "2026-01-01T22:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: root.rootHash,
      commitments: [{ forecastId: "f2", contentHash: "b".repeat(64) }],
    });
    const successor = buildLedgerRoot({
      batchKey: "batch-3",
      closedAt: "2026-01-01T23:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: predecessor.rootHash,
      commitments: [{ forecastId: "f3", contentHash: "c".repeat(64) }],
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(archiveResponse(archived(root)))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      publishLedgerRoot(
        successor,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-01T23:01:00.000Z"),
      ),
    ).rejects.toMatchObject({
      code: "predecessor_not_archived",
      retryable: true,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects a fork after the durable chain advances past its predecessor", async () => {
    const predecessor = buildLedgerRoot({
      batchKey: "batch-2",
      closedAt: "2026-01-01T22:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: root.rootHash,
      commitments: [{ forecastId: "f2", contentHash: "b".repeat(64) }],
    });
    const durableHead = buildLedgerRoot({
      batchKey: "batch-3",
      closedAt: "2026-01-01T23:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: predecessor.rootHash,
      commitments: [{ forecastId: "f3", contentHash: "c".repeat(64) }],
    });
    const competing = buildLedgerRoot({
      batchKey: "batch-3-competing",
      closedAt: "2026-01-01T23:00:00.000Z",
      attestationDeadline: "2026-01-02T13:30:00.000Z",
      previousRootHash: predecessor.rootHash,
      commitments: [{ forecastId: "f4", contentHash: "d".repeat(64) }],
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(archiveResponse(archived(durableHead)))
      .mockResolvedValueOnce(archiveResponse(archived(predecessor)));

    await expect(
      publishLedgerRoot(
        competing,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-01T23:01:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "github_rejected", retryable: false });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("bounds the request timeout by the remaining attestation window", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(init.signal?.reason);
            });
          }),
      );
      const nearDeadlineRoot = buildLedgerRoot({
        ...root,
        attestationDeadline: "2026-01-02T13:30:00.000Z",
      });
      const pending = publishLedgerRoot(
        nearDeadlineRoot,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-02T13:29:59.900Z"),
      );
      const rejection = expect(pending).rejects.toMatchObject({
        code: "request_timeout",
        retryable: true,
      });

      await vi.advanceTimersByTimeAsync(99);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("classifies transport and retryable GitHub failures", async () => {
    const environment = {
      DURABLE_WRITES: "true",
      ROOT_ATTESTATION_ENABLED: "true",
      ROOT_ARCHIVE_ENABLED: "true",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
      DEPLOYMENT_SHA: "a1b2c3d",
    } as const;
    const now = () => new Date("2026-01-01T22:00:00.000Z");

    await expect(
      publishLedgerRoot(
        root,
        environment,
        vi.fn().mockRejectedValue(new TypeError("network down")),
        now,
      ),
    ).rejects.toMatchObject({ code: "network_error", retryable: true });

    await expect(
      publishLedgerRoot(
        root,
        environment,
        vi.fn().mockResolvedValue(new Response(null, { status: 429 })),
        now,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RootDispatchError>>({
        code: "github_retryable",
        retryable: true,
      }),
    );
  });

  it("rejects malformed archive API JSON as a non-retryable GitHub response", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      publishLedgerRoot(
        root,
        {
          DURABLE_WRITES: "true",
          ROOT_ATTESTATION_ENABLED: "true",
          ROOT_ARCHIVE_ENABLED: "true",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_ROOT_DISPATCH_TOKEN: "secret-token",
          DEPLOYMENT_SHA: "a1b2c3d",
        },
        fetch as unknown as typeof globalThis.fetch,
        () => new Date("2026-01-01T22:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "github_rejected", retryable: false });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
