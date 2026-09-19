import { readFile } from "node:fs/promises";

import { archiveLedgerRoot } from "./archive";
import { GitHubArchiveClient } from "./github-archive-client";

async function main(): Promise<void> {
  const [artifactPath] = process.argv.slice(2);
  if (!artifactPath) {
    throw new Error("usage: archive-root.ts <ledger-root.json>");
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
  }
  const value = JSON.parse(await readFile(artifactPath, "utf8")) as unknown;
  const result = await archiveLedgerRoot(
    value,
    new GitHubArchiveClient({ repository, token }),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "root archive failed"}\n`,
  );
  process.exitCode = 1;
});
