import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GitHubArchiveClient,
  GitHubArchiveError,
} from "./github-archive-client";

const TOKEN = "github-secret-token";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubArchiveClient", () => {
  afterEach(() => vi.useRealTimers());

  it("validates repository, token, and timeout options", () => {
    expect(
      () => new GitHubArchiveClient({ repository: "invalid", token: TOKEN }),
    ).toThrow(/valid GitHub repository/i);
    expect(
      () => new GitHubArchiveClient({ repository: "owner/repo", token: "" }),
    ).toThrow(/token/i);
    expect(
      () =>
        new GitHubArchiveClient({
          repository: "owner/repo",
          token: TOKEN,
          requestTimeoutMs: 0,
        }),
    ).toThrow(/timeout/i);
  });

  it("handles absent refs and decodes escaped content paths", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        json({
          type: "file",
          encoding: "base64",
          content: Buffer.from("archived root\n").toString("base64"),
        }),
      );
    const client = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation,
    });

    await expect(client.getRef("heads/ledger-roots")).resolves.toBeNull();
    await expect(
      client.getFile("roots/a root.json", "head/name"),
    ).resolves.toBe("archived root\n");
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/repos/owner/repo/contents/roots/a%20root.json?ref=head%2Fname",
    );
  });

  it("sends the complete Git data contract with the token only in headers", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(json({ object: { sha: "ref-sha" } }))
      .mockResolvedValueOnce(json({ sha: "blob-sha" }))
      .mockResolvedValueOnce(json({ tree: { sha: "base-tree-sha" } }))
      .mockResolvedValueOnce(json({ sha: "tree-sha" }))
      .mockResolvedValueOnce(json({ sha: "commit-sha" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation,
    });
    const entry = {
      path: "head.json",
      mode: "100644" as const,
      type: "blob" as const,
      sha: "blob-sha",
    };

    await expect(client.getRef("heads/ledger-roots")).resolves.toEqual({
      sha: "ref-sha",
    });
    await expect(client.createBlob("root body")).resolves.toBe("blob-sha");
    await expect(client.getCommitTree("parent-sha")).resolves.toBe(
      "base-tree-sha",
    );
    await expect(
      client.createTree({ baseTreeSha: "base-tree-sha", entries: [entry] }),
    ).resolves.toBe("tree-sha");
    await expect(
      client.createCommit({
        message: "ledger root batch-1",
        treeSha: "tree-sha",
        parents: ["parent-sha"],
      }),
    ).resolves.toBe("commit-sha");
    await expect(
      client.createRef("refs/heads/ledger-roots", "commit-sha"),
    ).resolves.toBeUndefined();
    await expect(
      client.updateRef("heads/ledger-roots", "commit-sha", false),
    ).resolves.toBeUndefined();

    const requests = fetchImplementation.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method ?? "GET",
      body:
        init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      authorization: new Headers(init?.headers).get("authorization"),
    }));
    expect(requests).toMatchObject([
      { url: expect.stringContaining("/git/ref/heads/ledger-roots") },
      {
        url: expect.stringContaining("/git/blobs"),
        method: "POST",
        body: { content: "root body", encoding: "utf-8" },
      },
      { url: expect.stringContaining("/git/commits/parent-sha") },
      {
        url: expect.stringContaining("/git/trees"),
        method: "POST",
        body: { base_tree: "base-tree-sha", tree: [entry] },
      },
      {
        url: expect.stringContaining("/git/commits"),
        method: "POST",
        body: {
          message: "ledger root batch-1",
          tree: "tree-sha",
          parents: ["parent-sha"],
        },
      },
      {
        url: expect.stringContaining("/git/refs"),
        method: "POST",
        body: { ref: "refs/heads/ledger-roots", sha: "commit-sha" },
      },
      {
        url: expect.stringContaining("/git/refs/heads/ledger-roots"),
        method: "PATCH",
        body: { sha: "commit-sha", force: false },
      },
    ]);
    for (const request of requests) {
      expect(request.authorization).toBe(`Bearer ${TOKEN}`);
      expect(request.url).not.toContain(TOKEN);
      expect(JSON.stringify(request.body) ?? "").not.toContain(TOKEN);
    }
  });

  it("rejects malformed and non-OK responses with classified errors", async () => {
    const malformed = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation: vi.fn().mockResolvedValue(json({ object: {} })),
    });
    await expect(malformed.getRef("heads/ledger-roots")).rejects.toThrow(
      /has no sha/i,
    );

    for (const [status, code, retryable] of [
      [422, "github_rejected", false],
      [503, "github_retryable", true],
    ] as const) {
      const client = new GitHubArchiveClient({
        repository: "owner/repo",
        token: TOKEN,
        fetchImplementation: vi
          .fn()
          .mockResolvedValue(new Response(null, { status })),
      });
      await expect(client.createBlob("root")).rejects.toEqual(
        expect.objectContaining<Partial<GitHubArchiveError>>({
          code,
          retryable,
          status,
        }),
      );
    }

    const invalidJson = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation: vi.fn().mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });
    await expect(
      invalidJson.getRef("heads/ledger-roots"),
    ).rejects.toMatchObject({
      code: "github_rejected",
      retryable: false,
      status: 200,
    });
  });

  it("classifies transport failures without exposing the token", async () => {
    const client = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation: vi.fn().mockRejectedValue(new TypeError("offline")),
    });

    const error = await client
      .getRef("heads/ledger-roots")
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "network_error", retryable: true });
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it("aborts a request that never settles within its own budget", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const client = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation,
      requestTimeoutMs: 250,
    });
    const pending = client.getRef("heads/ledger-roots");
    const rejected = expect(pending).rejects.toMatchObject({
      code: "request_timeout",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
  });

  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener("abort", () => {
                  controller.error(init.signal?.reason);
                });
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );
    const client = new GitHubArchiveClient({
      repository: "owner/repo",
      token: TOKEN,
      fetchImplementation,
      requestTimeoutMs: 250,
    });
    const pending = client.getRef("heads/ledger-roots");
    const rejected = expect(pending).rejects.toMatchObject({
      code: "request_timeout",
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(250);
    await rejected;
  });
});
