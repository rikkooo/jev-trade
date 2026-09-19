import type { LedgerRootDispatchEnvelope } from "@/modules/ledger/root-chain";

import {
  dispatchEnvelopeMatchesArchive,
  parseArchivedLedgerRoot,
  type ArchivedLedgerRoot,
} from "./dispatch";

const BRANCH_REF = "heads/ledger-roots";
const CREATE_BRANCH_REF = `refs/${BRANCH_REF}`;

export interface GitRef {
  readonly sha: string;
}

export interface GitTreeEntry {
  readonly path: string;
  readonly mode: "100644";
  readonly type: "blob";
  readonly sha: string;
}

export interface GitDataArchiveClient {
  getRef(ref: string): Promise<GitRef | null>;
  getFile(path: string, ref: string): Promise<string | null>;
  createBlob(content: string): Promise<string>;
  getCommitTree(commitSha: string): Promise<string>;
  createTree(input: {
    readonly baseTreeSha?: string;
    readonly entries: readonly GitTreeEntry[];
  }): Promise<string>;
  createCommit(input: {
    readonly message: string;
    readonly treeSha: string;
    readonly parents: readonly string[];
  }): Promise<string>;
  createRef(ref: string, sha: string): Promise<void>;
  updateRef(ref: string, sha: string, force: false): Promise<void>;
}

export type ArchiveLedgerRootResult =
  | {
      readonly status: "archived";
      readonly rootHash: string;
      readonly commitSha: string;
    }
  | {
      readonly status: "already_archived";
      readonly rootHash: string;
      readonly commitSha: string;
    };

function readArchivedDocument(
  content: string,
  label: string,
): ArchivedLedgerRoot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  try {
    return parseArchivedLedgerRoot(parsed);
  } catch (error) {
    throw new Error(`${label} is malformed`, { cause: error });
  }
}

function assertSameRoot(
  incoming: LedgerRootDispatchEnvelope,
  existing: ArchivedLedgerRoot,
): void {
  if (!dispatchEnvelopeMatchesArchive(incoming, existing)) {
    throw new Error(
      `archived root ${incoming.rootHash} does not match the original dispatch`,
    );
  }
}

function isRefConflict(error: unknown): boolean {
  if (error === null || typeof error !== "object" || !("status" in error)) {
    return false;
  }
  const status = (error as { readonly status?: unknown }).status;
  return status === 409 || status === 422;
}

async function recoverConcurrentReplay(
  document: ArchivedLedgerRoot,
  client: GitDataArchiveClient,
  archivePath: string,
): Promise<ArchiveLedgerRootResult> {
  const latestRef = await client.getRef(BRANCH_REF);
  if (latestRef) {
    const existingContent = await client.getFile(archivePath, latestRef.sha);
    if (existingContent !== null) {
      const existing = readArchivedDocument(existingContent, archivePath);
      assertSameRoot(document, existing);
      return {
        status: "already_archived",
        rootHash: document.rootHash,
        commitSha: latestRef.sha,
      };
    }
  }
  throw new Error(
    "durable archive head changed before append; replay the original root after inspecting the competing write",
  );
}

export async function archiveLedgerRoot(
  value: unknown,
  client: GitDataArchiveClient,
): Promise<ArchiveLedgerRootResult> {
  const document = parseArchivedLedgerRoot(value);
  const archivePath = `roots/${document.rootHash}.json`;
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const currentRef = await client.getRef(BRANCH_REF);

  if (!currentRef) {
    if (document.previousRootHash !== null) {
      throw new Error("first archived root must not name a predecessor");
    }
    const blobSha = await client.createBlob(content);
    const treeSha = await client.createTree({
      entries: [
        { path: archivePath, mode: "100644", type: "blob", sha: blobSha },
        { path: "head.json", mode: "100644", type: "blob", sha: blobSha },
      ],
    });
    const commitSha = await client.createCommit({
      message: `ledger root ${document.batchKey}`,
      treeSha,
      parents: [],
    });
    try {
      await client.createRef(CREATE_BRANCH_REF, commitSha);
    } catch (error) {
      if (!isRefConflict(error)) throw error;
      return recoverConcurrentReplay(document, client, archivePath).catch(
        (recoveryError) => {
          throw new Error("durable archive head changed before genesis", {
            cause: recoveryError ?? error,
          });
        },
      );
    }
    return { status: "archived", rootHash: document.rootHash, commitSha };
  }

  const headContent = await client.getFile("head.json", currentRef.sha);
  if (headContent === null) {
    throw new Error("ledger-roots/head.json is missing");
  }
  const head = readArchivedDocument(headContent, "ledger-roots/head.json");
  const existingContent = await client.getFile(archivePath, currentRef.sha);
  if (existingContent !== null) {
    const existing = readArchivedDocument(existingContent, archivePath);
    assertSameRoot(document, existing);
    return {
      status: "already_archived",
      rootHash: document.rootHash,
      commitSha: currentRef.sha,
    };
  }
  if (head.rootHash !== document.previousRootHash) {
    throw new Error(
      "durable archive head does not match the root predecessor; replay cannot rewrite or re-anchor history",
    );
  }

  const blobSha = await client.createBlob(content);
  const baseTreeSha = await client.getCommitTree(currentRef.sha);
  const treeSha = await client.createTree({
    baseTreeSha,
    entries: [
      { path: archivePath, mode: "100644", type: "blob", sha: blobSha },
      { path: "head.json", mode: "100644", type: "blob", sha: blobSha },
    ],
  });
  const commitSha = await client.createCommit({
    message: `ledger root ${document.batchKey}`,
    treeSha,
    parents: [currentRef.sha],
  });
  try {
    await client.updateRef(BRANCH_REF, commitSha, false);
  } catch (error) {
    if (!isRefConflict(error)) throw error;
    return recoverConcurrentReplay(document, client, archivePath).catch(
      (recoveryError) => {
        throw new Error("durable archive head changed before append", {
          cause: recoveryError ?? error,
        });
      },
    );
  }
  return { status: "archived", rootHash: document.rootHash, commitSha };
}
