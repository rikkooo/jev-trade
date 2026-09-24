import { describe, expect, it } from "vitest";

import { EvidenceLabError } from "../errors";
import { buildFoundationFixture, fixtureSource } from "../fixtures";
import { seal, type SealedRecord } from "../model/hashing";
import { evaluateReceiptAuthority } from "../model/receipts";
import type {
  EvidenceStateFields,
  SourceRevisionFields,
} from "../model/sources";
import {
  projectProtectedCohort,
  projectPublicEvidenceState,
  projectReceiptStatus,
  projectSafeFailure,
} from "./dtos";
import {
  assertSafeProjection,
  collectConfiguredSecrets,
  findProtectedContent,
  ProjectionLeakError,
} from "./guard";

// Canaries are synthetic and exist only to prove they cannot escape.
const CANARY_ENV = {
  DATABASE_MIGRATION_URL:
    "postgres://jev_migrator:canary-migration-pass@db.invalid:5432/jev",
  OPERATOR_DATABASE_URL:
    "postgres://jev_operator_login:canary-operator-pass@db.invalid/jev",
  OPENROUTER_API_KEY: "canary-openrouter-key-0123456789",
  CRON_SECRET: "canary-cron-secret-0123456789abcdef0123",
  OPERATOR_TOKEN: "canary-operator-token-0123456789abcdef",
  MARKET_DATA_API_KEY: "canary-market-key-01234",
} as const;
const LICENSED_CANARY = "CANARY-LICENSED-ROW|MSFT|10-Q|revenue=65585000000";
const PROMPT_CANARY = "CANARY-PROTECTED-PROMPT: you are the Jev evaluator";

const fixture = buildFoundationFixture();
const sourceMap = new Map(Object.entries(fixture.sources)) as ReadonlyMap<
  string,
  SealedRecord<SourceRevisionFields>
>;

describe("safe projections", () => {
  it("snapshots the protected cohort, public evidence, receipt, and failure DTOs", () => {
    const cohort = fixture.cohorts["fx-cohort-day-v1"];
    const state = fixture.states["fx-state-day-aapl-1400"];
    const receipt = fixture.receipts["fx-receipt-b-1"];
    if (!cohort || !state || !receipt) throw new Error("fixture incomplete");
    const dtos = {
      cohort: projectProtectedCohort(cohort, {
        lifecycleStatus: "ACTIVATION_PENDING",
        firstForecastLocked: false,
      }),
      evidenceState: projectPublicEvidenceState(state, sourceMap),
      restatedState: projectPublicEvidenceState(
        fixture.states[
          "fx-state-lt-msft-0701"
        ] as SealedRecord<EvidenceStateFields>,
        sourceMap,
      ),
      receipt: projectReceiptStatus(
        evaluateReceiptAuthority(receipt.batchId, receipt.rootHash, [receipt]),
      ),
      failure: projectSafeFailure("GATED"),
    };
    expect(dtos).toMatchSnapshot();
    expect(dtos.evidenceState.withheldSourceCount).toBe(1);
    expect(dtos.restatedState.sources).toEqual([]);
    expect(dtos.restatedState.withheldSourceCount).toBe(1);
    const serialized = JSON.stringify(dtos);
    for (const forbidden of [
      'normalizedState"',
      "payloadHash",
      "actorFingerprint",
      "idempotencyKey",
      "canonicalPayload",
      "fx-src-aapl-borrow",
      "lastClose",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("omits the normalized state, source payload hashes, and non-public sources by construction", () => {
    const state = fixture.states[
      "fx-state-day-aapl-1400"
    ] as SealedRecord<EvidenceStateFields>;
    const dto = projectPublicEvidenceState(state, sourceMap);
    expect(Object.keys(dto)).not.toContain("normalizedState");
    expect(dto.sources.map((source) => source.sourceRevisionId)).toEqual([
      "fx-src-aapl-bar-1330",
    ]);
    expect(Object.keys(dto.sources[0] ?? {})).not.toContain("payloadHash");
  });

  it("blocks protected content found by key name", () => {
    for (const key of [
      "apiKey",
      "authorization",
      "requestHeaders",
      "rawPayload",
      "licensed_payload",
      "protectedPrompt",
      "systemPrompt",
      "operatorToken",
      "databaseUrl",
      "actorFingerprint",
    ]) {
      expect(
        () => assertSafeProjection({ nested: [{ [key]: "harmless-looking" }] }),
        key,
      ).toThrow(ProjectionLeakError);
    }
  });

  it("blocks secrets smuggled as values under harmless keys", () => {
    const smuggled = [
      "postgres://jev_worker:s3cret-pass@db.internal:5432/jev",
      "see https://user:hunter2hunter2@example.invalid/path",
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvcGVyYXRvciJ9.c2lnbmF0dXJlLXRleHQ",
      "sk-or-v1-0123456789abcdef0123456789abcdef",
      "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
      "AKIAABCDEFGHIJKLMNOP",
      "-----BEGIN RSA PRIVATE KEY-----",
      "Authorization: Basic Zm9vOmJhcg==",
      "x-operator-token: abcdefabcdef",
      "retry with api_key=abcdef0123456789",
    ];
    for (const value of smuggled) {
      const findings = findProtectedContent({ note: { text: value } });
      expect(findings.length, value).toBeGreaterThan(0);
      expect(JSON.stringify(findings)).not.toContain(value);
    }
  });

  it("blocks exact configured secrets, protected prompts, and licensed rows anywhere", () => {
    const protectedValues = [
      ...collectConfiguredSecrets(CANARY_ENV),
      LICENSED_CANARY,
      PROMPT_CANARY,
    ];
    expect(protectedValues).toContain("canary-operator-pass");
    for (const leak of [
      { label: `ok ${CANARY_ENV.OPERATOR_TOKEN}` },
      { list: ["x", `cron=${CANARY_ENV.CRON_SECRET.slice(0, 40)}`] },
      { summary: `prefix ${LICENSED_CANARY} suffix` },
      { rationale: PROMPT_CANARY },
      {
        url: "postgres://jev_operator_login:canary-operator-pass@db.invalid/jev",
      },
      { [CANARY_ENV.OPENROUTER_API_KEY]: true },
    ]) {
      try {
        assertSafeProjection(leak, { protectedValues });
        throw new Error("leak escaped");
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectionLeakError);
        const message = (error as Error).message;
        for (const secret of protectedValues)
          expect(message).not.toContain(secret);
      }
    }
  });

  it("fails the whole projection closed when a record carries a canary", () => {
    const protectedValues = [
      ...collectConfiguredSecrets(CANARY_ENV),
      LICENSED_CANARY,
    ];
    const cohort = fixture.cohorts["fx-cohort-day-v1"];
    if (!cohort) throw new Error("fixture incomplete");
    const {
      canonicalPayload: _payload,
      contentHash: _hash,
      ...fields
    } = cohort;
    void _payload;
    void _hash;
    const poisoned = seal("cohort", {
      ...fields,
      id: `fx-${CANARY_ENV.OPERATOR_TOKEN}`,
    });
    expect(() =>
      projectProtectedCohort(
        poisoned,
        { lifecycleStatus: "DRAFT", firstForecastLocked: false },
        { protectedValues },
      ),
    ).toThrow(ProjectionLeakError);

    const licensedSource = fixtureSource({
      id: "fx-src-canary",
      sourceId: "fx-feed:canary",
    });
    const map = new Map(sourceMap);
    map.set(licensedSource.id, licensedSource);
    const state = fixture.states[
      "fx-state-day-aapl-1400"
    ] as SealedRecord<EvidenceStateFields>;
    const dto = projectPublicEvidenceState(state, map, { protectedValues });
    expect(JSON.stringify(dto)).not.toContain(LICENSED_CANARY);
  });

  it("returns a fixed safe message per failure code and never raw error text", () => {
    const failure = projectSafeFailure(
      new EvidenceLabError(
        "VALIDATION",
        `bad value ${CANARY_ENV.OPERATOR_TOKEN}`,
      ).code,
    );
    expect(failure).toEqual({
      dtoVersion: "evidence-lab-dto/v1",
      code: "VALIDATION",
      message: "The record does not satisfy the Evidence Lab contract.",
    });
  });
});
