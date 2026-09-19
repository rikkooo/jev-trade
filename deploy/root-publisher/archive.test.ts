import { describe, expect, it, vi } from "vitest";

import {
  buildLedgerRoot,
  toDispatchEnvelope,
  type LedgerRootDispatchEnvelope,
} from "@/modules/ledger/root-chain";

import {
  archiveLedgerRoot,
  type GitDataArchiveClient,
  type GitRef,
} from "./archive";

function document(
  batchKey: string,
  previousRootHash: string | null,
): LedgerRootDispatchEnvelope & { readonly verifiedAt: string } {
  const root = buildLedgerRoot({
    batchKey,
    closedAt: "2026-01-01T21:00:00.000Z",
    attestationDeadline: "2026-01-02T13:30:00.000Z",
    previousRootHash,
    commitments: [
      { forecastId: `${batchKey}-forecast`, contentHash: "a".repeat(64) },
    ],
  });
  return {
    ...toDispatchEnvelope(root, "abcdef0"),
    verifiedAt: "2026-01-01T22:00:00.000Z",
  };
}

function client(overrides: Partial<GitDataArchiveClient> = {}) {
  const base: GitDataArchiveClient = {
    getRef: vi.fn().mockResolvedValue(null),
    getFile: vi.fn().mockResolvedValue(null),
    createBlob: vi.fn().mockResolvedValue("blob-sha"),
    getCommitTree: vi.fn().mockResolvedValue("base-tree-sha"),
    createTree: vi.fn().mockResolvedValue("tree-sha"),
    createCommit: vi.fn().mockResolvedValue("commit-sha"),
    createRef: vi.fn().mockResolvedValue(undefined),
    updateRef: vi.fn().mockResolvedValue(undefined),
  };
  return { ...base, ...overrides };
}

describe("durable ledger-root archive", () => {
  it("creates a fresh orphan branch only for a chain genesis root", async () => {
    const root = document("batch-1", null);
    const git = client();

    await expect(archiveLedgerRoot(root, git)).resolves.toMatchObject({
      status: "archived",
      commitSha: "commit-sha",
    });
    expect(git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: [] }),
    );
    expect(git.createRef).toHaveBeenCalledWith(
      "refs/heads/ledger-roots",
      "commit-sha",
    );
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it("appends a linked root with a non-force fast-forward", async () => {
    const prior = document("batch-1", null);
    const next = document("batch-2", prior.rootHash);
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValue({ sha: "head-commit" } satisfies GitRef),
      getFile: vi.fn(async (path) =>
        path === "head.json" ? `${JSON.stringify(prior)}\n` : null,
      ),
    });

    await expect(archiveLedgerRoot(next, git)).resolves.toMatchObject({
      status: "archived",
      commitSha: "commit-sha",
    });
    expect(git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({ baseTreeSha: "base-tree-sha" }),
    );
    expect(git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: ["head-commit"] }),
    );
    expect(git.updateRef).toHaveBeenCalledWith(
      "heads/ledger-roots",
      "commit-sha",
      false,
    );
  });

  it("treats an exact existing archive as an idempotent replay", async () => {
    const prior = document("batch-1", null);
    const replay = { ...prior, verifiedAt: "2026-01-01T23:00:00.000Z" };
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValue({ sha: "head-commit" } satisfies GitRef),
      getFile: vi.fn(async (path) =>
        path === "head.json" || path === `roots/${prior.rootHash}.json`
          ? `${JSON.stringify(prior)}\n`
          : null,
      ),
    });

    await expect(archiveLedgerRoot(replay, git)).resolves.toEqual({
      status: "already_archived",
      rootHash: prior.rootHash,
      commitSha: "head-commit",
    });
    expect(git.createBlob).not.toHaveBeenCalled();
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it("accepts an exact genesis archived by a concurrent writer", async () => {
    const root = document("batch-1", null);
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ sha: "competing-head" } satisfies GitRef),
      getFile: vi.fn(async (path, ref) =>
        path === `roots/${root.rootHash}.json` && ref === "competing-head"
          ? `${JSON.stringify(root)}\n`
          : null,
      ),
      createRef: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("conflict"), { status: 422 }),
        ),
    });

    await expect(archiveLedgerRoot(root, git)).resolves.toEqual({
      status: "already_archived",
      rootHash: root.rootHash,
      commitSha: "competing-head",
    });
  });

  it("accepts an exact append archived by a concurrent writer", async () => {
    const prior = document("batch-1", null);
    const next = document("batch-2", prior.rootHash);
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValueOnce({ sha: "head-commit" } satisfies GitRef)
        .mockResolvedValueOnce({ sha: "competing-head" } satisfies GitRef),
      getFile: vi.fn(async (path, ref) => {
        if (path === "head.json" && ref === "head-commit") {
          return `${JSON.stringify(prior)}\n`;
        }
        if (
          path === `roots/${next.rootHash}.json` &&
          ref === "competing-head"
        ) {
          return `${JSON.stringify(next)}\n`;
        }
        return null;
      }),
      updateRef: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("conflict"), { status: 409 }),
        ),
    });

    await expect(archiveLedgerRoot(next, git)).resolves.toEqual({
      status: "already_archived",
      rootHash: next.rootHash,
      commitSha: "competing-head",
    });
  });

  it("rejects a malformed durable head before writing", async () => {
    const git = client({
      getRef: vi
        .fn()
        .mockResolvedValue({ sha: "head-commit" } satisfies GitRef),
      getFile: vi.fn(async (path) =>
        path === "head.json" ? "not json" : null,
      ),
    });

    await expect(
      archiveLedgerRoot(document("batch-2", null), git),
    ).rejects.toThrow(/head\.json.*valid json/i);
    expect(git.createBlob).not.toHaveBeenCalled();
  });

  it("fails continuity if the branch changes during append", async () => {
    const prior = document("batch-1", null);
    const next = document("batch-2", prior.rootHash);
    const getRef = vi
      .fn()
      .mockResolvedValueOnce({ sha: "head-commit" } satisfies GitRef)
      .mockResolvedValueOnce({ sha: "changed-head" } satisfies GitRef);
    const git = client({
      getRef,
      getFile: vi.fn(async (path, ref) => {
        if (path === "head.json") return `${JSON.stringify(prior)}\n`;
        if (path === `roots/${next.rootHash}.json` && ref === "changed-head") {
          return null;
        }
        return null;
      }),
      updateRef: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("conflict"), { status: 422 }),
        ),
    });

    await expect(archiveLedgerRoot(next, git)).rejects.toThrow(
      /changed before append/i,
    );
    expect(git.updateRef).toHaveBeenCalledWith(
      "heads/ledger-roots",
      "commit-sha",
      false,
    );
  });
});
