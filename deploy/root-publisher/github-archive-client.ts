import type { GitDataArchiveClient, GitRef, GitTreeEntry } from "./archive";

interface GitHubArchiveClientOptions {
  readonly repository: string;
  readonly token: string;
  readonly fetchImplementation?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
}

export type GitHubArchiveErrorCode =
  "request_timeout" | "network_error" | "github_retryable" | "github_rejected";

export class GitHubArchiveError extends Error {
  readonly name = "GitHubArchiveError";

  constructor(
    message: string,
    readonly code: GitHubArchiveErrorCode,
    readonly retryable: boolean,
    readonly status?: number,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const result = value[key];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`${label} response has no ${key}`);
  }
  return result;
}

export class GitHubArchiveClient implements GitDataArchiveClient {
  private readonly apiBase: string;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: GitHubArchiveClientOptions) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) {
      throw new Error("archive requires a valid GitHub repository");
    }
    if (!options.token) throw new Error("archive requires a GitHub token");
    const requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
      throw new Error("archive request timeout must be a positive integer");
    }
    this.apiBase = `https://api.github.com/repos/${options.repository}`;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  private async request(
    path: string,
    init: RequestInit = {},
    allowNotFound = false,
  ): Promise<unknown | null> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () =>
        timeoutController.abort(new Error("GitHub archive request timed out")),
      this.requestTimeoutMs,
    );
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;
    try {
      const response = await this.fetchImplementation(
        `${this.apiBase}${path}`,
        {
          ...init,
          signal,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${this.options.token}`,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...init.headers,
          },
        },
      );
      if (allowNotFound && response.status === 404) return null;
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        throw new GitHubArchiveError(
          `GitHub archive request failed with status ${response.status}`,
          retryable ? "github_retryable" : "github_rejected",
          retryable,
          response.status,
        );
      }
      if (response.status === 204) return null;
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        if (timeoutController.signal.aborted) throw error;
        throw new GitHubArchiveError(
          "GitHub archive response is not valid JSON",
          "github_rejected",
          false,
          response.status,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof GitHubArchiveError) throw error;
      if (timeoutController.signal.aborted) {
        throw new GitHubArchiveError(
          "GitHub archive request timed out",
          "request_timeout",
          true,
          undefined,
          { cause: error },
        );
      }
      throw new GitHubArchiveError(
        "GitHub archive request failed before a response",
        "network_error",
        true,
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async getRef(ref: string): Promise<GitRef | null> {
    const response = await this.request(`/git/ref/${ref}`, {}, true);
    if (response === null) return null;
    if (!isRecord(response) || !isRecord(response.object)) {
      throw new Error("GitHub ref response is malformed");
    }
    return { sha: requireString(response.object, "sha", "GitHub ref") };
  }

  async getFile(path: string, ref: string): Promise<string | null> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.request(
      `/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      {},
      true,
    );
    if (response === null) return null;
    if (
      !isRecord(response) ||
      response.type !== "file" ||
      typeof response.content !== "string" ||
      response.encoding !== "base64"
    ) {
      throw new Error(`GitHub content response for ${path} is not a file`);
    }
    return Buffer.from(response.content, "base64").toString("utf8");
  }

  async createBlob(content: string): Promise<string> {
    const response = await this.request("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    if (!isRecord(response))
      throw new Error("GitHub blob response is malformed");
    return requireString(response, "sha", "GitHub blob");
  }

  async getCommitTree(commitSha: string): Promise<string> {
    const response = await this.request(`/git/commits/${commitSha}`);
    if (!isRecord(response) || !isRecord(response.tree)) {
      throw new Error("GitHub commit response is malformed");
    }
    return requireString(response.tree, "sha", "GitHub commit tree");
  }

  async createTree(input: {
    readonly baseTreeSha?: string;
    readonly entries: readonly GitTreeEntry[];
  }): Promise<string> {
    const response = await this.request("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        ...(input.baseTreeSha ? { base_tree: input.baseTreeSha } : {}),
        tree: input.entries,
      }),
    });
    if (!isRecord(response))
      throw new Error("GitHub tree response is malformed");
    return requireString(response, "sha", "GitHub tree");
  }

  async createCommit(input: {
    readonly message: string;
    readonly treeSha: string;
    readonly parents: readonly string[];
  }): Promise<string> {
    const response = await this.request("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: input.message,
        tree: input.treeSha,
        parents: input.parents,
      }),
    });
    if (!isRecord(response)) {
      throw new Error("GitHub commit creation response is malformed");
    }
    return requireString(response, "sha", "GitHub commit creation");
  }

  async createRef(ref: string, sha: string): Promise<void> {
    await this.request("/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref, sha }),
    });
  }

  async updateRef(ref: string, sha: string, force: false): Promise<void> {
    await this.request(`/git/refs/${ref}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force }),
    });
  }
}
