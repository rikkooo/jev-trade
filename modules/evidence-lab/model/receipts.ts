import { z } from "zod";

import {
  codeSchema,
  epochMs,
  hashSchema,
  identifierSchema,
  sinkIdSchema,
  timestampSchema,
} from "./primitives";

/**
 * A receipt row records what was observed about an independent timestamp
 * sink, never what an operator asserts. Its status is derived, and no status
 * is authoritative until the independent verifier in #30 exists.
 */
export const RECEIPT_OBSERVATIONS = [
  "SINK_RECEIPT",
  "MISSING",
  "SUBMISSION_FAILED",
] as const;

export const receiptObservationFieldsSchema = z
  .object({
    id: identifierSchema,
    batchId: identifierSchema,
    rootHash: hashSchema,
    sinkId: sinkIdSchema,
    observation: z.enum(RECEIPT_OBSERVATIONS),
    deadlineAt: timestampSchema,
    submittedAt: timestampSchema.nullable(),
    sinkTimestamp: timestampSchema.nullable(),
    proofHash: hashSchema.nullable(),
    failureCode: codeSchema.nullable(),
    correctsReceiptId: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["observation"], message });
    switch (receipt.observation) {
      case "SINK_RECEIPT":
        if (
          receipt.submittedAt === null ||
          receipt.sinkTimestamp === null ||
          receipt.proofHash === null ||
          receipt.failureCode !== null
        ) {
          issue(
            "a sink receipt needs submission, sink time, and proof hash only",
          );
        }
        break;
      case "MISSING":
        if (
          receipt.sinkTimestamp !== null ||
          receipt.proofHash !== null ||
          receipt.failureCode !== null
        ) {
          issue(
            "a missing receipt carries no sink time, proof, or failure code",
          );
        }
        break;
      case "SUBMISSION_FAILED":
        if (
          receipt.sinkTimestamp !== null ||
          receipt.proofHash !== null ||
          receipt.failureCode === null
        ) {
          issue("a failed submission carries only its failure code");
        }
        break;
    }
    if (receipt.correctsReceiptId === receipt.id) {
      ctx.addIssue({
        code: "custom",
        path: ["correctsReceiptId"],
        message: "a receipt cannot correct itself",
      });
    }
  });
export type ReceiptObservationFields = z.infer<
  typeof receiptObservationFieldsSchema
>;

export type ClaimedReceiptStatus = "TIMELY" | "LATE" | "MISSING" | "FAILED";

/** Mirrors the generated `claimed_status` column; a sink claim, not authority. */
export function claimedReceiptStatus(
  receipt: Pick<
    ReceiptObservationFields,
    "observation" | "sinkTimestamp" | "deadlineAt"
  >,
): ClaimedReceiptStatus {
  switch (receipt.observation) {
    case "SINK_RECEIPT":
      return epochMs(receipt.sinkTimestamp as string) <=
        epochMs(receipt.deadlineAt)
        ? "TIMELY"
        : "LATE";
    case "MISSING":
      return "MISSING";
    case "SUBMISSION_FAILED":
      return "FAILED";
  }
}

export type ReceiptAuthorityBlocker =
  | "NO_RECEIPT_OBSERVATION"
  | "RECEIPT_LATE"
  | "RECEIPT_MISSING"
  | "RECEIPT_FAILED"
  | "ROOT_MISMATCH"
  | "INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE";

export interface ReceiptAuthority {
  readonly batchId: string;
  readonly expectedRootHash: string;
  readonly latestReceiptId: string | null;
  readonly claimedStatus: ClaimedReceiptStatus | null;
  readonly authoritative: false;
  readonly blockers: readonly ReceiptAuthorityBlocker[];
}

/**
 * P2-R57 and KTD15: a prospective batch is authoritative only with a timely
 * receipt that an independent verifier has checked against the published
 * root. That verifier is #30; until it lands, every batch stays
 * non-authoritative and remains visible as unattested coverage.
 */
export function evaluateReceiptAuthority(
  batchId: string,
  expectedRootHash: string,
  chain: readonly ReceiptObservationFields[],
): ReceiptAuthority {
  const latest = chain.at(-1) ?? null;
  const blockers: ReceiptAuthorityBlocker[] = [];
  let claimedStatus: ClaimedReceiptStatus | null = null;
  if (latest === null) {
    blockers.push("NO_RECEIPT_OBSERVATION");
  } else {
    claimedStatus = claimedReceiptStatus(latest);
    if (claimedStatus !== "TIMELY") blockers.push(`RECEIPT_${claimedStatus}`);
    if (chain.some((receipt) => receipt.rootHash !== expectedRootHash)) {
      blockers.push("ROOT_MISMATCH");
    }
  }
  blockers.push("INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE");
  return {
    batchId,
    expectedRootHash,
    latestReceiptId: latest?.id ?? null,
    claimedStatus,
    authoritative: false,
    blockers,
  };
}
