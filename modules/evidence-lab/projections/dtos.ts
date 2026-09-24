import { z } from "zod";

import type { EvidenceLabErrorCode } from "../errors";
import type { CohortFields, CohortLifecycleStatus } from "../model/cohorts";
import type { SealedRecord } from "../model/hashing";
import {
  hashSchema,
  identifierSchema,
  modeSchema,
  packSchema,
  symbolSchema,
  timestampSchema,
  type EvidenceLabMode,
} from "../model/primitives";
import { COMPARISON_ARMS, sourceKindSchema } from "../model/packs";
import type { ReceiptAuthority } from "../model/receipts";
import { REGISTRY_SLOT_NAMES } from "../model/registry";
import type {
  EvidenceStateFields,
  SourceRevisionFields,
} from "../model/sources";
import { assertSafeProjection, type ProjectionGuardOptions } from "./guard";

export const EVIDENCE_LAB_DTO_VERSION = "evidence-lab-dto/v1" as const;

/** P2-R10: replay and fixture evidence is always labeled exploratory. */
export type EvidenceClass = "EXPLORATORY" | "PROSPECTIVE_UNATTESTED";

export function evidenceClass(mode: EvidenceLabMode): EvidenceClass {
  return mode === "prospective" ? "PROSPECTIVE_UNATTESTED" : "EXPLORATORY";
}

const evidenceClassSchema = z.enum(["EXPLORATORY", "PROSPECTIVE_UNATTESTED"]);

// Protected research projection: cohort ------------------------------------

export const protectedCohortDtoSchema = z
  .object({
    dtoVersion: z.literal(EVIDENCE_LAB_DTO_VERSION),
    id: identifierSchema,
    pack: packSchema,
    mode: modeSchema,
    evidenceClass: evidenceClassSchema,
    cohortVersion: z.number().int().positive(),
    predecessorCohortId: identifierSchema.nullable(),
    contentHash: hashSchema,
    registryRootHash: hashSchema,
    lifecycleStatus: z.enum([
      "DRAFT",
      "VALIDATED",
      "APPROVED",
      "ACTIVATION_PENDING",
      "ACTIVE",
      "PAUSED",
      "CLOSED",
    ]),
    firstForecastLocked: z.boolean(),
    horizons: z.array(z.string()),
    arms: z.array(z.enum(COMPARISON_ARMS)),
    universe: z
      .object({
        symbolCount: z.number().int().positive(),
        snapshotHash: hashSchema,
      })
      .strict(),
    minimumEvidence: z
      .object({
        resolvedForecasts: z.number().int(),
        symbols: z.number().int(),
        resolvedPerHorizon: z.number().int(),
        clusters: z.number().int(),
      })
      .strict(),
    registry: z.array(
      z
        .object({
          slot: z.enum(REGISTRY_SLOT_NAMES as [string, ...string[]]),
          entryId: identifierSchema,
          contentHash: hashSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type ProtectedCohortDto = z.infer<typeof protectedCohortDtoSchema>;

export function projectProtectedCohort(
  cohort: SealedRecord<CohortFields>,
  state: {
    readonly lifecycleStatus: CohortLifecycleStatus;
    readonly firstForecastLocked: boolean;
  },
  options: ProjectionGuardOptions = {},
): ProtectedCohortDto {
  const dto = protectedCohortDtoSchema.parse({
    dtoVersion: EVIDENCE_LAB_DTO_VERSION,
    id: cohort.id,
    pack: cohort.pack,
    mode: cohort.mode,
    evidenceClass: evidenceClass(cohort.mode),
    cohortVersion: cohort.cohortVersion,
    predecessorCohortId: cohort.predecessorCohortId,
    contentHash: cohort.contentHash,
    registryRootHash: cohort.registryRootHash,
    lifecycleStatus: state.lifecycleStatus,
    firstForecastLocked: state.firstForecastLocked,
    horizons: [...cohort.methodology.horizons],
    arms: [...cohort.methodology.arms],
    universe: {
      symbolCount: cohort.methodology.universe.symbols.length,
      snapshotHash: cohort.methodology.universe.snapshotHash,
    },
    minimumEvidence: { ...cohort.methodology.minimumEvidence },
    registry: REGISTRY_SLOT_NAMES.map((slot) => ({
      slot,
      entryId: cohort.registryTuple[slot].entryId,
      contentHash: cohort.registryTuple[slot].contentHash,
    })),
  });
  return assertSafeProjection(dto, options);
}

// Public projection: evidence state -----------------------------------------

export const publicEvidenceStateDtoSchema = z
  .object({
    dtoVersion: z.literal(EVIDENCE_LAB_DTO_VERSION),
    id: identifierSchema,
    pack: packSchema,
    evidenceClass: evidenceClassSchema,
    subject: symbolSchema,
    cutoffAt: timestampSchema,
    contentHash: hashSchema,
    admissionManifestHash: hashSchema,
    normalizedStateHash: hashSchema,
    predecessorStateId: identifierSchema.nullable(),
    linkKind: z.enum(["REASSESSMENT", "CORRECTION"]).nullable(),
    sources: z.array(
      z
        .object({
          sourceRevisionId: identifierSchema,
          sourceKind: sourceKindSchema,
          publishedAt: timestampSchema,
          effectiveAt: timestampSchema,
          availableAt: timestampSchema,
          correctionAt: timestampSchema.nullable(),
          supersedesRevisionId: identifierSchema.nullable(),
        })
        .strict(),
    ),
    withheldSourceCount: z.number().int().min(0),
  })
  .strict();
export type PublicEvidenceStateDto = z.infer<
  typeof publicEvidenceStateDtoSchema
>;

/**
 * Public view of an evidence state: timestamps and hashes of PUBLIC sources
 * only. The normalized state itself, payload hashes, and any PROTECTED or
 * LICENSED source metadata are withheld.
 */
export function projectPublicEvidenceState(
  state: SealedRecord<EvidenceStateFields>,
  sources: ReadonlyMap<string, SealedRecord<SourceRevisionFields>>,
  options: ProjectionGuardOptions = {},
): PublicEvidenceStateDto {
  const admitted = state.admissions.map((admission) => {
    const source = sources.get(admission.sourceRevisionId);
    if (!source || source.contentHash !== admission.sourceContentHash) {
      throw new RangeError(
        "projection requires every admitted source revision",
      );
    }
    return source;
  });
  const visible = admitted.filter(
    (source) => source.disclosureClass === "PUBLIC",
  );
  const dto = publicEvidenceStateDtoSchema.parse({
    dtoVersion: EVIDENCE_LAB_DTO_VERSION,
    id: state.id,
    pack: state.pack,
    evidenceClass: evidenceClass(state.mode),
    subject: state.subject,
    cutoffAt: state.cutoffAt,
    contentHash: state.contentHash,
    admissionManifestHash: state.admissionManifestHash,
    normalizedStateHash: state.normalizedStateHash,
    predecessorStateId: state.predecessorStateId,
    linkKind: state.linkKind,
    sources: visible.map((source) => ({
      sourceRevisionId: source.id,
      sourceKind: source.sourceKind,
      publishedAt: source.publishedAt,
      effectiveAt: source.effectiveAt,
      availableAt: source.availableAt,
      correctionAt: source.correctionAt,
      supersedesRevisionId: source.supersedesRevisionId,
    })),
    withheldSourceCount: admitted.length - visible.length,
  });
  return assertSafeProjection(dto, options);
}

// Receipt status -------------------------------------------------------------

export const receiptStatusDtoSchema = z
  .object({
    dtoVersion: z.literal(EVIDENCE_LAB_DTO_VERSION),
    batchId: identifierSchema,
    rootHash: hashSchema,
    claimedStatus: z.enum(["TIMELY", "LATE", "MISSING", "FAILED"]).nullable(),
    authoritative: z.literal(false),
    blockers: z.array(z.string()).min(1),
  })
  .strict();
export type ReceiptStatusDto = z.infer<typeof receiptStatusDtoSchema>;

export function projectReceiptStatus(
  authority: ReceiptAuthority,
  options: ProjectionGuardOptions = {},
): ReceiptStatusDto {
  const dto = receiptStatusDtoSchema.parse({
    dtoVersion: EVIDENCE_LAB_DTO_VERSION,
    batchId: authority.batchId,
    rootHash: authority.expectedRootHash,
    claimedStatus: authority.claimedStatus,
    authoritative: authority.authoritative,
    blockers: [...authority.blockers],
  });
  return assertSafeProjection(dto, options);
}

// Safe failures --------------------------------------------------------------

const SAFE_FAILURE_MESSAGES: Readonly<Record<EvidenceLabErrorCode, string>> = {
  VALIDATION: "The record does not satisfy the Evidence Lab contract.",
  CONFLICT: "The record conflicts with an existing immutable record.",
  MISSING_REFERENCE: "The record references evidence that does not exist.",
  ILLEGAL_TRANSITION: "The requested lifecycle change is not permitted.",
  GATED: "This capability is held closed by a Phase Two gate.",
  FORBIDDEN: "The caller is not permitted to perform this operation.",
  UNAVAILABLE: "Evidence storage is temporarily unavailable.",
};

export const safeFailureDtoSchema = z
  .object({
    dtoVersion: z.literal(EVIDENCE_LAB_DTO_VERSION),
    code: z.enum(
      Object.keys(SAFE_FAILURE_MESSAGES) as [
        EvidenceLabErrorCode,
        ...EvidenceLabErrorCode[],
      ],
    ),
    message: z.string(),
  })
  .strict();
export type SafeFailureDto = z.infer<typeof safeFailureDtoSchema>;

/** P2-R24 safe failure details: a fixed message per code, never raw error text. */
export function projectSafeFailure(code: EvidenceLabErrorCode): SafeFailureDto {
  return safeFailureDtoSchema.parse({
    dtoVersion: EVIDENCE_LAB_DTO_VERSION,
    code,
    message: SAFE_FAILURE_MESSAGES[code],
  });
}
