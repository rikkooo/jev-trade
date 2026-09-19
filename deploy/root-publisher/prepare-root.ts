import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import type { GitRef } from "./archive";
import {
  parseArchivedLedgerRoot,
  parseDispatchEnvelope,
  verifyAndSerializeDispatchArtifact,
  type ArchivedLedgerRoot,
} from "./dispatch";
import {
  GitHubArchiveClient,
  GitHubArchiveError,
} from "./github-archive-client";

const BRANCH_REF = "heads/ledger-roots";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

export interface LedgerRootReadClient {
  getRef(ref: string): Promise<GitRef | null>;
  getFile(path: string, ref: string): Promise<string | null>;
}

export interface PrepareLedgerRootOptions {
  readonly allowExpiredForArchive?: boolean;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function readArchivedDocument(
  content: string,
  label: string,
): ArchivedLedgerRoot {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  try {
    return parseArchivedLedgerRoot(value);
  } catch (error) {
    throw new Error(`${label} is malformed`, { cause: error });
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type InspectionResult =
  | { readonly status: "prepared"; readonly content: string }
  | { readonly status: "waiting"; readonly reason: string };

async function inspectDurableChain(
  value: unknown,
  client: LedgerRootReadClient,
  observedAt: string,
  allowExpiredForArchive: boolean,
): Promise<InspectionResult> {
  const envelope = parseDispatchEnvelope(value);
  const currentRef = await client.getRef(BRANCH_REF);

  if (!currentRef) {
    if (envelope.previousRootHash !== null) {
      return {
        status: "waiting",
        reason: "ledger-roots branch is not published yet",
      };
    }
    return {
      status: "prepared",
      content: verifyAndSerializeDispatchArtifact(envelope, {
        previousPublishedRootHash: null,
        observedAt,
        allowExpiredForArchive,
      }),
    };
  }

  const archivePath = `roots/${envelope.rootHash}.json`;
  const existingBytes = await client.getFile(archivePath, currentRef.sha);
  if (existingBytes !== null) {
    return {
      status: "prepared",
      content: verifyAndSerializeDispatchArtifact(envelope, {
        previousPublishedRootHash: envelope.previousRootHash,
        observedAt,
        allowExpiredForArchive,
        existingPublishedRootBytes: existingBytes,
      }),
    };
  }

  if (envelope.previousRootHash === null) {
    throw new Error(
      "genesis root is stale because the durable ledger-roots branch already exists",
    );
  }

  const headBytes = await client.getFile("head.json", currentRef.sha);
  if (headBytes === null) {
    throw new Error("ledger-roots/head.json is missing");
  }
  const head = readArchivedDocument(headBytes, "ledger-roots/head.json");
  if (head.rootHash === envelope.rootHash) {
    throw new Error(`${archivePath} is missing for the durable chain head`);
  }
  if (head.rootHash === envelope.previousRootHash) {
    return {
      status: "prepared",
      content: verifyAndSerializeDispatchArtifact(envelope, {
        previousPublishedRootHash: head.rootHash,
        observedAt,
        allowExpiredForArchive,
      }),
    };
  }

  const predecessorPath = `roots/${envelope.previousRootHash}.json`;
  const predecessorBytes = await client.getFile(
    predecessorPath,
    currentRef.sha,
  );
  if (predecessorBytes !== null) {
    const predecessor = readArchivedDocument(predecessorBytes, predecessorPath);
    if (predecessor.rootHash !== envelope.previousRootHash) {
      throw new Error(`${predecessorPath} does not contain its named root`);
    }
    throw new Error(
      `incoming root is stale or forks durable history: predecessor ${envelope.previousRootHash} is archived but current head is ${head.rootHash}`,
    );
  }

  return {
    status: "waiting",
    reason: `predecessor ${envelope.previousRootHash} is not archived yet`,
  };
}

export async function prepareLedgerRoot(
  value: unknown,
  client: LedgerRootReadClient,
  options: PrepareLedgerRootOptions = {},
): Promise<string> {
  const envelope = parseDispatchEnvelope(value);
  const timeoutMs = positiveInteger(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "preparation timeout",
  );
  const pollIntervalMs = positiveInteger(
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    "poll interval",
  );
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? wait;
  const startedAt = now().getTime();
  const deadline = startedAt + timeoutMs;
  let lastWaitReason = "durable chain state was not ready";

  for (;;) {
    const observedAt = now();
    try {
      const result = await inspectDurableChain(
        envelope,
        client,
        observedAt.toISOString(),
        options.allowExpiredForArchive ?? false,
      );
      if (result.status === "prepared") return result.content;
      lastWaitReason = result.reason;
    } catch (error) {
      if (!(error instanceof GitHubArchiveError) || !error.retryable) {
        throw error;
      }
      lastWaitReason = error.message;
    }

    const remainingMs = deadline - now().getTime();
    if (remainingMs <= 0) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for durable predecessor ${envelope.previousRootHash ?? "<genesis>"}: ${lastWaitReason}`,
      );
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

export interface PrepareRootArguments {
  readonly payloadPath: string;
  readonly allowExpiredForArchive: boolean;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

export function parsePrepareRootArguments(
  argumentsAfterScript: readonly string[],
): PrepareRootArguments {
  const [payloadPath, ...arguments_] = argumentsAfterScript;
  if (!payloadPath) {
    throw new Error(
      "usage: prepare-root.ts <dispatch.json> [--allow-expired-for-archive] [--timeout-ms <milliseconds>] [--poll-interval-ms <milliseconds>]",
    );
  }
  let allowExpiredForArchive = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--allow-expired-for-archive") {
      allowExpiredForArchive = true;
      continue;
    }
    if (argument === "--timeout-ms" || argument === "--poll-interval-ms") {
      const rawValue = arguments_[index + 1];
      if (!rawValue) throw new Error(`${argument} requires a value`);
      const value = positiveInteger(Number(rawValue), argument);
      if (argument === "--timeout-ms") timeoutMs = value;
      else pollIntervalMs = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${argument}`);
  }
  return {
    payloadPath,
    allowExpiredForArchive,
    timeoutMs,
    pollIntervalMs,
  };
}

async function main(): Promise<void> {
  const options = parsePrepareRootArguments(process.argv.slice(2));
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
  }
  const value = JSON.parse(
    await readFile(options.payloadPath, "utf8"),
  ) as unknown;
  const content = await prepareLedgerRoot(
    value,
    new GitHubArchiveClient({ repository, token }),
    options,
  );
  process.stdout.write(content);
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "root preparation failed"}\n`,
    );
    process.exitCode = 1;
  });
}
