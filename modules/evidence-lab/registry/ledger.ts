import { EvidenceLabError, invalid } from "../errors";
import {
  canAcceptFirstForecast,
  cohortEventFieldsSchema,
  cohortFieldsSchema,
  cohortForecastLockFieldsSchema,
  COHORT_TRANSITIONS,
  type CohortEventFields,
  type CohortFields,
  type CohortForecastLockFields,
  type CohortLifecycleStatus,
} from "../model/cohorts";
import {
  admissionManifestHash,
  commandRequestHash,
  normalizedStateHash,
  registryRootHash,
  type Sealed,
  type SealedRecord,
} from "../model/hashing";
import { canonicalHorizonId, packProfileSchema } from "../model/packs";
import { compareCodeUnits, epochMs } from "../model/primitives";
import {
  claimedReceiptStatus,
  evaluateReceiptAuthority,
  receiptObservationFieldsSchema,
  type ReceiptAuthority,
  type ReceiptObservationFields,
} from "../model/receipts";
import {
  operatorAuditFieldsSchema,
  OPERATOR_COMMANDS,
  REGISTRY_SLOTS,
  REGISTRY_TRANSITIONS,
  registryEntryFieldsSchema,
  registryEventFieldsSchema,
  type OperatorAuditFields,
  type OperatorCommand,
  type RegistryEntryFields,
  type RegistryEventFields,
  type RegistryLifecycleStatus,
  type RegistrySlot,
} from "../model/registry";
import {
  evidenceStateFieldsSchema,
  sourceRevisionFieldsSchema,
  type EvidenceStateFields,
  type SourceRevisionFields,
} from "../model/sources";
import { parseSealed } from "./validation";

export interface AppendResult {
  readonly created: boolean;
  readonly id: string;
}

export interface Stored<T> {
  readonly record: SealedRecord<T>;
  readonly seq: number;
  readonly recordedAt: string;
}

function conflict(message: string): never {
  throw new EvidenceLabError("CONFLICT", message);
}

function missing(message: string): never {
  throw new EvidenceLabError("MISSING_REFERENCE", message);
}

function illegal(message: string): never {
  throw new EvidenceLabError("ILLEGAL_TRANSITION", message);
}

export interface InMemoryEvidenceLabLedgerOptions {
  readonly clock: () => Date;
}

/**
 * A deterministic append-only store that enforces the same invariants as the
 * Phase Two migration. It backs fixture replay and unit tests; runtime roles
 * use the named database procedures in `postgres.ts`.
 */
export class InMemoryEvidenceLabLedger {
  #seq = 0;
  readonly #audits = new Map<string, Stored<OperatorAuditFields>>();
  readonly #registryEntries = new Map<
    string,
    Stored<RegistryEntryFields> & { auditId: string }
  >();
  readonly #registryEvents = new Map<
    string,
    Stored<RegistryEventFields> & { auditId: string }
  >();
  readonly #cohorts = new Map<
    string,
    Stored<CohortFields> & { auditId: string }
  >();
  readonly #cohortEvents = new Map<
    string,
    Stored<CohortEventFields | CohortForecastLockFields> & {
      cohortId: string;
      eventType: CohortEventFields["eventType"] | "FIRST_FORECAST_LOCKED";
      effectiveAt: string;
      auditId: string | null;
    }
  >();
  readonly #sources = new Map<string, Stored<SourceRevisionFields>>();
  readonly #states = new Map<string, Stored<EvidenceStateFields>>();
  readonly #receipts = new Map<string, Stored<ReceiptObservationFields>>();

  constructor(private readonly options: InMemoryEvidenceLabLedgerOptions) {}

  #now(): string {
    return this.options.clock().toISOString();
  }

  #stamp<T>(record: SealedRecord<T>): Stored<T> {
    this.#seq += 1;
    return { record, seq: this.#seq, recordedAt: this.#now() };
  }

  // Operator commands -------------------------------------------------------

  #replay(
    existing: { record: Sealed; auditId: string },
    input: Sealed,
    audit: Sealed & { idempotencyKey?: unknown },
  ): AppendResult {
    if (existing.record.contentHash !== input.contentHash) {
      conflict("record id conflicts with a different immutable payload");
    }
    const recorded = this.#audits.get(existing.auditId);
    if (recorded?.record.idempotencyKey !== audit.idempotencyKey) {
      conflict("record already exists under a different idempotency key");
    }
    return {
      created: false,
      id: (existing.record as unknown as { id: string }).id,
    };
  }

  #acceptCommand(
    auditInput: unknown,
    command: OperatorCommand,
    targetId: string,
    targetContentHash: string,
  ): Stored<OperatorAuditFields> {
    const audit = parseSealed(
      "operator_audit_event",
      operatorAuditFieldsSchema,
      auditInput,
    );
    const targetKind = OPERATOR_COMMANDS[command];
    if (
      audit.outcome !== "ACCEPTED" ||
      audit.command !== command ||
      audit.targetKind !== targetKind ||
      audit.targetId !== targetId
    ) {
      invalid("operator audit event does not describe this accepted command");
    }
    if (
      audit.requestHash !==
      commandRequestHash({ command, targetKind, targetId, targetContentHash })
    ) {
      invalid("operator audit request hash does not bind the command target");
    }
    for (const stored of this.#audits.values()) {
      if (stored.record.outcome !== "ACCEPTED") continue;
      if (stored.record.idempotencyKey === audit.idempotencyKey) {
        conflict("idempotency key was already used for a different request");
      }
    }
    if (this.#audits.has(audit.id))
      conflict("audit event id is already recorded");
    const stored = this.#stamp(audit);
    this.#audits.set(audit.id, stored);
    return stored;
  }

  appendRejectedOperatorCommand(auditInput: unknown): AppendResult {
    const audit = parseSealed(
      "operator_audit_event",
      operatorAuditFieldsSchema,
      auditInput,
    );
    if (audit.outcome !== "REJECTED") {
      invalid("only rejected commands may be audited without their effect");
    }
    const existing = this.#audits.get(audit.id);
    if (existing) {
      if (existing.record.contentHash !== audit.contentHash) {
        conflict("record id conflicts with a different immutable payload");
      }
      return { created: false, id: audit.id };
    }
    this.#audits.set(audit.id, this.#stamp(audit));
    return { created: true, id: audit.id };
  }

  appendRegistryEntry(entryInput: unknown, auditInput: unknown): AppendResult {
    const entry = parseSealed(
      "registry_entry",
      registryEntryFieldsSchema,
      entryInput,
    );
    const existing = this.#registryEntries.get(entry.id);
    if (existing) return this.#replay(existing, entry, auditInput as Sealed);
    for (const stored of this.#registryEntries.values()) {
      if (
        stored.record.kind === entry.kind &&
        stored.record.version === entry.version
      ) {
        conflict("registry version label already names different content");
      }
      if (
        entry.supersedesEntryId !== null &&
        stored.record.supersedesEntryId === entry.supersedesEntryId
      ) {
        conflict("a registry entry can be superseded only once");
      }
    }
    if (entry.supersedesEntryId !== null) {
      const predecessor = this.#registryEntries.get(entry.supersedesEntryId);
      if (!predecessor) missing("superseded registry entry does not exist");
      if (
        predecessor.record.kind !== entry.kind ||
        predecessor.record.pack !== entry.pack
      ) {
        invalid(
          "a registry correction must keep the predecessor kind and pack",
        );
      }
    }
    const audit = this.#acceptCommand(
      auditInput,
      "APPEND_REGISTRY_ENTRY",
      entry.id,
      entry.contentHash,
    );
    this.#registryEntries.set(entry.id, {
      ...this.#stamp(entry),
      auditId: audit.record.id,
    });
    return { created: true, id: entry.id };
  }

  registryEntryStatus(entryId: string): RegistryLifecycleStatus {
    if (!this.#registryEntries.has(entryId))
      missing("registry entry does not exist");
    let status: RegistryLifecycleStatus = "DRAFT";
    for (const event of [...this.#registryEvents.values()].sort(
      (a, b) => a.seq - b.seq,
    )) {
      if (event.record.registryEntryId === entryId)
        status = event.record.eventType;
    }
    return status;
  }

  appendRegistryEvent(eventInput: unknown, auditInput: unknown): AppendResult {
    const event = parseSealed(
      "registry_event",
      registryEventFieldsSchema,
      eventInput,
    );
    const existing = this.#registryEvents.get(event.id);
    if (existing) return this.#replay(existing, event, auditInput as Sealed);
    const status = this.registryEntryStatus(event.registryEntryId);
    if (!REGISTRY_TRANSITIONS[status].includes(event.eventType)) {
      illegal(`illegal registry transition ${status} -> ${event.eventType}`);
    }
    const audit = this.#acceptCommand(
      auditInput,
      "APPEND_REGISTRY_EVENT",
      event.id,
      event.contentHash,
    );
    this.#registryEvents.set(event.id, {
      ...this.#stamp(event),
      auditId: audit.record.id,
    });
    return { created: true, id: event.id };
  }

  // Cohorts ------------------------------------------------------------------

  #registryRefs(cohort: CohortFields) {
    return (Object.keys(REGISTRY_SLOTS) as RegistrySlot[]).map((slot) => {
      const reference = cohort.registryTuple[slot];
      const entry = this.#registryEntries.get(reference.entryId);
      if (
        !entry ||
        entry.record.kind !== REGISTRY_SLOTS[slot] ||
        entry.record.contentHash !== reference.contentHash
      ) {
        missing(
          `cohort ${slot} does not reference a registry entry of the right kind and hash`,
        );
      }
      return { slot, entry };
    });
  }

  appendCohort(cohortInput: unknown, auditInput: unknown): AppendResult {
    const cohort = parseSealed("cohort", cohortFieldsSchema, cohortInput);
    const existing = this.#cohorts.get(cohort.id);
    if (existing) return this.#replay(existing, cohort, auditInput as Sealed);

    const refs = this.#registryRefs(cohort);
    const root = registryRootHash(
      refs.map(({ slot, entry }) => ({
        slot,
        kind: entry.record.kind,
        entryId: entry.record.id,
        contentHash: entry.record.contentHash,
      })),
    );
    if (root !== cohort.registryRootHash) {
      invalid(
        "cohort registry root hash does not match its registry references",
      );
    }
    for (const { entry } of refs) {
      if (entry.record.pack !== null && entry.record.pack !== cohort.pack) {
        invalid("a cohort cannot reference another pack's registry entry");
      }
      if (this.registryEntryStatus(entry.record.id) === "RETIRED") {
        illegal("a new cohort cannot reference a retired registry entry");
      }
    }
    const profileEntry = refs.find(({ slot }) => slot === "packProfile")?.entry;
    const profile = packProfileSchema.parse(profileEntry?.record.payload);
    for (const horizon of cohort.methodology.horizons) {
      if (!profile.horizons.some((declared) => declared.id === horizon)) {
        invalid("cohort horizons must be members of its pack profile");
      }
    }
    if (
      !profile.horizons.every(
        (horizon) => canonicalHorizonId(cohort.pack, horizon) === horizon.id,
      )
    ) {
      invalid("pack profile horizons are outside the cohort pack contract");
    }

    if (cohort.predecessorCohortId !== null) {
      const predecessor = this.#cohorts.get(cohort.predecessorCohortId);
      if (!predecessor) missing("predecessor cohort does not exist");
      if (
        predecessor.record.pack !== cohort.pack ||
        predecessor.record.mode !== cohort.mode
      ) {
        invalid("a cohort version must keep its predecessor pack and mode");
      }
      if (cohort.cohortVersion !== predecessor.record.cohortVersion + 1) {
        invalid(
          "a cohort version must increment its predecessor version by one",
        );
      }
      for (const stored of this.#cohorts.values()) {
        if (stored.record.predecessorCohortId === cohort.predecessorCohortId) {
          conflict("a cohort can have only one successor version");
        }
      }
    }
    const audit = this.#acceptCommand(
      auditInput,
      "APPEND_COHORT",
      cohort.id,
      cohort.contentHash,
    );
    this.#cohorts.set(cohort.id, {
      ...this.#stamp(cohort),
      auditId: audit.record.id,
    });
    return { created: true, id: cohort.id };
  }

  #cohortEventsOf(cohortId: string) {
    return [...this.#cohortEvents.values()]
      .filter((event) => event.cohortId === cohortId)
      .sort((left, right) => left.seq - right.seq);
  }

  cohortStatus(
    cohortId: string,
    at: Date = this.options.clock(),
  ): CohortLifecycleStatus {
    if (!this.#cohorts.has(cohortId)) missing("cohort does not exist");
    const latest = this.#cohortEventsOf(cohortId)
      .filter(
        (event) =>
          event.eventType !== "CORRECTION" &&
          event.eventType !== "FIRST_FORECAST_LOCKED",
      )
      .at(-1);
    if (!latest) return "DRAFT";
    if (latest.eventType === "ACTIVATION_SCHEDULED") {
      return epochMs(latest.effectiveAt) <= at.getTime()
        ? "ACTIVE"
        : "ACTIVATION_PENDING";
    }
    return latest.eventType as CohortLifecycleStatus;
  }

  appendCohortEvent(eventInput: unknown, auditInput: unknown): AppendResult {
    const event = parseSealed(
      "cohort_event",
      cohortEventFieldsSchema,
      eventInput,
    );
    const existing = this.#cohortEvents.get(event.id);
    if (existing) {
      if (existing.auditId === null)
        conflict("record id conflicts with a different immutable payload");
      return this.#replay(
        { record: existing.record, auditId: existing.auditId },
        event,
        auditInput as Sealed,
      );
    }
    const cohort = this.#cohorts.get(event.cohortId);
    if (!cohort) missing("cohort does not exist");
    const now = this.#now();

    if (event.eventType === "CORRECTION") {
      const corrected = this.#cohortEvents.get(event.correctsEventId as string);
      if (corrected?.cohortId !== event.cohortId) {
        invalid("a cohort correction must link an event of the same cohort");
      }
    } else {
      const status = this.cohortStatus(event.cohortId);
      if (
        !(COHORT_TRANSITIONS[status] as readonly string[]).includes(
          event.eventType,
        )
      ) {
        illegal(`illegal cohort transition ${status} -> ${event.eventType}`);
      }
      if (
        event.eventType === "ACTIVATION_SCHEDULED" &&
        epochMs(event.scheduledEffectiveAt as string) <= epochMs(now)
      ) {
        invalid("cohort activation must be future-dated");
      }
      if (
        ["VALIDATED", "APPROVED", "ACTIVATION_SCHEDULED"].includes(
          event.eventType,
        )
      ) {
        const statuses = this.#registryRefs(cohort.record).map(({ entry }) =>
          this.registryEntryStatus(entry.record.id),
        );
        if (
          statuses.some(
            (status) => status !== "VALIDATED" && status !== "APPROVED",
          )
        ) {
          illegal(
            "every cohort registry entry must be validated and not retired",
          );
        }
        if (
          cohort.record.mode === "prospective" &&
          event.eventType !== "VALIDATED"
        ) {
          if (statuses.some((status) => status !== "APPROVED")) {
            illegal(
              "a prospective cohort requires every registry entry to be approved",
            );
          }
          const profile = this.#registryEntries.get(
            cohort.record.registryTuple.packProfile.entryId,
          );
          const provenance = (
            profile?.record.payload as { valuesProvenance?: { kind?: string } }
          ).valuesProvenance?.kind;
          if (provenance === "FIXTURE_PLACEHOLDER") {
            illegal(
              "a prospective cohort cannot use fixture placeholder methodology values",
            );
          }
        }
      }
      if (
        event.eventType === "ACTIVATION_SCHEDULED" &&
        cohort.record.mode === "prospective"
      ) {
        throw new EvidenceLabError(
          "GATED",
          "prospective activation is gated until the readiness, data-rights, and timestamp-sink receipts exist",
        );
      }
      if (
        ["VALIDATED", "APPROVED", "CLOSED"].includes(event.eventType) &&
        this.#cohortEventsOf(event.cohortId).some(
          (prior) => prior.eventType === event.eventType,
        )
      ) {
        conflict(`cohort already recorded ${event.eventType}`);
      }
    }

    const audit = this.#acceptCommand(
      auditInput,
      "APPEND_COHORT_EVENT",
      event.id,
      event.contentHash,
    );
    const stored = this.#stamp(event);
    this.#cohortEvents.set(event.id, {
      ...stored,
      cohortId: event.cohortId,
      eventType: event.eventType,
      effectiveAt: event.scheduledEffectiveAt ?? stored.recordedAt,
      auditId: audit.record.id,
    });
    return { created: true, id: event.id };
  }

  recordFirstForecastLock(lockInput: unknown): AppendResult {
    const lock = parseSealed(
      "cohort_forecast_lock",
      cohortForecastLockFieldsSchema,
      lockInput,
    );
    const cohort = this.#cohorts.get(lock.cohortId);
    if (!cohort) missing("cohort does not exist");
    const existing = this.#cohortEventsOf(lock.cohortId).find(
      (event) => event.eventType === "FIRST_FORECAST_LOCKED",
    );
    const byId = this.#cohortEvents.get(lock.id);
    if (existing || byId) {
      if (
        existing?.record.contentHash === lock.contentHash &&
        byId === existing
      ) {
        return { created: false, id: lock.id };
      }
      illegal("the first forecast lock of a cohort is immutable");
    }
    if (lock.lockedRegistryRootHash !== cohort.record.registryRootHash) {
      invalid(
        "the first forecast must lock the cohort's preregistered registry root",
      );
    }
    const status = this.cohortStatus(lock.cohortId);
    if (!canAcceptFirstForecast(cohort.record.mode, status)) {
      illegal(
        `a ${cohort.record.mode} cohort cannot accept its first forecast while ${status}`,
      );
    }
    if (
      this.#registryRefs(cohort.record).some(
        ({ entry }) => this.registryEntryStatus(entry.record.id) === "RETIRED",
      )
    ) {
      illegal(
        "a cohort cannot accept its first forecast with a retired registry entry",
      );
    }
    const stored = this.#stamp(lock);
    this.#cohortEvents.set(lock.id, {
      ...stored,
      cohortId: lock.cohortId,
      eventType: "FIRST_FORECAST_LOCKED",
      effectiveAt: stored.recordedAt,
      auditId: null,
    });
    return { created: true, id: lock.id };
  }

  // Sources and evidence states ---------------------------------------------

  appendSourceRevision(sourceInput: unknown): AppendResult {
    const source = parseSealed(
      "source_revision",
      sourceRevisionFieldsSchema,
      sourceInput,
    );
    const existing = this.#sources.get(source.id);
    if (existing) {
      if (existing.record.contentHash !== source.contentHash) {
        conflict("record id conflicts with a different immutable payload");
      }
      return { created: false, id: source.id };
    }
    for (const stored of this.#sources.values()) {
      if (
        stored.record.sourceId === source.sourceId &&
        stored.record.revision === source.revision
      ) {
        conflict("source revision label already names different content");
      }
      if (
        source.supersedesRevisionId !== null &&
        stored.record.supersedesRevisionId === source.supersedesRevisionId
      ) {
        conflict("a source revision can be superseded only once");
      }
    }
    if (source.supersedesRevisionId !== null) {
      const predecessor = this.#sources.get(
        source.supersedesRevisionId,
      )?.record;
      if (!predecessor) missing("superseded source revision does not exist");
      if (
        predecessor.sourceId !== source.sourceId ||
        predecessor.sourceKind !== source.sourceKind ||
        predecessor.subject !== source.subject ||
        predecessor.origin !== source.origin
      ) {
        invalid(
          "a source correction must keep the source identity, kind, subject, and origin",
        );
      }
      if (
        epochMs(source.availableAt) <= epochMs(predecessor.availableAt) ||
        epochMs(source.correctionAt as string) <
          epochMs(predecessor.publishedAt)
      ) {
        invalid(
          "a source correction must become available after its predecessor",
        );
      }
    }
    this.#sources.set(source.id, this.#stamp(source));
    return { created: true, id: source.id };
  }

  /** Revisions of one source and whether each was the eligible one at `asOf`. */
  sourceRevisionsAsOf(sourceId: string, asOf: string) {
    const revisions = [...this.#sources.values()]
      .map((stored) => stored.record)
      .filter((source) => source.sourceId === sourceId);
    return revisions
      .sort(
        (left, right) =>
          epochMs(left.availableAt) - epochMs(right.availableAt) ||
          compareCodeUnits(left.id, right.id),
      )
      .map((source) => ({
        source,
        eligible:
          epochMs(source.availableAt) <= epochMs(asOf) &&
          !revisions.some(
            (successor) =>
              successor.supersedesRevisionId === source.id &&
              epochMs(successor.availableAt) <= epochMs(asOf),
          ),
      }));
  }

  appendEvidenceState(stateInput: unknown): AppendResult {
    const state = parseSealed(
      "evidence_state",
      evidenceStateFieldsSchema,
      stateInput,
    );
    const existing = this.#states.get(state.id);
    if (existing) {
      if (existing.record.contentHash !== state.contentHash) {
        conflict("record id conflicts with a different immutable payload");
      }
      return { created: false, id: state.id };
    }
    if (state.mode === "prospective") {
      throw new EvidenceLabError(
        "GATED",
        "a prospective evidence state requires a rights-cleared live source origin, which this schema version does not provide",
      );
    }
    if (
      normalizedStateHash(state.normalizedState) !== state.normalizedStateHash
    ) {
      invalid("normalized state hash does not match the normalized state");
    }
    if (
      admissionManifestHash(state.admissions) !== state.admissionManifestHash
    ) {
      invalid(
        "admission manifest hash does not match the admitted source revisions",
      );
    }
    const cutoff = epochMs(state.cutoffAt);
    for (const admission of state.admissions) {
      const source = this.#sources.get(admission.sourceRevisionId)?.record;
      if (!source || source.contentHash !== admission.sourceContentHash) {
        missing(
          "an admission must reference a stored source revision and its content hash",
        );
      }
      if (epochMs(source.availableAt) > cutoff) {
        invalid(
          "an evidence state cannot admit a source available after its cutoff",
        );
      }
      const supersededBeforeCutoff = [...this.#sources.values()].some(
        (successor) =>
          successor.record.supersedesRevisionId === source.id &&
          epochMs(successor.record.availableAt) <= cutoff,
      );
      if (supersededBeforeCutoff) {
        invalid(
          "an evidence state cannot admit a revision superseded before its cutoff",
        );
      }
    }
    if (state.predecessorStateId !== null) {
      const predecessor = this.#states.get(state.predecessorStateId)?.record;
      if (!predecessor) missing("predecessor evidence state does not exist");
      if (
        predecessor.pack !== state.pack ||
        predecessor.mode !== state.mode ||
        predecessor.subject !== state.subject
      ) {
        invalid(
          "a linked evidence state must keep its predecessor pack, mode, and subject",
        );
      }
      if (
        state.linkKind === "REASSESSMENT" &&
        cutoff <= epochMs(predecessor.cutoffAt)
      ) {
        invalid("a reassessment must use a later cutoff than its predecessor");
      }
      if (
        state.linkKind === "CORRECTION" &&
        cutoff !== epochMs(predecessor.cutoffAt)
      ) {
        invalid("an evidence correction must keep its predecessor cutoff");
      }
      for (const stored of this.#states.values()) {
        if (
          stored.record.predecessorStateId === state.predecessorStateId &&
          stored.record.linkKind === state.linkKind
        ) {
          conflict(`evidence state already has a ${state.linkKind} successor`);
        }
      }
      const prior = new Set(
        predecessor.admissions.map((entry) => entry.sourceRevisionId),
      );
      const current = new Set(
        state.admissions.map((entry) => entry.sourceRevisionId),
      );
      const added = [...current]
        .filter((id) => !prior.has(id))
        .sort(compareCodeUnits);
      const removed = [...prior]
        .filter((id) => !current.has(id))
        .sort(compareCodeUnits);
      const summary = state.changeSummary;
      if (
        JSON.stringify(summary?.addedSourceRevisionIds) !==
          JSON.stringify(added) ||
        JSON.stringify(summary?.removedSourceRevisionIds) !==
          JSON.stringify(removed)
      ) {
        invalid(
          "change summary must state exactly which admitted sources changed",
        );
      }
      if (
        state.linkKind === "CORRECTION" &&
        added.length === 0 &&
        removed.length === 0 &&
        predecessor.normalizedStateHash === state.normalizedStateHash
      ) {
        invalid(
          "an evidence correction must change its admissions or normalized state",
        );
      }
    }
    this.#states.set(state.id, this.#stamp(state));
    return { created: true, id: state.id };
  }

  // Receipts -----------------------------------------------------------------

  appendPublicationReceipt(receiptInput: unknown): AppendResult {
    const receipt = parseSealed(
      "publication_receipt",
      receiptObservationFieldsSchema,
      receiptInput,
    );
    const existing = this.#receipts.get(receipt.id);
    if (existing) {
      if (existing.record.contentHash !== receipt.contentHash) {
        conflict("record id conflicts with a different immutable payload");
      }
      return { created: false, id: receipt.id };
    }
    const now = this.#now();
    if (
      receipt.observation === "MISSING" &&
      epochMs(now) <= epochMs(receipt.deadlineAt)
    ) {
      invalid("a receipt can be recorded missing only after its deadline");
    }
    const head = this.receiptChain(receipt.batchId).at(-1);
    if (!head) {
      if (receipt.correctsReceiptId !== null) {
        invalid(
          "the first receipt observation of a batch cannot be a correction",
        );
      }
    } else {
      if (receipt.correctsReceiptId !== head.id) {
        invalid(
          "a later receipt observation must link the batch's latest observation",
        );
      }
      if (
        receipt.rootHash !== head.rootHash ||
        receipt.deadlineAt !== head.deadlineAt
      ) {
        invalid(
          "receipt observations for one batch must bind the same root and deadline",
        );
      }
    }
    this.#receipts.set(receipt.id, this.#stamp(receipt));
    return { created: true, id: receipt.id };
  }

  receiptChain(
    batchId: string,
  ): readonly SealedRecord<ReceiptObservationFields>[] {
    return [...this.#receipts.values()]
      .filter((stored) => stored.record.batchId === batchId)
      .sort((left, right) => left.seq - right.seq)
      .map((stored) => stored.record);
  }

  receiptAuthority(
    batchId: string,
    expectedRootHash: string,
  ): ReceiptAuthority {
    return evaluateReceiptAuthority(
      batchId,
      expectedRootHash,
      this.receiptChain(batchId),
    );
  }

  claimedReceiptStatus(receiptId: string) {
    const receipt = this.#receipts.get(receiptId)?.record;
    if (!receipt) missing("receipt does not exist");
    return claimedReceiptStatus(receipt);
  }

  // Reads --------------------------------------------------------------------

  registryEntry(id: string) {
    return this.#registryEntries.get(id)?.record;
  }

  cohort(id: string) {
    return this.#cohorts.get(id)?.record;
  }

  firstForecastLock(cohortId: string) {
    return this.#cohortEventsOf(cohortId).find(
      (event) => event.eventType === "FIRST_FORECAST_LOCKED",
    )?.record as SealedRecord<CohortForecastLockFields> | undefined;
  }

  sourceRevision(id: string) {
    return this.#sources.get(id)?.record;
  }

  evidenceState(id: string) {
    return this.#states.get(id)?.record;
  }

  auditEvents(): readonly SealedRecord<OperatorAuditFields>[] {
    return [...this.#audits.values()]
      .sort((a, b) => a.seq - b.seq)
      .map((stored) => stored.record);
  }

  /** Every stored content hash, for fixture reproducibility receipts. */
  contentHashes(): Readonly<Record<string, string>> {
    const all: Record<string, string> = {};
    const collections = [
      ["audit", this.#audits],
      ["registry_entry", this.#registryEntries],
      ["registry_event", this.#registryEvents],
      ["cohort", this.#cohorts],
      ["cohort_event", this.#cohortEvents],
      ["source_revision", this.#sources],
      ["evidence_state", this.#states],
      ["publication_receipt", this.#receipts],
    ] as const;
    for (const [prefix, collection] of collections) {
      for (const [id, stored] of collection as Map<
        string,
        { record: Sealed }
      >) {
        all[`${prefix}:${id}`] = stored.record.contentHash;
      }
    }
    return Object.fromEntries(
      Object.entries(all).sort(([left], [right]) =>
        compareCodeUnits(left, right),
      ),
    );
  }
}
