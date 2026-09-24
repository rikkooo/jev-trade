/**
 * Evidence Lab foundation against a disposable, migrated PostgreSQL (#15).
 *
 * Requires EVIDENCE_LAB_DATABASE_URL: the migration-owner URL of a throwaway
 * database. The suite creates short-lived LOGIN roles that are members of
 * exactly one capability role, drives the golden fixture through the named
 * procedures, and drops the probes afterwards. CI sets
 * EVIDENCE_LAB_REQUIRE_DATABASE=true so a missing database fails instead of
 * skipping.
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseRoleConfigurationError } from "@/modules/config/database";
import {
  createPostgresSqlClient,
  openWorkerStore,
  type ClosableSqlClient,
} from "@/modules/evidence-lab/dal/connections";
import { EvidenceLabError } from "@/modules/evidence-lab/errors";
import {
  buildFoundationFixture,
  fixtureAudit,
  fixtureCohort,
  fixtureCohortEvent,
  fixtureEvidenceState,
  fixtureForecastLock,
  fixturePackProfile,
  fixtureReceipt,
  fixtureRegistryEntry,
  fixtureRegistryEvent,
  fixtureSource,
} from "@/modules/evidence-lab/fixtures";
import { claimedReceiptStatus } from "@/modules/evidence-lab/model/receipts";
import {
  EvidenceLabOperatorStore,
  EvidenceLabWorkerStore,
} from "@/modules/evidence-lab/registry/postgres";

const ownerUrl = process.env.EVIDENCE_LAB_DATABASE_URL;
if (!ownerUrl && process.env.EVIDENCE_LAB_REQUIRE_DATABASE === "true") {
  throw new Error("EVIDENCE_LAB_DATABASE_URL is required for this gate");
}

const RUNTIME_ROLES = [
  "jev_operator",
  "jev_worker",
  "jev_public_reader",
  "jev_public_ingest",
] as const;
type RuntimeRole = (typeof RUNTIME_ROLES)[number];

const TABLE_PREFIXES: Readonly<Record<string, string>> = {
  p2_operator_audit_events: "audit",
  p2_registry_entries: "registry_entry",
  p2_registry_events: "registry_event",
  p2_cohorts: "cohort",
  p2_cohort_events: "cohort_event",
  p2_source_revisions: "source_revision",
  p2_evidence_states: "evidence_state",
  p2_publication_receipts: "publication_receipt",
};

async function rejectsWith(
  promise: Promise<unknown>,
  code: EvidenceLabError["code"],
) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `expected ${code}`).toBeInstanceOf(EvidenceLabError);
  expect((error as EvidenceLabError).code).toBe(code);
  return error as EvidenceLabError;
}

describe.skipIf(!ownerUrl)("Evidence Lab foundation on PostgreSQL", () => {
  const suffix = randomBytes(4).toString("hex");
  const probes = new Map<RuntimeRole, { name: string; url: string }>();
  const clients = new Map<RuntimeRole, ClosableSqlClient>();
  let owner: postgres.Sql;
  let operator: EvidenceLabOperatorStore;
  let worker: EvidenceLabWorkerStore;
  const fixture = buildFoundationFixture();

  beforeAll(async () => {
    owner = postgres(ownerUrl as string, {
      max: 1,
      prepare: false,
      onnotice: () => undefined,
    });
    for (const role of RUNTIME_ROLES) {
      const name = `p2probe_${suffix}_${role.replace("jev_", "")}`;
      const password = randomBytes(18).toString("hex");
      await owner.unsafe(
        `CREATE ROLE ${name} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
      );
      await owner.unsafe(`GRANT ${role} TO ${name}`);
      const url = new URL(ownerUrl as string);
      url.username = name;
      url.password = password;
      probes.set(role, { name, url: url.toString() });
      clients.set(role, createPostgresSqlClient(url.toString()));
    }
    operator = new EvidenceLabOperatorStore(
      clients.get("jev_operator") as ClosableSqlClient,
    );
    worker = new EvidenceLabWorkerStore(
      clients.get("jev_worker") as ClosableSqlClient,
    );
  }, 60_000);

  afterAll(async () => {
    for (const client of clients.values()) await client.close();
    for (const { name } of probes.values()) {
      await owner.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${name}'`,
      );
      await owner.unsafe(`DROP ROLE IF EXISTS ${name}`);
    }
    await owner?.end({ timeout: 5 });
  }, 60_000);

  async function runFixture() {
    const results = [];
    for (const operation of fixture.operations) {
      const store = operation.role === "operator" ? operator : worker;
      const method = (
        store as unknown as Record<
          string,
          (...args: unknown[]) => Promise<{ created: boolean }>
        >
      )[operation.method] as (
        ...args: unknown[]
      ) => Promise<{ created: boolean }>;
      results.push(await method.apply(store, [...operation.args]));
    }
    return results;
  }

  it("stores the golden fixture through role procedures with byte-identical seals", async () => {
    const [before] =
      await owner`SELECT count(*)::int AS count FROM p2_operator_audit_events WHERE id LIKE 'fx-audit-%'`;
    const first = await runFixture();
    if (before?.count === 0)
      expect(first.every((result) => result.created)).toBe(true);

    const golden = JSON.parse(
      await readFile(
        resolve("tests/fixtures/evidence-lab/foundation-hashes.json"),
        "utf8",
      ),
    ) as Record<string, string>;
    const stored: Record<string, string> = {};
    for (const [table, prefix] of Object.entries(TABLE_PREFIXES)) {
      const rows = await owner.unsafe<{ id: string; content_hash: string }[]>(
        `SELECT id, content_hash FROM ${table}`,
      );
      for (const row of rows) stored[`${prefix}:${row.id}`] = row.content_hash;
    }
    for (const [key, hash] of Object.entries(golden)) {
      expect(stored[key], key).toBe(hash);
    }
  }, 120_000);

  it("treats every retry as exactly-once and serializes concurrent duplicates", async () => {
    const replay = await runFixture();
    expect(replay.every((result) => !result.created)).toBe(true);

    const source = fixtureSource({
      id: `fx-src-race-${suffix}`,
      sourceId: `fx-feed:race:${suffix}`,
    });
    const secondClient = createPostgresSqlClient(
      (probes.get("jev_worker") as { url: string }).url,
    );
    try {
      const second = new EvidenceLabWorkerStore(secondClient);
      const outcomes = await Promise.all([
        worker.appendSourceRevision(source),
        second.appendSourceRevision(source),
      ]);
      expect(outcomes.map((outcome) => outcome.created).sort()).toEqual([
        false,
        true,
      ]);
    } finally {
      await secondClient.close();
    }
  }, 60_000);

  it("rejects a different payload under an existing id or idempotency key", async () => {
    const changed = fixtureRegistryEntry("day", "feature", {
      payload: {
        schema: "jev-evidence-lab-feature/v1",
        description: "changed",
      },
    });
    await rejectsWith(
      operator.appendRegistryEntry(
        changed,
        fixtureAudit("APPEND_REGISTRY_ENTRY", changed, `c1-${suffix}`),
      ),
      "CONFLICT",
    );
    const fresh = fixtureRegistryEntry("scalping", "metric", {
      id: `fx-scalping-metric-${suffix}`,
      version: `fx-scalping-metric-${suffix}`,
    });
    await rejectsWith(
      operator.appendRegistryEntry(
        fresh,
        fixtureAudit("APPEND_REGISTRY_ENTRY", fresh, `c2-${suffix}`, {
          idempotencyKey: "fx-idempotency-0001",
        }),
      ),
      "CONFLICT",
    );
    const source = fixture.sources["fx-src-aapl-bar-1330"];
    const altered = fixtureSource({
      id: "fx-src-aapl-bar-1330",
      sourceId: "fx-feed:aapl:bar:1330",
      revision: "r9",
    });
    expect(altered.contentHash).not.toBe(source?.contentHash);
    await rejectsWith(worker.appendSourceRevision(altered), "CONFLICT");
  }, 60_000);

  it("keeps every runtime role inside its declared capabilities", async () => {
    const migrationOwner = new URL(ownerUrl as string).username;
    for (const role of RUNTIME_ROLES) {
      const client = clients.get(role) as ClosableSqlClient;
      await rejectsWith(client.query("SELECT 1 FROM p2_cohorts"), "FORBIDDEN");
      await rejectsWith(
        client.query("DELETE FROM p2_evidence_states"),
        "FORBIDDEN",
      );
      for (const other of [
        ...RUNTIME_ROLES.filter((candidate) => candidate !== role),
        migrationOwner,
      ]) {
        await rejectsWith(client.query(`SET ROLE ${other}`), "FORBIDDEN");
      }
    }
    const reader = clients.get("jev_public_reader") as ClosableSqlClient;
    const ingest = clients.get("jev_public_ingest") as ClosableSqlClient;
    await rejectsWith(
      reader.query("SELECT * FROM p2_read_cohort_status('fx-cohort-day-v1')"),
      "FORBIDDEN",
    );
    await rejectsWith(
      ingest.query("SELECT * FROM p2_append_source_revision('{}'::jsonb)"),
      "FORBIDDEN",
    );

    const asWorker = new EvidenceLabOperatorStore(
      clients.get("jev_worker") as ClosableSqlClient,
    );
    const event = fixtureCohortEvent("fx-cohort-scalping-v1", "CLOSED");
    await rejectsWith(
      asWorker.appendCohortEvent(
        event,
        fixtureAudit("APPEND_COHORT_EVENT", event, `w1-${suffix}`),
      ),
      "FORBIDDEN",
    );
    const asOperator = new EvidenceLabWorkerStore(
      clients.get("jev_operator") as ClosableSqlClient,
    );
    await rejectsWith(
      asOperator.appendPublicationReceipt(fixture.receipts["fx-receipt-a-1"]),
      "FORBIDDEN",
    );
    await rejectsWith(
      asOperator.recordFirstForecastLock(
        fixtureForecastLock(
          fixture.cohorts["fx-cohort-day-v1"] as never,
          "fx-run-operator",
        ),
      ),
      "FORBIDDEN",
    );
    await rejectsWith(
      asOperator.readEvidenceState("fx-state-day-aapl-1400"),
      "FORBIDDEN",
    );
  }, 60_000);

  it("fails closed before connecting when a role credential is absent", () => {
    expect(() => openWorkerStore({})).toThrow(DatabaseRoleConfigurationError);
  });

  it("records late, missing, and failed receipts and grants none authority", async () => {
    for (const batch of ["a", "b", "c", "d"]) {
      const rows = await operator.readReceiptAuthority(`fx-batch-${batch}`);
      const latest = rows.at(-1) as Record<string, unknown>;
      expect(rows.every((row) => row.authoritative === false)).toBe(true);
      expect(latest.blockers).toContain(
        "INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE",
      );
      const receipt =
        fixture.receipts[`fx-receipt-${batch}-${batch === "c" ? 2 : 1}`];
      expect(latest.claimed_status).toBe(
        claimedReceiptStatus(receipt as never),
      );
    }
    const early = {
      id: `fx-r-early-${suffix}`,
      batchId: `fx-batch-early-${suffix}`,
    };
    await rejectsWith(
      worker.appendPublicationReceipt(
        fixtureReceipt({
          ...early,
          observation: "MISSING",
          deadlineAt: "2099-01-01T00:00:00.000Z",
        }),
      ),
      "VALIDATION",
    );
  }, 60_000);

  it("locks a cohort's first forecast once and never moves it", async () => {
    const swing = fixture.cohorts["fx-cohort-swing-v1"];
    const status = await worker.readCohortStatus("fx-cohort-swing-v1");
    expect(status[0]?.first_forecast_ref).toBe("fx-run-swing-0001");
    await rejectsWith(
      worker.recordFirstForecastLock(
        fixtureForecastLock(swing as never, "fx-run-swing-0002"),
      ),
      "ILLEGAL_TRANSITION",
    );
    const scalping = fixture.cohorts["fx-cohort-scalping-v1"];
    const draftLock = fixtureForecastLock(
      scalping as never,
      "fx-run-scalping-0001",
    );
    // Scalping v1 is VALIDATED in the fixture, so a fixture lock is allowed once.
    const first = await worker.recordFirstForecastLock(draftLock);
    const again = await worker.recordFirstForecastLock(draftLock);
    expect(again.created).toBe(false);
    expect(first.id).toBe(again.id);
  }, 60_000);

  it("holds prospective activation and prospective evidence at the gate itself", async () => {
    const approvedProfile = fixtureRegistryEntry("day", "packProfile", {
      id: `fx-day-profile-selected-${suffix}`,
      version: `fx-day-profile-selected-${suffix}`,
      payload: {
        ...fixturePackProfile("day"),
        valuesProvenance: {
          kind: "TRAINING_ONLY_SELECTION",
          datasetBoundary: {
            from: "2024-01-02T00:00:00.000Z",
            to: "2025-01-02T00:00:00.000Z",
          },
          selectionReviewReference: "fixture-only:not-a-review",
        },
      } as never,
    });
    await operator.appendRegistryEntry(
      approvedProfile,
      fixtureAudit("APPEND_REGISTRY_ENTRY", approvedProfile, `g1-${suffix}`),
    );
    for (const eventType of ["VALIDATED", "APPROVED"] as const) {
      const event = fixtureRegistryEvent(approvedProfile.id, eventType);
      await operator.appendRegistryEvent(
        event,
        fixtureAudit(
          "APPEND_REGISTRY_EVENT",
          event,
          `g2-${eventType}-${suffix}`,
        ),
      );
    }
    const cohort = fixtureCohort(
      "day",
      { ...fixture.registry.day, packProfile: approvedProfile },
      {
        id: `fx-cohort-day-prospective-${suffix}`,
        mode: "prospective",
      },
    );
    await operator.appendCohort(
      cohort,
      fixtureAudit("APPEND_COHORT", cohort, `g3-${suffix}`),
    );
    for (const eventType of ["VALIDATED", "APPROVED"] as const) {
      const event = fixtureCohortEvent(cohort.id, eventType);
      await operator.appendCohortEvent(
        event,
        fixtureAudit("APPEND_COHORT_EVENT", event, `g4-${eventType}-${suffix}`),
      );
    }
    const activation = fixtureCohortEvent(cohort.id, "ACTIVATION_SCHEDULED");
    await rejectsWith(
      operator.appendCohortEvent(
        activation,
        fixtureAudit("APPEND_COHORT_EVENT", activation, `g5-${suffix}`),
      ),
      "GATED",
    );
    await rejectsWith(
      worker.recordFirstForecastLock(
        fixtureForecastLock(cohort, `fx-run-prospective-${suffix}`),
      ),
      "ILLEGAL_TRANSITION",
    );

    const state = fixtureEvidenceState({
      id: `fx-state-prospective-${suffix}`,
      pack: "day",
      mode: "prospective",
      subject: "AAPL",
      cutoffAt: "2026-09-18T14:00:00.000Z",
      sources: [fixture.sources["fx-src-aapl-bar-1330"] as never],
      normalizedState: { lastClose: 1 },
      predecessorStateId: null,
      linkKind: null,
      changeSummary: null,
    });
    await rejectsWith(worker.appendEvidenceState(state), "GATED");
  }, 60_000);

  it("preserves point-in-time eligibility, corrections, and reassessments", async () => {
    const asOf = await worker.readSourceRevisionsAsOf(
      "fx-filings:msft:10q-q3",
      "2026-05-01T20:00:00.000Z",
    );
    expect(asOf.map((row) => [row.revision_id, row.eligible])).toEqual([
      ["fx-src-msft-filing-r1", true],
      ["fx-src-msft-filing-r2", false],
    ]);
    const original = await worker.readEvidenceState("fx-state-day-aapl-1400");
    expect(original[0]?.content_hash).toBe(
      fixture.states["fx-state-day-aapl-1400"]?.contentHash,
    );
    const reassessed = await worker.readEvidenceState("fx-state-day-aapl-1500");
    expect(reassessed[0]?.predecessor_state_id).toBe("fx-state-day-aapl-1400");
    expect(reassessed[0]?.link_kind).toBe("REASSESSMENT");

    const leaking = fixtureEvidenceState({
      id: `fx-state-leak-${suffix}`,
      pack: "day",
      mode: "fixture",
      subject: "AAPL",
      cutoffAt: "2026-09-18T14:00:00.000Z",
      sources: [fixture.sources["fx-src-aapl-bar-1430"] as never],
      normalizedState: { lastClose: 1 },
      predecessorStateId: null,
      linkKind: null,
      changeSummary: null,
    });
    const error = await rejectsWith(
      worker.appendEvidenceState(leaking),
      "VALIDATION",
    );
    expect(error.message).toContain("available after its cutoff");
  }, 60_000);
});
