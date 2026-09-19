import { readFile } from "node:fs/promises";

import { validateDispatchEnvelope } from "./dispatch";

interface PublishedRootArtifact {
  readonly rootHash?: unknown;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const [payloadPath, previousArtifactPath] = process.argv.slice(2);
  if (!payloadPath) {
    throw new Error(
      "usage: verify-dispatch.ts <dispatch.json> [previous-ledger-root.json]",
    );
  }
  const payload = await readJson(payloadPath);
  let previousPublishedRootHash: string | null = null;
  if (previousArtifactPath) {
    const previous = (await readJson(
      previousArtifactPath,
    )) as PublishedRootArtifact;
    if (typeof previous.rootHash !== "string") {
      throw new Error("previous artifact has no root hash");
    }
    previousPublishedRootHash = previous.rootHash;
  }
  const verified = validateDispatchEnvelope(payload, {
    previousPublishedRootHash,
    observedAt: new Date().toISOString(),
  });
  process.stdout.write(
    `${JSON.stringify({ ...verified, verifiedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "dispatch verification failed"}\n`,
  );
  process.exitCode = 1;
});
