import { z } from "zod";

import {
  canonicalJson,
  sha256Text,
  type JsonValue,
} from "@/modules/ledger/canonical-json";

export const EVIDENCE_LAB_CONTRACT_VERSION =
  "jev-evidence-lab-contract-v1" as const;
export const EVIDENCE_LAB_HASH_RECIPE =
  "jev-evidence-lab-canonical-json/v1" as const;
export const PROBABILITY_SUM_TOLERANCE = 1e-6;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const identifierSchema = z.string().trim().min(1).max(160);
const timestampSchema = z.string().datetime({ offset: true });
const versionSchema = z.string().trim().min(1).max(160);

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const packSchema = z.enum(["scalping", "day", "swing", "long-term"]);
export type EvidenceLabPack = z.infer<typeof packSchema>;

export const packHorizonSchema = z.discriminatedUnion("pack", [
  z
    .object({
      pack: z.literal("scalping"),
      horizon: z.enum(["10s", "30s", "45s", "60s", "300s"]),
    })
    .strict(),
  z
    .object({
      pack: z.literal("day"),
      horizon: z.enum(["15m", "60m", "120m", "240m", "session-close"]),
    })
    .strict(),
  z
    .object({
      pack: z.literal("swing"),
      horizon: z.enum(["2d", "5d", "10d", "15d"]),
    })
    .strict(),
  z
    .object({
      pack: z.literal("long-term"),
      horizon: z.enum(["180d", "365d", "730d"]),
    })
    .strict(),
]);

export const packProfileSchema = z.discriminatedUnion("pack", [
  z
    .object({
      pack: z.literal("scalping"),
      version: versionSchema,
      horizons: z
        .array(z.enum(["10s", "30s", "45s", "60s", "300s"]))
        .min(1)
        .default(["10s", "30s", "45s", "60s", "300s"]),
    })
    .strict(),
  z
    .object({
      pack: z.literal("day"),
      version: versionSchema,
      horizons: z
        .array(z.enum(["15m", "60m", "120m", "240m", "session-close"]))
        .min(1)
        .default(["15m", "60m", "120m", "240m", "session-close"]),
    })
    .strict(),
  z
    .object({
      pack: z.literal("swing"),
      version: versionSchema,
      horizons: z
        .array(z.enum(["2d", "5d", "10d", "15d"]))
        .min(1)
        .default(["2d", "5d", "10d", "15d"]),
    })
    .strict(),
  z
    .object({
      pack: z.literal("long-term"),
      version: versionSchema,
      horizons: z
        .array(z.enum(["180d", "365d", "730d"]))
        .min(1)
        .default(["180d", "365d", "730d"]),
    })
    .strict(),
]);
export type PackProfile = z.infer<typeof packProfileSchema>;

export const shortTermStanceSchema = z.enum(["LONG", "SHORT", "WAIT"]);
export const longTermStanceSchema = z.enum([
  "ACCUMULATE",
  "MAINTAIN",
  "DEACCUMULATE",
  "WAIT",
]);
export const evidenceLabStanceSchema = z.union([
  shortTermStanceSchema,
  longTermStanceSchema,
]);

export function stanceForPackSchema(pack: EvidenceLabPack) {
  return pack === "long-term" ? longTermStanceSchema : shortTermStanceSchema;
}

export const shortTermActionSchema = z.enum([
  "OPEN_LONG",
  "OPEN_SHORT",
  "HOLD",
  "REDUCE",
  "CLOSE",
  "WAIT",
]);
export const longTermActionSchema = z.enum([
  "BUY",
  "HOLD",
  "REDUCE",
  "EXIT",
  "WAIT",
]);
export const evidenceLabActionSchema = z.union([
  shortTermActionSchema,
  longTermActionSchema,
]);

export function actionForPackSchema(pack: EvidenceLabPack) {
  return pack === "long-term" ? longTermActionSchema : shortTermActionSchema;
}

export const forecastDistributionSchema = z
  .object({
    up: z.number().finite().min(0).max(1),
    flat: z.number().finite().min(0).max(1),
    down: z.number().finite().min(0).max(1),
  })
  .strict()
  .superRefine((distribution, ctx) => {
    const total = distribution.up + distribution.flat + distribution.down;
    if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        message: "directional probabilities must sum to one",
      });
    }
  });

export const sourceRevisionSchema = z
  .object({
    id: identifierSchema,
    sourceId: identifierSchema,
    revision: identifierSchema,
    sourceHash: hashSchema,
    payloadHash: hashSchema,
    publishedAt: timestampSchema,
    effectiveAt: timestampSchema,
    ingestedAt: timestampSchema,
    availableAt: timestampSchema,
    correctionAt: timestampSchema.nullable().default(null),
    supersedesSourceRevisionId: identifierSchema.nullable().default(null),
    disclosureClass: z
      .enum(["PUBLIC", "PROTECTED", "LICENSED"])
      .default("PROTECTED"),
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict()
  .superRefine((source, ctx) => {
    if (Date.parse(source.availableAt) < Date.parse(source.publishedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["availableAt"],
        message: "must not precede publication",
      });
    }
    if (
      (source.correctionAt === null) !==
      (source.supersedesSourceRevisionId === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "a correction timestamp and predecessor source revision must appear together",
      });
    }
  });
export type SourceRevision = z.infer<typeof sourceRevisionSchema>;

export const evidenceStateSchema = z
  .object({
    id: identifierSchema,
    pack: packSchema,
    cutoffAt: timestampSchema,
    sourceRevisionIds: z.array(identifierSchema).min(1),
    admissionManifestHash: hashSchema,
    normalizedState: jsonValueSchema,
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict();
export type EvidenceState = z.infer<typeof evidenceStateSchema>;

export const registryEntrySchema = z
  .object({
    id: identifierSchema,
    kind: z.enum([
      "PACK",
      "FEATURE",
      "PROMPT",
      "MODEL",
      "POLICY",
      "EXECUTION",
      "OUTCOME",
      "BASELINE",
      "METRIC",
      "COHORT",
    ]),
    version: versionSchema,
    payload: jsonValueSchema,
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict();
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

export const registryEventSchema = z
  .object({
    id: identifierSchema,
    registryEntryId: identifierSchema,
    type: z.enum(["DRAFT", "VALIDATED", "APPROVED", "RETIRED"]),
    reason: z.string().trim().min(1).max(500).nullable().default(null),
    effectiveAt: timestampSchema,
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict();
export type RegistryEvent = z.infer<typeof registryEventSchema>;

export const versionTupleSchema = z
  .object({
    packProfile: versionSchema,
    model: versionSchema,
    prompt: versionSchema,
    feature: versionSchema,
    policy: versionSchema,
    execution: versionSchema,
    costScenario: versionSchema,
    outcome: versionSchema,
    baseline: versionSchema,
    metric: versionSchema,
    build: versionSchema,
  })
  .strict();
export type VersionTuple = z.infer<typeof versionTupleSchema>;

export const cohortSchema = z
  .object({
    id: identifierSchema,
    pack: packSchema,
    mode: z.enum(["fixture", "replay", "prospective"]),
    versions: versionTupleSchema,
    status: z.enum([
      "DRAFT",
      "VALIDATED",
      "APPROVED",
      "ACTIVE",
      "PAUSED",
      "CLOSED",
    ]),
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict();
export type Cohort = z.infer<typeof cohortSchema>;

export const cohortEventSchema = z
  .object({
    id: identifierSchema,
    cohortId: identifierSchema,
    type: z.enum([
      "VALIDATED",
      "APPROVED",
      "ACTIVE",
      "PAUSED",
      "CLOSED",
      "CORRECTION",
    ]),
    effectiveAt: timestampSchema,
    predecessorEventId: identifierSchema.nullable().default(null),
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict();
export type CohortEvent = z.infer<typeof cohortEventSchema>;
export type CohortEventInput = z.input<typeof cohortEventSchema>;

export const publicationReceiptSchema = z
  .object({
    id: identifierSchema,
    batchId: identifierSchema,
    sink: identifierSchema,
    rootHash: hashSchema,
    submittedAt: timestampSchema,
    receivedAt: timestampSchema,
    deadlineAt: timestampSchema,
    status: z.enum(["TIMELY", "LATE", "MISSING", "FAILED"]),
    receiptPayloadHash: hashSchema,
    canonicalPayload: z.string().min(1),
    contentHash: hashSchema,
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const submittedAt = Date.parse(receipt.submittedAt);
    const receivedAt = Date.parse(receipt.receivedAt);
    const deadlineAt = Date.parse(receipt.deadlineAt);
    if (submittedAt > deadlineAt || receivedAt > deadlineAt) {
      ctx.addIssue({
        code: "custom",
        message:
          "a timely receipt must be submitted and received by its deadline",
      });
    }
    if (receipt.status !== "TIMELY") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message:
          "fixture-safe authoritative receipts must be explicitly timely",
      });
    }
  });
export type PublicationReceipt = z.infer<typeof publicationReceiptSchema>;

/** Interfaces owned by later units. U5 defines the wire grammar only, not storage. */
export const futureRunSchema = z
  .object({
    id: identifierSchema,
    cohortId: identifierSchema,
    evidenceStateHash: hashSchema,
    cutoffAt: timestampSchema,
    mode: z.enum(["fixture", "replay", "prospective"]),
    versions: versionTupleSchema,
  })
  .strict();
export type FutureRun = z.infer<typeof futureRunSchema>;

export const futureArmOutputSchema = z
  .object({
    id: identifierSchema,
    runId: identifierSchema,
    pack: packSchema,
    arm: z.enum(["standard-tools", "jev", "full-jev-trade", "naive"]),
    evidenceStateHash: hashSchema,
    policyApplicability: z.enum(["APPLICABLE", "NOT_APPLICABLE"]),
    distribution: forecastDistributionSchema,
    stance: evidenceLabStanceSchema,
    action: evidenceLabActionSchema.optional(),
  })
  .strict()
  .superRefine((output, ctx) => {
    if (!stanceForPackSchema(output.pack).safeParse(output.stance).success) {
      ctx.addIssue({
        code: "custom",
        path: ["stance"],
        message: "stance is not permitted for this pack",
      });
    }
    if (
      output.action !== undefined &&
      !actionForPackSchema(output.pack).safeParse(output.action).success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["action"],
        message: "action is not permitted for this pack",
      });
    }
    if (
      output.policyApplicability === "NOT_APPLICABLE" &&
      output.action !== undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["action"],
        message: "an inapplicable policy must not receive an action",
      });
    }
  });
export type FutureArmOutput = z.infer<typeof futureArmOutputSchema>;

export const futureOutcomeSchema = z
  .object({
    id: identifierSchema,
    runId: identifierSchema,
    state: z.enum([
      "UNRESOLVED",
      "UNAVAILABLE",
      "ADJUSTED",
      "VOID",
      "RESOLVED",
    ]),
    ruleVersion: versionSchema,
    correctionOfOutcomeId: identifierSchema.nullable().default(null),
  })
  .strict();
export type FutureOutcome = z.infer<typeof futureOutcomeSchema>;

export function computeEvidenceLabContentHash(
  kind:
    | "registry_entry"
    | "registry_event"
    | "cohort_event"
    | "source_revision"
    | "evidence_state"
    | "cohort"
    | "publication_receipt"
    | "operator_audit_event",
  payload: JsonValue,
): { readonly canonicalPayload: string; readonly contentHash: string } {
  const canonicalPayload = canonicalJson({
    recipe: EVIDENCE_LAB_HASH_RECIPE,
    kind,
    payload,
  });
  return { canonicalPayload, contentHash: sha256Text(canonicalPayload) };
}

const protectedProjectionKey =
  /(?:api_?key|authorization|credential|cookie|headers?|password|secret|token|raw_?licensed(?:_?payload)?|licensed_?payload|protected_?prompt|raw_?prompt)/i;

/** Removes data classes that cannot cross a public or protected projection boundary. */
export function safeEvidenceProjection(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(safeEvidenceProjection);
  if (typeof value !== "object") return null;

  const projection: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (protectedProjectionKey.test(key)) continue;
    projection[key] = safeEvidenceProjection(child);
  }
  return projection;
}
