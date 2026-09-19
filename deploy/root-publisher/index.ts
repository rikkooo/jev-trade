import {
  isTimelyAttestation,
  toDispatchEnvelope,
  type LedgerRoot,
} from "@/modules/ledger/root-chain";

import {
  dispatchEnvelopeMatchesArchive,
  parseArchivedLedgerRoot,
} from "./dispatch";

export interface RootPublisherEnvironment {
  readonly DURABLE_WRITES?: string;
  readonly ROOT_ATTESTATION_ENABLED?: string;
  readonly ROOT_ARCHIVE_ENABLED?: string;
  readonly GITHUB_REPOSITORY?: string;
  readonly GITHUB_ROOT_DISPATCH_TOKEN?: string;
  readonly DEPLOYMENT_SHA?: string;
}

export interface RootDispatchReceipt {
  readonly accepted: true;
  readonly batchKey: string;
  readonly rootHash: string;
  readonly repository: string;
  readonly acceptedAt: string;
  readonly externalAttestation: "pending";
}

export type RootDispatchErrorCode =
  | "deadline_exceeded"
  | "request_timeout"
  | "network_error"
  | "predecessor_not_archived"
  | "github_retryable"
  | "github_rejected";

export class RootDispatchError extends Error {
  readonly name = "RootDispatchError";

  constructor(
    message: string,
    readonly code: RootDispatchErrorCode,
    readonly retryable: boolean,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
  }
}

const MAX_DISPATCH_REQUEST_MS = 10_000;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function archiveHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readArchivedFile(
  repository: string,
  path: string,
  token: string,
  fetchImplementation: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<unknown | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetchImplementation(
    `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=ledger-roots`,
    { headers: archiveHeaders(token), signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const retryable = isRetryableStatus(response.status);
    throw new RootDispatchError(
      `durable root archive read failed with status ${response.status}`,
      retryable ? "github_retryable" : "github_rejected",
      retryable,
    );
  }
  let body: {
    readonly type?: unknown;
    readonly encoding?: unknown;
    readonly content?: unknown;
  };
  try {
    body = (await response.json()) as typeof body;
  } catch (error) {
    throw new RootDispatchError(
      "durable root archive returned invalid JSON",
      "github_rejected",
      false,
      { cause: error },
    );
  }
  if (
    body.type !== "file" ||
    body.encoding !== "base64" ||
    typeof body.content !== "string"
  ) {
    throw new RootDispatchError(
      "durable root archive returned malformed content",
      "github_rejected",
      false,
    );
  }
  try {
    return JSON.parse(
      Buffer.from(body.content, "base64").toString("utf8"),
    ) as unknown;
  } catch (error) {
    throw new RootDispatchError(
      "durable root archive contains invalid JSON",
      "github_rejected",
      false,
      { cause: error },
    );
  }
}

export async function publishLedgerRoot(
  root: LedgerRoot,
  environment: RootPublisherEnvironment,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  now: () => Date = () => new Date(),
): Promise<RootDispatchReceipt> {
  if (
    environment.DURABLE_WRITES !== "true" ||
    environment.ROOT_ATTESTATION_ENABLED !== "true" ||
    environment.ROOT_ARCHIVE_ENABLED !== "true"
  ) {
    throw new Error(
      "root publication is disabled without durable writes, attestation, and durable root archival",
    );
  }
  const repository = environment.GITHUB_REPOSITORY;
  const token = environment.GITHUB_ROOT_DISPATCH_TOKEN;
  const sourceRevision = environment.DEPLOYMENT_SHA;
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("root publication requires a valid GitHub repository");
  }
  if (!token) {
    throw new Error("root publication requires a dispatch credential");
  }
  if (!sourceRevision) {
    throw new Error("root publication requires the deployment revision");
  }
  const startedAt = now();
  const acceptedAt = startedAt.toISOString();
  const remainingMs =
    Date.parse(root.attestationDeadline) - startedAt.getTime();
  if (!isTimelyAttestation(root, acceptedAt) || remainingMs <= 0) {
    throw new RootDispatchError(
      "root publication deadline has passed",
      "deadline_exceeded",
      false,
    );
  }
  const payload = toDispatchEnvelope(root, sourceRevision);
  const controller = new AbortController();
  const timeoutMs = Math.min(MAX_DISPATCH_REQUEST_MS, remainingMs);
  const timeout = setTimeout(() => {
    controller.abort(
      new Error("root dispatch request exceeded its time budget"),
    );
  }, timeoutMs);
  let response: Response;
  try {
    const existingRoot = await readArchivedFile(
      repository,
      `roots/${root.rootHash}.json`,
      token,
      fetchImplementation,
      controller.signal,
    );
    if (existingRoot !== null) {
      let archived;
      try {
        archived = parseArchivedLedgerRoot(existingRoot);
      } catch (error) {
        throw new RootDispatchError(
          "existing durable root archive is malformed",
          "github_rejected",
          false,
          { cause: error },
        );
      }
      if (!dispatchEnvelopeMatchesArchive(payload, archived)) {
        throw new RootDispatchError(
          "existing durable root does not match this dispatch",
          "github_rejected",
          false,
        );
      }
    } else {
      const durableHeadValue = await readArchivedFile(
        repository,
        "head.json",
        token,
        fetchImplementation,
        controller.signal,
      );
      if (root.previousRootHash === null) {
        if (durableHeadValue !== null) {
          throw new RootDispatchError(
            "durable root chain already has a genesis",
            "github_rejected",
            false,
          );
        }
      } else {
        if (durableHeadValue === null) {
          throw new RootDispatchError(
            "root predecessor is not yet archived",
            "predecessor_not_archived",
            true,
          );
        }
        let durableHead;
        try {
          durableHead = parseArchivedLedgerRoot(durableHeadValue);
        } catch (error) {
          throw new RootDispatchError(
            "durable root head is malformed",
            "github_rejected",
            false,
            { cause: error },
          );
        }
        if (durableHead.rootHash !== root.previousRootHash) {
          const predecessor = await readArchivedFile(
            repository,
            `roots/${root.previousRootHash}.json`,
            token,
            fetchImplementation,
            controller.signal,
          );
          if (predecessor !== null) {
            throw new RootDispatchError(
              "durable root chain advanced past this predecessor",
              "github_rejected",
              false,
            );
          }
          throw new RootDispatchError(
            "root predecessor is not yet archived",
            "predecessor_not_archived",
            true,
          );
        }
      }
    }
    response = await fetchImplementation(
      `https://api.github.com/repos/${repository}/dispatches`,
      {
        method: "POST",
        headers: {
          ...archiveHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "ledger-root",
          client_payload: payload,
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof RootDispatchError) throw error;
    if (controller.signal.aborted) {
      throw new RootDispatchError(
        "root dispatch request timed out",
        "request_timeout",
        true,
        { cause: error },
      );
    }
    throw new RootDispatchError(
      "root dispatch failed before GitHub accepted the request",
      "network_error",
      true,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
  if (response.status !== 204) {
    const retryable = isRetryableStatus(response.status);
    throw new RootDispatchError(
      `root dispatch failed with status ${response.status}`,
      retryable ? "github_retryable" : "github_rejected",
      retryable,
    );
  }
  return {
    accepted: true,
    batchKey: root.batchKey,
    rootHash: root.rootHash,
    repository,
    acceptedAt,
    externalAttestation: "pending",
  };
}
