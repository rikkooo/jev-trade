import { z } from "zod";

import {
  epochMs,
  hashSchema,
  identifierSchema,
  isStrictlySorted,
  jsonObjectSchema,
  modeSchema,
  packSchema,
  reasonSchema,
  symbolSchema,
  timestampSchema,
} from "./primitives";
import { sourceKindSchema } from "./packs";

/**
 * Origins admitted by this schema version. Licensed replay and live origins
 * require the #14 data-rights gate and a later migration.
 */
export const SOURCE_ORIGINS = ["FIXTURE", "SYNTHETIC"] as const;

export const DISCLOSURE_CLASSES = ["PUBLIC", "PROTECTED", "LICENSED"] as const;

/**
 * P2-R7: publication, effective, ingestion, availability, and correction
 * times stay distinct. The raw payload is never stored here; only its hash.
 */
export const sourceRevisionFieldsSchema = z
  .object({
    id: identifierSchema,
    sourceId: identifierSchema,
    revision: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/),
    sourceKind: sourceKindSchema,
    origin: z.enum(SOURCE_ORIGINS),
    subject: symbolSchema,
    payloadHash: hashSchema,
    disclosureClass: z.enum(DISCLOSURE_CLASSES),
    publishedAt: timestampSchema,
    effectiveAt: timestampSchema,
    ingestedAt: timestampSchema,
    availableAt: timestampSchema,
    correctionAt: timestampSchema.nullable(),
    supersedesRevisionId: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((source, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (epochMs(source.availableAt) < epochMs(source.publishedAt)) {
      issue(["availableAt"], "a source cannot be available before publication");
    }
    if (
      (source.correctionAt === null) !==
      (source.supersedesRevisionId === null)
    ) {
      issue(
        ["correctionAt"],
        "a correction time and its superseded revision appear together",
      );
    }
    if (
      source.correctionAt !== null &&
      epochMs(source.availableAt) < epochMs(source.correctionAt)
    ) {
      issue(
        ["availableAt"],
        "a correction cannot be available before it was issued",
      );
    }
    if (source.supersedesRevisionId === source.id) {
      issue(["supersedesRevisionId"], "a revision cannot supersede itself");
    }
  });
export type SourceRevisionFields = z.infer<typeof sourceRevisionFieldsSchema>;

export const admissionSchema = z
  .object({ sourceRevisionId: identifierSchema, sourceContentHash: hashSchema })
  .strict();
export type Admission = z.infer<typeof admissionSchema>;

export const changeSummarySchema = z
  .object({
    addedSourceRevisionIds: z.array(identifierSchema),
    removedSourceRevisionIds: z.array(identifierSchema),
    reason: reasonSchema,
  })
  .strict()
  .refine(
    (summary) =>
      isStrictlySorted(summary.addedSourceRevisionIds) &&
      isStrictlySorted(summary.removedSourceRevisionIds),
    { message: "changed source ids must be unique and sorted" },
  );
export type ChangeSummary = z.infer<typeof changeSummarySchema>;

/** One eligible normalized state and admission manifest per cutoff. */
export const evidenceStateFieldsSchema = z
  .object({
    id: identifierSchema,
    pack: packSchema,
    mode: modeSchema,
    subject: symbolSchema,
    cutoffAt: timestampSchema,
    admissions: z.array(admissionSchema).min(1),
    admissionManifestHash: hashSchema,
    normalizedState: jsonObjectSchema,
    normalizedStateHash: hashSchema,
    predecessorStateId: identifierSchema.nullable(),
    linkKind: z.enum(["REASSESSMENT", "CORRECTION"]).nullable(),
    changeSummary: changeSummarySchema.nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (
      !isStrictlySorted(state.admissions.map((entry) => entry.sourceRevisionId))
    ) {
      issue(["admissions"], "admissions must be unique and sorted by id");
    }
    if (
      (state.predecessorStateId === null) !== (state.linkKind === null) ||
      (state.linkKind === null) !== (state.changeSummary === null)
    ) {
      issue(
        ["predecessorStateId"],
        "a predecessor, link kind, and change summary appear together",
      );
    }
  });
export type EvidenceStateFields = z.infer<typeof evidenceStateFieldsSchema>;
