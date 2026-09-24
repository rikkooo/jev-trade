/**
 * Shared typed contracts for records that later cards store and serve:
 * prediction provenance, arm outputs, decision links, outcomes, and the run
 * lifecycle. This card defines the grammar only; it adds no table, route, or
 * job for these records.
 */
import { z } from "zod";

import { EvidenceLabError } from "../errors";
import {
  compareCodeUnits,
  epochMs,
  gitShaSchema,
  hashSchema,
  identifierSchema,
  isStrictlySorted,
  modeSchema,
  packSchema,
  reasonSchema,
  symbolSchema,
  timestampSchema,
  versionSchema,
  type EvidenceLabPack,
} from "./primitives";
import {
  NAIVE_CONTROLS,
  OUTCOME_STATES,
  isActionAllowed,
  isStanceAllowed,
  policyActionSchema,
  stanceSchema,
} from "./packs";
import { REGISTRY_SLOTS, type RegistrySlot } from "./registry";
import { changeSummarySchema } from "./sources";

export const PROBABILITY_SUM_TOLERANCE = 1e-6;

/** P2-R17 and P2-AE3: a strict, normalized directional distribution. */
export const directionalDistributionSchema = z
  .object({
    up: z.number().finite().min(0).max(1),
    flat: z.number().finite().min(0).max(1),
    down: z.number().finite().min(0).max(1),
  })
  .strict()
  .refine(
    (distribution) =>
      Math.abs(distribution.up + distribution.flat + distribution.down - 1) <=
      PROBABILITY_SUM_TOLERANCE,
    { message: "directional probabilities must sum to one" },
  );
export type DirectionalDistribution = z.infer<
  typeof directionalDistributionSchema
>;

export const versionedRegistryReferenceSchema = z
  .object({
    entryId: identifierSchema,
    version: versionSchema,
    contentHash: hashSchema,
  })
  .strict();

/**
 * Every version boundary a prediction must carry (P2-R6, KTD10, #15 scope):
 * the eleven registry slots plus the API and build versions.
 */
export const predictionVersionsSchema = z
  .object({
    ...(Object.fromEntries(
      Object.keys(REGISTRY_SLOTS).map((slot) => [
        slot,
        versionedRegistryReferenceSchema,
      ]),
    ) as Record<RegistrySlot, typeof versionedRegistryReferenceSchema>),
    api: z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/),
    build: gitShaSchema,
  })
  .strict();
export type PredictionVersions = z.infer<typeof predictionVersionsSchema>;

export const PREDICTION_PROVENANCE_SCHEMA =
  "jev-evidence-lab-prediction-provenance/v1" as const;

export const eligibleSourceSchema = z
  .object({
    sourceRevisionId: identifierSchema,
    contentHash: hashSchema,
    publishedAt: timestampSchema,
    effectiveAt: timestampSchema,
    ingestedAt: timestampSchema,
    availableAt: timestampSchema,
    correctionAt: timestampSchema.nullable(),
  })
  .strict();

export const predictionProvenanceSchema = z
  .object({
    schema: z.literal(PREDICTION_PROVENANCE_SCHEMA),
    pack: packSchema,
    mode: modeSchema,
    horizon: z.string().min(1),
    subject: symbolSchema,
    cohortId: identifierSchema,
    cohortContentHash: hashSchema,
    registryRootHash: hashSchema,
    cutoffAt: timestampSchema,
    frozenAt: timestampSchema,
    evidenceStateId: identifierSchema,
    evidenceStateHash: hashSchema,
    admissionManifestHash: hashSchema,
    normalizedStateHash: hashSchema,
    sources: z.array(eligibleSourceSchema).min(1),
    versions: predictionVersionsSchema,
  })
  .strict()
  .superRefine((provenance, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const cutoff = epochMs(provenance.cutoffAt);
    if (epochMs(provenance.frozenAt) < cutoff) {
      issue(["frozenAt"], "a state cannot be frozen before its cutoff");
    }
    if (
      !isStrictlySorted(
        provenance.sources.map((source) => source.sourceRevisionId),
      )
    ) {
      issue(["sources"], "sources must be unique and sorted by id");
    }
    provenance.sources.forEach((source, index) => {
      if (epochMs(source.availableAt) > cutoff) {
        issue(
          ["sources", index, "availableAt"],
          "is after the prediction cutoff",
        );
      }
      if (
        provenance.mode === "prospective" &&
        epochMs(source.ingestedAt) > cutoff
      ) {
        issue(
          ["sources", index, "ingestedAt"],
          "a prospective prediction cannot use data ingested after its cutoff",
        );
      }
    });
  });
export type PredictionProvenance = z.infer<typeof predictionProvenanceSchema>;

// Arm outputs ------------------------------------------------------------------

const downstreamVersionsSchema = z
  .object({
    risk: versionedRegistryReferenceSchema,
    policy: versionedRegistryReferenceSchema,
    execution: versionedRegistryReferenceSchema,
    costScenarios: versionedRegistryReferenceSchema,
  })
  .strict();

const shortAvailabilitySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("LOCATED"),
      locateSourceRevisionId: identifierSchema,
      borrowRateBps: z.number().finite().min(0).max(100_000),
    })
    .strict(),
  z
    .object({
      status: z.literal("UNAVAILABLE"),
      locateSourceRevisionId: identifierSchema.nullable(),
    })
    .strict(),
]);

export const policyDecisionContractSchema = z
  .object({
    applicability: z.literal("APPLICABLE"),
    action: policyActionSchema,
    downstream: downstreamVersionsSchema,
    shortAvailability: shortAvailabilitySchema.nullable(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (
      policy.action === "OPEN_SHORT" &&
      policy.shortAvailability?.status !== "LOCATED"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["shortAvailability"],
        message:
          "a short cannot open without a successful locate and borrow cost",
      });
    }
  });

const armBase = {
  runId: identifierSchema,
  pack: packSchema,
  evidenceStateHash: hashSchema,
};

export const armOutputSchema = z
  .discriminatedUnion("arm", [
    z
      .object({
        ...armBase,
        arm: z.literal("standard-tools"),
        distribution: directionalDistributionSchema,
        stance: stanceSchema,
        policy: policyDecisionContractSchema,
      })
      .strict(),
    z
      .object({
        ...armBase,
        arm: z.literal("jev"),
        jevArtifactId: identifierSchema,
        distribution: directionalDistributionSchema,
        stance: stanceSchema,
        policyApplicability: z.literal("NOT_APPLICABLE"),
      })
      .strict(),
    z
      .object({
        ...armBase,
        arm: z.literal("full-jev-trade"),
        jevArtifactId: identifierSchema,
        distribution: directionalDistributionSchema,
        stance: stanceSchema,
        policy: policyDecisionContractSchema,
      })
      .strict(),
    z
      .object({
        ...armBase,
        arm: z.literal("naive-controls"),
        controlRule: z.enum(NAIVE_CONTROLS),
        seed: z.number().int().min(0),
        distribution: directionalDistributionSchema.nullable(),
        policy: policyDecisionContractSchema.nullable(),
      })
      .strict()
      .refine(
        (output) => output.distribution !== null || output.policy !== null,
        {
          message: "a naive control must declare a forecast or a paper action",
        },
      ),
  ])
  .superRefine((output, ctx) => {
    if ("stance" in output && !isStanceAllowed(output.pack, output.stance)) {
      ctx.addIssue({
        code: "custom",
        path: ["stance"],
        message: `${output.stance} is not a ${output.pack} stance`,
      });
    }
    const policy = "policy" in output ? output.policy : null;
    if (policy && !isActionAllowed(output.pack, policy.action)) {
      ctx.addIssue({
        code: "custom",
        path: ["policy", "action"],
        message: `${policy.action} is not a ${output.pack} policy action`,
      });
    }
  });
export type ArmOutput = z.infer<typeof armOutputSchema>;

export type PolicyComparisonLabel = "INCREMENTAL_JEV" | "PRODUCT_BUNDLE";

/**
 * KTD4 and P2-AE15: all four arms share one evidence state and one Jev
 * artifact. The primary policy comparison is isolated only when Standard
 * tools and Full Jev Trade share every downstream version.
 */
export function assertEquivalentArmSet(
  pack: EvidenceLabPack,
  outputs: readonly ArmOutput[],
): { readonly policyComparison: PolicyComparisonLabel } {
  const fail = (message: string): never => {
    throw new EvidenceLabError("VALIDATION", message);
  };
  const byArm = new Map(outputs.map((output) => [output.arm, output]));
  if (outputs.length !== 4 || byArm.size !== 4) {
    fail("a run needs exactly one output for each of the four arms");
  }
  const [first] = outputs;
  for (const output of outputs) {
    armOutputSchema.parse(output);
    if (output.pack !== pack) fail("every arm must belong to the run's pack");
    if (output.runId !== first?.runId) fail("every arm must belong to one run");
    if (output.evidenceStateHash !== first?.evidenceStateHash) {
      fail("every arm must reference the same evidence state");
    }
  }
  const jev = byArm.get("jev");
  const full = byArm.get("full-jev-trade");
  const standard = byArm.get("standard-tools");
  if (
    jev?.arm !== "jev" ||
    full?.arm !== "full-jev-trade" ||
    standard?.arm !== "standard-tools"
  ) {
    return fail("a run needs the standard-tools, jev, and full-jev-trade arms");
  }
  if (jev.jevArtifactId !== full.jevArtifactId) {
    fail("Jev-only and Full Jev Trade must reuse one Jev artifact");
  }
  const same = (
    left: z.infer<typeof versionedRegistryReferenceSchema>,
    right: z.infer<typeof versionedRegistryReferenceSchema>,
  ) => left.entryId === right.entryId && left.contentHash === right.contentHash;
  const isolated = (
    ["risk", "policy", "execution", "costScenarios"] as const
  ).every((key) =>
    same(standard.policy.downstream[key], full.policy.downstream[key]),
  );
  return { policyComparison: isolated ? "INCREMENTAL_JEV" : "PRODUCT_BUNDLE" };
}

// Linked decisions (KTD5) ------------------------------------------------------

export const decisionLinkSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("REASSESSMENT"),
      predecessorId: identifierSchema,
      successorId: identifierSchema,
      changedEvidence: changeSummarySchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum([
        "SOURCE_CORRECTION",
        "OUTCOME_CORRECTION",
        "REPORT_REPLACEMENT",
      ]),
      predecessorId: identifierSchema,
      successorId: identifierSchema,
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("REPAIR"),
      predecessorId: identifierSchema,
      successorId: identifierSchema,
      reason: reasonSchema,
      repairedAt: timestampSchema,
      earliestOutcomeObservableAt: timestampSchema,
    })
    .strict()
    .refine(
      (link) =>
        epochMs(link.repairedAt) < epochMs(link.earliestOutcomeObservableAt),
      {
        message: "a judgment cannot be repaired once its outcome is observable",
      },
    ),
]);
export type DecisionLink = z.infer<typeof decisionLinkSchema>;

// Outcomes -------------------------------------------------------------------

export const outcomeContractSchema = z
  .object({
    id: identifierSchema,
    runId: identifierSchema,
    horizon: z.string().min(1),
    state: z.enum(OUTCOME_STATES),
    rule: versionedRegistryReferenceSchema,
    horizonEndsAt: timestampSchema,
    observation: z
      .object({
        sourceRevisionId: identifierSchema,
        observedAt: timestampSchema,
      })
      .strict()
      .nullable(),
    voidReason: reasonSchema.nullable(),
    correctsOutcomeId: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((outcome, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const resolved =
      outcome.state === "RESOLVED" || outcome.state === "ADJUSTED";
    if (resolved !== (outcome.observation !== null)) {
      issue(
        ["observation"],
        "only resolved or adjusted outcomes cite an observation",
      );
    }
    if (
      outcome.observation &&
      epochMs(outcome.observation.observedAt) < epochMs(outcome.horizonEndsAt)
    ) {
      issue(
        ["observation"],
        "resolution uses the first observation at or after the horizon",
      );
    }
    if ((outcome.state === "VOID") !== (outcome.voidReason !== null)) {
      issue(["voidReason"], "only a void outcome carries a void reason");
    }
  });
export type OutcomeContract = z.infer<typeof outcomeContractSchema>;

// Run lifecycle (KTD8) ---------------------------------------------------------

export const RUN_STATES = [
  "queued",
  "evaluating",
  "published",
  "resolving",
  "resolved",
  "void",
  "failed",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> =
  {
    queued: ["evaluating", "failed"],
    evaluating: ["published", "failed"],
    published: ["resolving"],
    resolving: ["resolved", "void", "failed"],
    resolved: [],
    void: [],
    failed: [],
  };

export function assertRunTransition(from: RunState, to: RunState): void {
  if (!RUN_TRANSITIONS[from].includes(to)) {
    throw new EvidenceLabError(
      "ILLEGAL_TRANSITION",
      `illegal run transition ${from} -> ${to}`,
    );
  }
}

export function sortedCodeUnits(values: readonly string[]): string[] {
  return [...values].sort(compareCodeUnits);
}
