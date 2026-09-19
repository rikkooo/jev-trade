import { describe, expect, it } from "vitest";

import { InMemoryLedgerRepository } from "../../modules/ledger/in-memory";
import { rebuildLedgerProjection } from "../../modules/ledger/replay";

describe("ledger integration replay", () => {
  it("reconstructs position cash and shares from events alone", () => {
    let id = 0;
    const repo = new InMemoryLedgerRepository({
      now: () => new Date("2026-09-19T12:00:00.000Z"),
      id: (prefix) => `${prefix}_${++id}`,
    });

    repo.appendPaperEvent({
      id: "paper_deposit",
      type: "deposit",
      cashDelta: 100_000,
      sharesDelta: 0,
    });
    repo.appendPaperEvent({
      id: "paper_entry",
      type: "entry",
      symbol: "AAPL",
      cashDelta: -20_020,
      sharesDelta: 100,
      price: 200.2,
    });
    repo.appendPaperEvent({
      id: "paper_split",
      type: "split",
      symbol: "AAPL",
      cashDelta: 0,
      sharesDelta: 100,
    });
    repo.appendPaperEvent({
      id: "paper_dividend",
      type: "cash_dividend",
      symbol: "AAPL",
      cashDelta: 50,
      sharesDelta: 0,
    });

    const rebuilt = rebuildLedgerProjection(repo.readAll());
    expect(rebuilt.cash).toBe(80_030);
    expect(rebuilt.sharesBySymbol).toEqual({ AAPL: 200 });
    expect(rebuilt).toEqual(repo.projection());
  });
});
