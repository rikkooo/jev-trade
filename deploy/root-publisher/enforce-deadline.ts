import { readFile } from "node:fs/promises";

import { assertBeforeAttestationDeadline } from "./dispatch";

async function main(): Promise<void> {
  const [artifactPath] = process.argv.slice(2);
  if (!artifactPath) {
    throw new Error("usage: enforce-deadline.ts <ledger-root.json>");
  }
  const value = JSON.parse(await readFile(artifactPath, "utf8")) as unknown;
  const remainingMs = assertBeforeAttestationDeadline(
    value,
    new Date().toISOString(),
  );
  process.stdout.write(
    `${JSON.stringify({ eligibleToStart: true, remainingMs })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "deadline check failed"}\n`,
  );
  process.exitCode = 1;
});
