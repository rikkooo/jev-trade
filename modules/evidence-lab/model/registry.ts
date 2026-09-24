import { createHash } from "node:crypto";

import { z } from "zod";

import {
  codeSchema,
  hashSchema,
  idempotencyKeySchema,
  identifierSchema,
  jsonObjectSchema,
  packSchema,
  reasonSchema,
  reviewReferenceSchema,
  versionSchema,
} from "./primitives";
import { costScenarioPayloadSchema, packProfileSchema } from "./packs";

export const REGISTRY_KINDS = [
  "PACK_PROFILE",
  "FEATURE",
  "PROMPT",
  "MODEL",
  "RISK",
  "POLICY",
  "EXECUTION",
  "COST_SCENARIO",
  "OUTCOME",
  "BASELINE",
  "METRIC",
] as const;
export const registryKindSchema = z.enum(REGISTRY_KINDS);
export type RegistryKind = z.infer<typeof registryKindSchema>;

/** Cohort methodology slots and the registry kind each must reference. */
export const REGISTRY_SLOTS = {
  packProfile: "PACK_PROFILE",
  feature: "FEATURE",
  prompt: "PROMPT",
  model: "MODEL",
  risk: "RISK",
  policy: "POLICY",
  execution: "EXECUTION",
  costScenarios: "COST_SCENARIO",
  outcome: "OUTCOME",
  baseline: "BASELINE",
  metric: "METRIC",
} as const satisfies Record<string, RegistryKind>;
export type RegistrySlot = keyof typeof REGISTRY_SLOTS;
export const REGISTRY_SLOT_NAMES = Object.keys(
  REGISTRY_SLOTS,
) as RegistrySlot[];

/** Payload grammar for kinds whose later owner has not yet specialized it. */
const genericRegistryPayloadSchema = jsonObjectSchema.refine(
  (payload) =>
    typeof payload.schema === "string" &&
    /^jev-evidence-lab-[a-z0-9-]+\/v[0-9]+$/.test(payload.schema),
  { message: "registry payload must name its versioned schema" },
);

export const registryEntryFieldsSchema = z
  .object({
    id: identifierSchema,
    kind: registryKindSchema,
    version: versionSchema,
    pack: packSchema.nullable(),
    supersedesEntryId: identifierSchema.nullable(),
    payload: jsonObjectSchema,
  })
  .strict()
  .superRefine((entry, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (entry.supersedesEntryId === entry.id) {
      issue(["supersedesEntryId"], "an entry cannot supersede itself");
    }
    const payloadSchema =
      entry.kind === "PACK_PROFILE"
        ? packProfileSchema
        : entry.kind === "COST_SCENARIO"
          ? costScenarioPayloadSchema
          : genericRegistryPayloadSchema;
    const parsed = payloadSchema.safeParse(entry.payload);
    if (!parsed.success) {
      for (const payloadIssue of parsed.error.issues) {
        issue(
          ["payload", ...payloadIssue.path.map(String)],
          payloadIssue.message,
        );
      }
    }
    if (entry.kind === "PACK_PROFILE" || entry.kind === "COST_SCENARIO") {
      if (entry.pack === null || entry.payload.pack !== entry.pack) {
        issue(["pack"], "must equal the payload pack");
      }
    }
  });
export type RegistryEntryFields = z.infer<typeof registryEntryFieldsSchema>;

export const REGISTRY_EVENT_TYPES = [
  "VALIDATED",
  "APPROVED",
  "RETIRED",
] as const;
export type RegistryLifecycleStatus =
  "DRAFT" | (typeof REGISTRY_EVENT_TYPES)[number];

export const registryEventFieldsSchema = z
  .object({
    id: identifierSchema,
    registryEntryId: identifierSchema,
    eventType: z.enum(REGISTRY_EVENT_TYPES),
    reason: reasonSchema,
    reviewReference: reviewReferenceSchema.nullable(),
  })
  .strict()
  .refine(
    (event) =>
      (event.eventType === "APPROVED") === (event.reviewReference !== null),
    {
      message: "approval requires a cold review reference, and only approval",
      path: ["reviewReference"],
    },
  );
export type RegistryEventFields = z.infer<typeof registryEventFieldsSchema>;

export const REGISTRY_TRANSITIONS: Readonly<
  Record<
    RegistryLifecycleStatus,
    readonly (typeof REGISTRY_EVENT_TYPES)[number][]
  >
> = {
  DRAFT: ["VALIDATED", "RETIRED"],
  VALIDATED: ["APPROVED", "RETIRED"],
  APPROVED: ["RETIRED"],
  RETIRED: [],
};

// Operator audit -------------------------------------------------------------

export const OPERATOR_COMMANDS = {
  APPEND_REGISTRY_ENTRY: "REGISTRY_ENTRY",
  APPEND_REGISTRY_EVENT: "REGISTRY_EVENT",
  APPEND_COHORT: "COHORT",
  APPEND_COHORT_EVENT: "COHORT_EVENT",
} as const;
export type OperatorCommand = keyof typeof OPERATOR_COMMANDS;
export const operatorCommandSchema = z.enum(
  Object.keys(OPERATOR_COMMANDS) as [OperatorCommand, ...OperatorCommand[]],
);

export const operatorAuditFieldsSchema = z
  .object({
    id: identifierSchema,
    command: operatorCommandSchema,
    outcome: z.enum(["ACCEPTED", "REJECTED"]),
    rejectionCode: codeSchema.nullable(),
    credentialClass: z.literal("OPERATOR_TOKEN"),
    actorFingerprint: hashSchema,
    idempotencyKey: idempotencyKeySchema,
    requestHash: hashSchema,
    targetKind: z.enum([
      "REGISTRY_ENTRY",
      "REGISTRY_EVENT",
      "COHORT",
      "COHORT_EVENT",
    ]),
    targetId: identifierSchema,
  })
  .strict()
  .superRefine((audit, ctx) => {
    if ((audit.outcome === "REJECTED") !== (audit.rejectionCode !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectionCode"],
        message: "only a rejected command carries a rejection code",
      });
    }
    if (OPERATOR_COMMANDS[audit.command] !== audit.targetKind) {
      ctx.addIssue({
        code: "custom",
        path: ["targetKind"],
        message: "target kind does not match the command",
      });
    }
  });
export type OperatorAuditFields = z.infer<typeof operatorAuditFieldsSchema>;

export const OPERATOR_FINGERPRINT_RECIPE =
  "jev-trade-operator-fingerprint/v1" as const;

/**
 * A non-secret, non-reversible actor reference for audit events. The token
 * itself never reaches storage, logs, or projections.
 */
export function operatorFingerprint(operatorToken: string): string {
  if (operatorToken.length < 32) {
    throw new RangeError(
      "operator token is shorter than the configured minimum",
    );
  }
  return createHash("sha256")
    .update(`${OPERATOR_FINGERPRINT_RECIPE}\n${operatorToken}`, "utf8")
    .digest("hex");
}
