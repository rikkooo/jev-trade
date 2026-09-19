import { describe, expect, it, vi } from "vitest";

import { buildLedgerRoot } from "@/modules/ledger/root-chain";

import { publishLedgerRoot } from "./index";

const root = buildLedgerRoot({
  batchKey: "batch-1",
  closedAt: "2026-01-01T21:00:00.000Z",
  attestationDeadline: "2026-01-02T13:30:00.000Z",
  previousRootHash: null,
  commitments: [{ forecastId: "f1", contentHash: "a".repeat(64) }],
});

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
      .mockResolvedValue(new Response(null, { status: 204 }));
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

    expect(fetch).toHaveBeenCalledOnce();
    const [, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.stringify(request.body)).not.toContain("commitments");
    expect(JSON.stringify(request.body)).not.toContain("secret-token");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
    expect(JSON.stringify(receipt)).not.toContain("secret-token");
    expect(receipt).toMatchObject({ accepted: true, batchKey: "batch-1" });
  });
});
