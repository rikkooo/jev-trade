import { z } from "zod";

import {
  hashSchema,
  identifierSchema,
  isStrictlySorted,
  modeSchema,
  packSchema,
  reasonSchema,
  symbolSchema,
  timestampSchema,
} from "./primitives";
import { COMPARISON_ARMS, methodologyItemSchema } from "./packs";
import { REGISTRY_SLOTS, type RegistrySlot } from "./registry";

export const COHORT_METHODOLOGY_SCHEMA =
  "jev-evidence-lab-cohort-methodology/v1" as const;

/** P2-R45 floor. A prospective cohort cannot preregister anything weaker. */
export const PROSPECTIVE_EVIDENCE_FLOOR = {
  resolvedForecasts: 100,
  symbols: 20,
  resolvedPerHorizon: 20,
  clusters: 20,
} as const;

export const registryReferenceSchema = z
  .object({ entryId: identifierSchema, contentHash: hashSchema })
  .strict();
export type RegistryReference = z.infer<typeof registryReferenceSchema>;

export const registryTupleSchema = z
  .object(
    Object.fromEntries(
      Object.keys(REGISTRY_SLOTS).map((slot) => [
        slot,
        registryReferenceSchema,
      ]),
    ) as Record<RegistrySlot, typeof registryReferenceSchema>,
  )
  .strict();
export type RegistryTuple = Record<RegistrySlot, RegistryReference>;

const positiveInteger = z.number().int().min(1).max(2_147_483_647);

/** P2-R11: everything frozen before the first forecast. */
export const cohortMethodologySchema = z
  .object({
    schema: z.literal(COHORT_METHODOLOGY_SCHEMA),
    horizons: z.array(z.string()).min(1),
    universe: z
      .object({
        symbols: z.array(symbolSchema).min(1),
        snapshotHash: hashSchema,
      })
      .strict(),
    arms: z
      .array(z.enum(COMPARISON_ARMS))
      .refine(
        (arms) =>
          arms.length === COMPARISON_ARMS.length &&
          arms.every((arm, index) => arm === COMPARISON_ARMS[index]),
        { message: "a cohort declares exactly the four comparison arms" },
      ),
    eligibilityRules: z.array(methodologyItemSchema).min(1),
    exclusions: z.array(
      z.object({ symbol: symbolSchema, reason: reasonSchema }).strict(),
    ),
    voidRules: z.array(methodologyItemSchema).min(1),
    primaryMetrics: z.array(identifierSchema).min(1),
    minimumEvidence: z
      .object({
        resolvedForecasts: positiveInteger,
        symbols: positiveInteger,
        resolvedPerHorizon: positiveInteger,
        clusters: positiveInteger,
      })
      .strict(),
    stopRules: z.array(methodologyItemSchema).min(1),
    cadence: z
      .object({
        kind: z.enum(["SCHEDULED", "EVENT_DRIVEN"]),
        minimumIntervalSeconds: positiveInteger,
      })
      .strict(),
    budget: z
      .object({
        maxRunsPerDay: positiveInteger,
        maxModelCallsPerDay: z.number().int().min(0).max(2_147_483_647),
      })
      .strict(),
    seeds: z
      .object({ naiveControl: z.number().int().min(0).max(2_147_483_647) })
      .strict(),
  })
  .strict()
  .superRefine((methodology, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (new Set(methodology.horizons).size !== methodology.horizons.length) {
      issue(["horizons"], "horizons must be unique");
    }
    if (!isStrictlySorted(methodology.universe.symbols)) {
      issue(["universe", "symbols"], "symbols must be unique and sorted");
    }
    for (const exclusion of methodology.exclusions) {
      if (!methodology.universe.symbols.includes(exclusion.symbol)) {
        issue(["exclusions"], "an exclusion must name a universe symbol");
      }
    }
    for (const key of ["eligibilityRules", "voidRules", "stopRules"] as const) {
      if (!isStrictlySorted(methodology[key].map((rule) => rule.id))) {
        issue([key], "rule ids must be unique and sorted");
      }
    }
    if (!isStrictlySorted(methodology.primaryMetrics)) {
      issue(["primaryMetrics"], "metric ids must be unique and sorted");
    }
  });
export type CohortMethodology = z.infer<typeof cohortMethodologySchema>;

export const cohortFieldsSchema = z
  .object({
    id: identifierSchema,
    pack: packSchema,
    mode: modeSchema,
    cohortVersion: positiveInteger,
    predecessorCohortId: identifierSchema.nullable(),
    registryTuple: registryTupleSchema,
    registryRootHash: hashSchema,
    methodology: cohortMethodologySchema,
  })
  .strict()
  .superRefine((cohort, ctx) => {
    if (
      (cohort.cohortVersion === 1) !==
      (cohort.predecessorCohortId === null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["predecessorCohortId"],
        message: "only version 1 of a cohort has no predecessor",
      });
    }
    if (cohort.mode === "prospective") {
      for (const [key, floor] of Object.entries(PROSPECTIVE_EVIDENCE_FLOOR)) {
        const value =
          cohort.methodology.minimumEvidence[
            key as keyof typeof PROSPECTIVE_EVIDENCE_FLOOR
          ];
        if (value < floor) {
          ctx.addIssue({
            code: "custom",
            path: ["methodology", "minimumEvidence", key],
            message: `a prospective cohort requires at least ${floor}`,
          });
        }
      }
    }
  });
export type CohortFields = z.infer<typeof cohortFieldsSchema>;

export const COHORT_EVENT_TYPES = [
  "VALIDATED",
  "APPROVED",
  "ACTIVATION_SCHEDULED",
  "PAUSED",
  "CLOSED",
  "CORRECTION",
] as const;
export type CohortEventType = (typeof COHORT_EVENT_TYPES)[number];

export const cohortEventFieldsSchema = z
  .object({
    id: identifierSchema,
    cohortId: identifierSchema,
    eventType: z.enum(COHORT_EVENT_TYPES),
    reason: reasonSchema,
    scheduledEffectiveAt: timestampSchema.nullable(),
    correctsEventId: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (
      (event.eventType === "ACTIVATION_SCHEDULED") !==
      (event.scheduledEffectiveAt !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledEffectiveAt"],
        message: "only an activation is scheduled, and it always is",
      });
    }
    if (
      (event.eventType === "CORRECTION") !==
      (event.correctsEventId !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["correctsEventId"],
        message: "only a correction links the event it corrects",
      });
    }
  });
export type CohortEventFields = z.infer<typeof cohortEventFieldsSchema>;

export const cohortForecastLockFieldsSchema = z
  .object({
    id: identifierSchema,
    cohortId: identifierSchema,
    firstForecastRef: identifierSchema,
    lockedRegistryRootHash: hashSchema,
    reason: reasonSchema,
  })
  .strict();
export type CohortForecastLockFields = z.infer<
  typeof cohortForecastLockFieldsSchema
>;

export type CohortLifecycleStatus =
  | "DRAFT"
  | "VALIDATED"
  | "APPROVED"
  | "ACTIVATION_PENDING"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED";

type LifecycleEvent = Exclude<CohortEventType, "CORRECTION">;

export const COHORT_TRANSITIONS: Readonly<
  Record<CohortLifecycleStatus, readonly LifecycleEvent[]>
> = {
  DRAFT: ["VALIDATED", "CLOSED"],
  VALIDATED: ["APPROVED", "CLOSED"],
  APPROVED: ["ACTIVATION_SCHEDULED", "CLOSED"],
  ACTIVATION_PENDING: ["PAUSED", "CLOSED"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVATION_SCHEDULED", "CLOSED"],
  CLOSED: [],
};

/** Whether a cohort in `status` may record its first forecast. */
export function canAcceptFirstForecast(
  mode: z.infer<typeof modeSchema>,
  status: CohortLifecycleStatus,
): boolean {
  return (
    status === "ACTIVE" ||
    (mode !== "prospective" &&
      (status === "VALIDATED" || status === "APPROVED"))
  );
}
