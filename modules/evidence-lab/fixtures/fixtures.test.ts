import { describe, expect, it } from "vitest";

import { InMemoryEvidenceLabLedger } from "../registry/ledger";
import { buildFoundationFixture, type FixtureOperation } from ".";

function replay(clock: string) {
  const ledger = new InMemoryEvidenceLabLedger({
    clock: () => new Date(clock),
  });
  for (const operation of buildFoundationFixture()
    .operations as FixtureOperation[]) {
    const method = ledger[operation.method].bind(ledger) as (
      ...args: readonly unknown[]
    ) => unknown;
    method(...operation.args);
  }
  return ledger.contentHashes();
}

describe("foundation fixture", () => {
  it("builds byte-identical records on every call", () => {
    expect(JSON.stringify(buildFoundationFixture())).toBe(
      JSON.stringify(buildFoundationFixture()),
    );
  });

  it("reproduces the committed golden content hashes regardless of replay time", async () => {
    const hashes = replay("2026-09-20T12:00:00.000Z");
    expect(replay("2031-01-01T00:00:00.000Z")).toEqual(hashes);
    expect(Object.keys(hashes)).toHaveLength(
      buildFoundationFixture().operations.reduce(
        (count, operation) => count + operation.args.length,
        0,
      ),
    );
    await expect(`${JSON.stringify(hashes, null, 2)}\n`).toMatchFileSnapshot(
      "../../../tests/fixtures/evidence-lab/foundation-hashes.json",
    );
  });
});
