import { describe, expect, it } from "vitest";

import type { LedgerSqlClient } from "@/modules/ledger/postgres";

import { EvidenceLabError, fromDatabaseError } from "../errors";
import { buildFoundationFixture } from "../fixtures";
import {
  EvidenceLabOperatorStore,
  EvidenceLabWorkerStore,
  OPERATOR_STATEMENTS,
  WORKER_STATEMENTS,
} from "./postgres";

class RecordingClient implements LedgerSqlClient {
  readonly calls: Array<{ statement: string; parameters: readonly unknown[] }> =
    [];

  query<Row extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<{ readonly rows: readonly Row[] }> {
    this.calls.push({ statement, parameters });
    return Promise.resolve({
      rows: [{ created: true, record_id: "fx" }] as unknown as Row[],
    });
  }
}

describe("Evidence Lab PostgreSQL stores", () => {
  it("issue only their role's named procedures with the sealed records", async () => {
    const fixture = buildFoundationFixture();
    const operatorClient = new RecordingClient();
    const workerClient = new RecordingClient();
    const operator = new EvidenceLabOperatorStore(operatorClient);
    const worker = new EvidenceLabWorkerStore(workerClient);

    for (const operation of fixture.operations) {
      const store = operation.role === "operator" ? operator : worker;
      const method = (
        store as unknown as Record<
          string,
          (...args: readonly unknown[]) => Promise<unknown>
        >
      )[operation.method];
      if (!method)
        throw new Error(`${operation.role} store lacks ${operation.method}`);
      await method.apply(store, [...operation.args]);
    }

    const operatorStatements = new Set(Object.values(OPERATOR_STATEMENTS));
    const workerStatements = new Set(Object.values(WORKER_STATEMENTS));
    expect(
      operatorClient.calls.every((call) =>
        operatorStatements.has(call.statement as never),
      ),
    ).toBe(true);
    expect(
      workerClient.calls.every((call) =>
        workerStatements.has(call.statement as never),
      ),
    ).toBe(true);
    expect(
      operatorClient.calls.some((call) =>
        /p2_append_source_revision|p2_record_first/.test(call.statement),
      ),
    ).toBe(false);
    expect(
      workerClient.calls.some((call) =>
        /registry|cohort_event|p2_append_cohort\(/.test(call.statement),
      ),
    ).toBe(false);

    const first = operatorClient.calls[0];
    expect(first?.parameters).toEqual(fixture.operations[0]?.args);
    expect("recordFirstForecastLock" in operator).toBe(false);
    expect("appendCohort" in worker).toBe(false);
  });

  it("refuses to send a tampered record to the database", async () => {
    const client = new RecordingClient();
    const worker = new EvidenceLabWorkerStore(client);
    const source = buildFoundationFixture().sources["fx-src-aapl-bar-1330"];
    await expect(
      worker.appendSourceRevision({
        ...source,
        availableAt: "2026-09-18T13:30:06.000Z",
      }),
    ).rejects.toThrow(EvidenceLabError);
    expect(client.calls).toHaveLength(0);
  });

  it("maps SQLSTATEs to typed errors without forwarding connection text", () => {
    const cases: Array<[string, EvidenceLabError["code"]]> = [
      ["22023", "VALIDATION"],
      ["23505", "CONFLICT"],
      ["23503", "MISSING_REFERENCE"],
      ["55000", "ILLEGAL_TRANSITION"],
      ["JTG01", "GATED"],
      ["42501", "FORBIDDEN"],
      ["08006", "UNAVAILABLE"],
    ];
    for (const [sqlState, code] of cases) {
      const error = Object.assign(new Error("procedure message"), {
        code: sqlState,
      });
      expect(fromDatabaseError(error).code).toBe(code);
    }
    const leaky = Object.assign(
      new Error("connect failed for postgres://user:pass@host/db"),
      { code: "42501" },
    );
    expect(fromDatabaseError(leaky).message).not.toContain("pass@host");
    const unknown = Object.assign(new Error("password=hunter2"), {
      code: "XX000",
    });
    expect(fromDatabaseError(unknown).message).toBe(
      "database operation failed",
    );
  });
});
