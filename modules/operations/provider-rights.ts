import type { ProcessorTerms, ProviderRights } from "../ledger/types";

export type PublicModeBlocker =
  "PROVIDER_RIGHTS_MISSING" | "PROCESSOR_TERMS_MISSING";

export interface PublicModeGateResult {
  readonly allowed: boolean;
  readonly blockers: readonly PublicModeBlocker[];
}

function isEffective(
  record: { readonly effectiveFrom: string; readonly effectiveTo?: string },
  at: string,
): boolean {
  const instant = Date.parse(at);
  const from = Date.parse(record.effectiveFrom);
  const to =
    record.effectiveTo === undefined
      ? undefined
      : Date.parse(record.effectiveTo);
  return (
    Number.isFinite(instant) &&
    from <= instant &&
    (to === undefined || instant < to)
  );
}

function isCompleteProviderRight(record: ProviderRights): boolean {
  return (
    record.audience === "public" &&
    record.planOrContract.length > 0 &&
    record.permittedFields.length > 0 &&
    record.retention.length > 0 &&
    record.attribution.length > 0 &&
    record.derivedOutputs &&
    record.screenshotsAndVideo &&
    record.onwardAiProcessing &&
    record.reviewedBy.length > 0
  );
}

function isCompleteProcessorTerm(record: ProcessorTerms): boolean {
  return (
    record.retention.length > 0 &&
    record.training.length > 0 &&
    record.residency.length > 0 &&
    record.deletion.length > 0 &&
    record.reviewedBy.length > 0
  );
}

export function evaluatePublicModeGate(input: {
  readonly at: string;
  readonly providerRights: readonly ProviderRights[];
  readonly processorTerms: readonly ProcessorTerms[];
}): PublicModeGateResult {
  const blockers: PublicModeBlocker[] = [];
  if (
    !input.providerRights.some(
      (record) =>
        isEffective(record, input.at) && isCompleteProviderRight(record),
    )
  ) {
    blockers.push("PROVIDER_RIGHTS_MISSING");
  }
  if (
    !input.processorTerms.some(
      (record) =>
        isEffective(record, input.at) && isCompleteProcessorTerm(record),
    )
  ) {
    blockers.push("PROCESSOR_TERMS_MISSING");
  }
  return { allowed: blockers.length === 0, blockers };
}
