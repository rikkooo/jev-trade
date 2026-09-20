import {
  cohortEventSchema,
  cohortSchema,
  computeEvidenceLabContentHash,
  evidenceStateSchema,
  publicationReceiptSchema,
  registryEntrySchema,
  sourceRevisionSchema,
  type Cohort,
  type CohortEvent,
  type CohortEventInput,
  type EvidenceState,
  type PublicationReceipt,
  type RegistryEntry,
  type SourceRevision,
} from "../contracts";
import { cohortStatusAfterEvent } from "../state/transitions";

function assertCanonicalHash(
  kind:
    | "registry_entry"
    | "cohort"
    | "cohort_event"
    | "source_revision"
    | "evidence_state"
    | "publication_receipt",
  value: {
    readonly canonicalPayload: string;
    readonly contentHash: string;
  },
): void {
  const payload = { ...value } as Record<string, unknown>;
  delete payload.canonicalPayload;
  delete payload.contentHash;
  const expected = computeEvidenceLabContentHash(kind, payload as never);
  if (
    expected.canonicalPayload !== value.canonicalPayload ||
    expected.contentHash !== value.contentHash
  ) {
    throw new Error(
      "canonical payload or content hash does not match immutable fields",
    );
  }
}

export interface FixtureEvidenceRegistryOptions {
  readonly now: () => Date;
}

/**
 * A deterministic, fixture-only append-only repository. Production data access
 * is intentionally deferred to the role-specific DAL introduced with later APIs.
 */
export class FixtureEvidenceRegistry {
  readonly #registryEntries = new Map<string, RegistryEntry>();
  readonly #cohorts = new Map<string, Cohort>();
  readonly #cohortStatuses = new Map<string, Cohort["status"]>();
  readonly #cohortEvents = new Map<string, CohortEvent[]>();
  readonly #sourceRevisions = new Map<string, SourceRevision>();
  readonly #evidenceStates = new Map<string, EvidenceState>();
  readonly #publicationReceipts = new Map<string, PublicationReceipt>();
  readonly #forecastLocks = new Map<string, string>();

  constructor(private readonly options: FixtureEvidenceRegistryOptions) {}

  appendRegistryEntry(input: RegistryEntry): RegistryEntry {
    const entry = registryEntrySchema.parse(input);
    assertCanonicalHash("registry_entry", entry);
    const existing = this.#registryEntries.get(entry.id);
    if (existing) {
      if (existing.contentHash !== entry.contentHash) {
        throw new Error("registry entries cannot replace an immutable payload");
      }
      return existing;
    }
    this.#registryEntries.set(entry.id, entry);
    return entry;
  }

  appendCohort(input: Cohort): Cohort {
    const cohort = cohortSchema.parse(input);
    assertCanonicalHash("cohort", cohort);
    const existing = this.#cohorts.get(cohort.id);
    if (existing) {
      if (existing.contentHash !== cohort.contentHash) {
        throw new Error(
          "cohorts cannot replace an immutable methodology tuple",
        );
      }
      return existing;
    }
    this.#cohorts.set(cohort.id, cohort);
    this.#cohortStatuses.set(cohort.id, cohort.status);
    return cohort;
  }

  appendCohortEvent(input: CohortEventInput): CohortEvent {
    const event = cohortEventSchema.parse(input);
    assertCanonicalHash("cohort_event", event);
    const cohort = this.#cohorts.get(event.cohortId);
    if (!cohort) throw new Error("cohort event references an unknown cohort");
    if (this.#forecastLocks.has(cohort.id) && event.type !== "CORRECTION") {
      throw new Error("cohort methodology is locked after its first forecast");
    }
    if (
      event.type === "ACTIVE" &&
      Date.parse(event.effectiveAt) <= this.options.now().getTime()
    ) {
      throw new Error("cohort activation must be future-dated");
    }
    const events = this.#cohortEvents.get(cohort.id) ?? [];
    if (
      event.type === "CORRECTION" &&
      (event.predecessorEventId === null ||
        !events.some((candidate) => candidate.id === event.predecessorEventId))
    ) {
      throw new Error(
        "a cohort correction must link an existing predecessor event",
      );
    }
    if (event.type !== "CORRECTION" && event.predecessorEventId !== null) {
      throw new Error("only correction events may link a predecessor event");
    }
    const currentStatus = this.#cohortStatuses.get(cohort.id) ?? cohort.status;
    const nextStatus = cohortStatusAfterEvent(currentStatus, event.type);
    this.#cohortStatuses.set(cohort.id, nextStatus);
    this.#cohortEvents.set(cohort.id, [...events, event]);
    return event;
  }

  recordFirstForecast(cohortId: string, forecastId: string): void {
    if (!this.#cohorts.has(cohortId))
      throw new Error("forecast references an unknown cohort");
    const existing = this.#forecastLocks.get(cohortId);
    if (existing && existing !== forecastId) {
      throw new Error("first forecast lock is immutable");
    }
    this.#forecastLocks.set(cohortId, forecastId);
  }

  appendSourceRevision(input: SourceRevision): SourceRevision {
    const source = sourceRevisionSchema.parse(input);
    assertCanonicalHash("source_revision", source);
    if (
      source.supersedesSourceRevisionId !== null &&
      !this.#sourceRevisions.has(source.supersedesSourceRevisionId)
    ) {
      throw new Error(
        "source correction references an unknown source revision",
      );
    }
    const superseded =
      source.supersedesSourceRevisionId === null
        ? undefined
        : this.#sourceRevisions.get(source.supersedesSourceRevisionId);
    if (superseded && superseded.sourceId !== source.sourceId) {
      throw new Error("source correction must retain source identity");
    }
    const existing = this.#sourceRevisions.get(source.id);
    if (existing) {
      if (existing.contentHash !== source.contentHash) {
        throw new Error("source revisions cannot replace an immutable payload");
      }
      return existing;
    }
    this.#sourceRevisions.set(source.id, source);
    return source;
  }

  appendEvidenceState(input: EvidenceState): EvidenceState {
    const state = evidenceStateSchema.parse(input);
    assertCanonicalHash("evidence_state", state);
    const cutoff = Date.parse(state.cutoffAt);
    for (const sourceId of state.sourceRevisionIds) {
      const source = this.#sourceRevisions.get(sourceId);
      if (!source)
        throw new Error("evidence state references an unknown source revision");
      if (Date.parse(source.availableAt) > cutoff) {
        throw new Error(
          "source revision was available after the evidence cutoff",
        );
      }
    }
    const existing = this.#evidenceStates.get(state.id);
    if (existing) {
      if (existing.contentHash !== state.contentHash) {
        throw new Error("evidence states cannot replace an immutable payload");
      }
      return existing;
    }
    this.#evidenceStates.set(state.id, state);
    return state;
  }

  appendPublicationReceipt(input: PublicationReceipt): PublicationReceipt {
    const receipt = publicationReceiptSchema.parse(input);
    assertCanonicalHash("publication_receipt", receipt);
    const existing = this.#publicationReceipts.get(receipt.id);
    if (existing) {
      if (existing.contentHash !== receipt.contentHash) {
        throw new Error(
          "publication receipts cannot replace an immutable payload",
        );
      }
      return existing;
    }
    this.#publicationReceipts.set(receipt.id, receipt);
    return receipt;
  }

  sourceRevision(id: string): SourceRevision | undefined {
    return this.#sourceRevisions.get(id);
  }

  sourceRevisions(): readonly SourceRevision[] {
    return [...this.#sourceRevisions.values()];
  }
}
