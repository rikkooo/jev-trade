import type { ProcessorTerms, ProviderRights } from "../ledger/types";

export type PublicModeBlocker =
  "PROVIDER_RIGHTS_MISSING" | "PROCESSOR_TERMS_MISSING";

export interface PublicModeGateResult {
  readonly allowed: boolean;
  readonly blockers: readonly PublicModeBlocker[];
}

export interface PublicModeRequirements {
  readonly at: string;
  readonly expectedProvider: string;
  readonly expectedProcessor: string;
  readonly requiredFields: readonly string[];
}

export const PUBLIC_JEV_PROCESSOR = "openrouter-jev" as const;
export const PUBLIC_JUDGMENT_TRANSPORT = "openrouter" as const;
export const PUBLIC_MARKET_FIELDS = [
  "daily_ohlcv",
  "corporate_actions",
  "exchange_calendar",
  "structured_events",
] as const;

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

function isCompleteProviderRight(
  record: ProviderRights,
  requirements: PublicModeRequirements,
): boolean {
  const permitted = new Set(record.permittedFields);
  return (
    record.provider === requirements.expectedProvider &&
    record.audience === "public" &&
    record.planOrContract.length > 0 &&
    record.permittedFields.length > 0 &&
    requirements.requiredFields.length > 0 &&
    requirements.requiredFields.every((field) => permitted.has(field)) &&
    record.retention.length > 0 &&
    record.attribution.length > 0 &&
    record.derivedOutputs &&
    record.screenshotsAndVideo &&
    record.onwardAiProcessing &&
    record.reviewedBy.length > 0
  );
}

function isCompleteProcessorTerm(
  record: ProcessorTerms,
  requirements: PublicModeRequirements,
): boolean {
  return (
    record.processor === requirements.expectedProcessor &&
    record.retention.length > 0 &&
    record.training.length > 0 &&
    record.residency.length > 0 &&
    record.deletion.length > 0 &&
    record.reviewedBy.length > 0
  );
}

export function evaluatePublicModeGate(input: {
  readonly requirements: PublicModeRequirements;
  readonly providerRights: readonly ProviderRights[];
  readonly processorTerms: readonly ProcessorTerms[];
}): PublicModeGateResult {
  const blockers: PublicModeBlocker[] = [];
  if (
    !input.providerRights.some(
      (record) =>
        isEffective(record, input.requirements.at) &&
        isCompleteProviderRight(record, input.requirements),
    )
  ) {
    blockers.push("PROVIDER_RIGHTS_MISSING");
  }
  if (
    !input.processorTerms.some(
      (record) =>
        isEffective(record, input.requirements.at) &&
        isCompleteProcessorTerm(record, input.requirements),
    )
  ) {
    blockers.push("PROCESSOR_TERMS_MISSING");
  }
  return { allowed: blockers.length === 0, blockers };
}

/** Public forecast reads derive the market provider from the stored snapshot. */
export function evaluatePublicForecastRead(input: {
  readonly at: string;
  readonly snapshotProvider: string;
  readonly judgmentProvider: string;
  readonly providerRights: readonly ProviderRights[];
  readonly processorTerms: readonly ProcessorTerms[];
}): PublicModeGateResult {
  if (input.judgmentProvider !== PUBLIC_JUDGMENT_TRANSPORT) {
    return { allowed: false, blockers: ["PROCESSOR_TERMS_MISSING"] };
  }
  return evaluatePublicModeGate({
    requirements: {
      at: input.at,
      expectedProvider: input.snapshotProvider,
      expectedProcessor: PUBLIC_JEV_PROCESSOR,
      requiredFields: PUBLIC_MARKET_FIELDS,
    },
    providerRights: input.providerRights,
    processorTerms: input.processorTerms,
  });
}
