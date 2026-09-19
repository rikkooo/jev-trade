import { readFile } from "node:fs/promises";

import { verifyAndSerializeDispatchArtifact } from "./dispatch";

interface PublishedRootArtifact {
  readonly rootHash?: unknown;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const [payloadPath, ...arguments_] = process.argv.slice(2);
  if (!payloadPath) {
    throw new Error(
      "usage: verify-dispatch.ts <dispatch.json> [--allow-expired-for-archive] [--previous <head.json>] [--existing <root.json>]",
    );
  }
  let allowExpiredForArchive = false;
  let previousArtifactPath: string | undefined;
  let existingArtifactPath: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--allow-expired-for-archive") {
      allowExpiredForArchive = true;
      continue;
    }
    if (argument === "--previous" || argument === "--existing") {
      const path = arguments_[index + 1];
      if (!path) throw new Error(`${argument} requires a file path`);
      if (argument === "--previous") previousArtifactPath = path;
      else existingArtifactPath = path;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${argument}`);
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
  const existingPublishedRootBytes = existingArtifactPath
    ? await readFile(existingArtifactPath, "utf8")
    : undefined;
  const observedAt = new Date().toISOString();
  process.stdout.write(
    verifyAndSerializeDispatchArtifact(payload, {
      previousPublishedRootHash,
      observedAt,
      allowExpiredForArchive,
      existingPublishedRootBytes,
    }),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "dispatch verification failed"}\n`,
  );
  process.exitCode = 1;
});
