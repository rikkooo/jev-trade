import { z } from "zod";

import {
  compareCodeUnits,
  identifierSchema,
  packSchema,
  reasonSchema,
  reviewReferenceSchema,
  timestampSchema,
  versionSchema,
  type EvidenceLabPack,
} from "./primitives";

export const PACK_PROFILE_SCHEMA = "jev-evidence-lab-pack-profile/v1" as const;

// P2-R37: Jev stances by pack.
export const SHORT_TERM_STANCES = ["LONG", "SHORT", "WAIT"] as const;
export const LONG_TERM_STANCES = [
  "ACCUMULATE",
  "MAINTAIN",
  "DEACCUMULATE",
  "WAIT",
] as const;

// P2-R19: deterministic policy actions by pack. REDUCE is an action, not a direction.
export const SHORT_TERM_ACTIONS = [
  "OPEN_LONG",
  "OPEN_SHORT",
  "HOLD",
  "REDUCE",
  "CLOSE",
  "WAIT",
] as const;
export const LONG_TERM_ACTIONS = [
  "BUY",
  "HOLD",
  "REDUCE",
  "EXIT",
  "WAIT",
] as const;

// Simulated execution events (KTD9). A short opens only after LOCATE_GRANTED.
export const SHORT_TERM_EXECUTION_EVENTS = [
  "BUY_TO_OPEN",
  "SELL_TO_CLOSE",
  "LOCATE_REQUESTED",
  "LOCATE_GRANTED",
  "LOCATE_DENIED",
  "SELL_SHORT_TO_OPEN",
  "BUY_TO_COVER",
  "PARTIAL_FILL",
  "MISSED_FILL",
  "FORCED_CLOSE",
  "BORROW_ACCRUAL",
] as const;
export const LONG_TERM_EXECUTION_EVENTS = [
  "BUY",
  "SELL_TO_REDUCE",
  "SELL_TO_EXIT",
  "PARTIAL_FILL",
  "MISSED_FILL",
] as const;

export const shortTermStanceSchema = z.enum(SHORT_TERM_STANCES);
export const longTermStanceSchema = z.enum(LONG_TERM_STANCES);
export const stanceSchema = z.enum([
  ...SHORT_TERM_STANCES,
  "ACCUMULATE",
  "MAINTAIN",
  "DEACCUMULATE",
]);
export type EvidenceLabStance = z.infer<typeof stanceSchema>;

export const shortTermActionSchema = z.enum(SHORT_TERM_ACTIONS);
export const longTermActionSchema = z.enum(LONG_TERM_ACTIONS);
export const policyActionSchema = z.enum([
  ...SHORT_TERM_ACTIONS,
  "BUY",
  "EXIT",
]);
export type EvidenceLabPolicyAction = z.infer<typeof policyActionSchema>;

export const executionEventSchema = z.enum([
  ...SHORT_TERM_EXECUTION_EVENTS,
  "BUY",
  "SELL_TO_REDUCE",
  "SELL_TO_EXIT",
]);
export type EvidenceLabExecutionEvent = z.infer<typeof executionEventSchema>;

export interface PackVocabulary {
  readonly stances: readonly EvidenceLabStance[];
  readonly actions: readonly EvidenceLabPolicyAction[];
  readonly positionSides: readonly ("LONG" | "SHORT")[];
  readonly executionEvents: readonly EvidenceLabExecutionEvent[];
}

const SHORT_TERM_VOCABULARY: PackVocabulary = {
  stances: SHORT_TERM_STANCES,
  actions: SHORT_TERM_ACTIONS,
  positionSides: ["LONG", "SHORT"],
  executionEvents: SHORT_TERM_EXECUTION_EVENTS,
};

export const PACK_VOCABULARY: Readonly<
  Record<EvidenceLabPack, PackVocabulary>
> = {
  scalping: SHORT_TERM_VOCABULARY,
  day: SHORT_TERM_VOCABULARY,
  swing: SHORT_TERM_VOCABULARY,
  "long-term": {
    stances: LONG_TERM_STANCES,
    actions: LONG_TERM_ACTIONS,
    positionSides: ["LONG"],
    executionEvents: LONG_TERM_EXECUTION_EVENTS,
  },
};

export function isStanceAllowed(
  pack: EvidenceLabPack,
  stance: string,
): boolean {
  return (PACK_VOCABULARY[pack].stances as readonly string[]).includes(stance);
}

export function isActionAllowed(
  pack: EvidenceLabPack,
  action: string,
): boolean {
  return (PACK_VOCABULARY[pack].actions as readonly string[]).includes(action);
}

export function isExecutionEventAllowed(
  pack: EvidenceLabPack,
  event: string,
): boolean {
  return (PACK_VOCABULARY[pack].executionEvents as readonly string[]).includes(
    event,
  );
}

/** Execution intents a policy action may emit, by current position side. */
export function executionIntents(
  pack: EvidenceLabPack,
  action: EvidenceLabPolicyAction,
  side: "LONG" | "SHORT" | "FLAT",
): readonly EvidenceLabExecutionEvent[] {
  if (!isActionAllowed(pack, action)) {
    throw new RangeError(`${action} is not a ${pack} policy action`);
  }
  if (pack === "long-term") {
    if (action === "BUY") return ["BUY"];
    if (action === "REDUCE") return side === "LONG" ? ["SELL_TO_REDUCE"] : [];
    if (action === "EXIT") return side === "LONG" ? ["SELL_TO_EXIT"] : [];
    return [];
  }
  switch (action) {
    case "OPEN_LONG":
      return side === "FLAT" ? ["BUY_TO_OPEN"] : [];
    case "OPEN_SHORT":
      return side === "FLAT" ? ["LOCATE_REQUESTED"] : [];
    case "REDUCE":
    case "CLOSE":
      if (side === "LONG") return ["SELL_TO_CLOSE"];
      if (side === "SHORT") return ["BUY_TO_COVER"];
      return [];
    default:
      return [];
  }
}

// Horizons -----------------------------------------------------------------

export const horizonSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.string(),
      kind: z.literal("DURATION"),
      seconds: z.number().int().positive(),
    })
    .strict(),
  z.object({ id: z.string(), kind: z.literal("SESSION_CLOSE") }).strict(),
  z
    .object({
      id: z.string(),
      kind: z.literal("TRADING_SESSIONS"),
      sessions: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      kind: z.literal("CALENDAR_DAYS"),
      days: z.number().int().positive(),
    })
    .strict(),
]);
export type Horizon = z.infer<typeof horizonSchema>;

/** The only identifier each pack may give a horizon, so ids are unambiguous. */
export function canonicalHorizonId(
  pack: EvidenceLabPack,
  horizon: Horizon,
): string | null {
  switch (pack) {
    case "scalping":
      return horizon.kind === "DURATION" &&
        horizon.seconds >= 10 &&
        horizon.seconds <= 300
        ? `${horizon.seconds}s`
        : null;
    case "day":
      if (horizon.kind === "SESSION_CLOSE") return "session-close";
      return horizon.kind === "DURATION" &&
        horizon.seconds % 60 === 0 &&
        horizon.seconds >= 15 * 60 &&
        horizon.seconds <= 4 * 60 * 60
        ? `${horizon.seconds / 60}m`
        : null;
    case "swing":
      return horizon.kind === "TRADING_SESSIONS" &&
        horizon.sessions >= 2 &&
        horizon.sessions <= 15
        ? `${horizon.sessions}-sessions`
        : null;
    case "long-term":
      return horizon.kind === "CALENDAR_DAYS" && horizon.days >= 180
        ? `${horizon.days}d`
        : null;
  }
}

export const RISK_WINDOWS = ["1h", "half-day", "1d", "1w"] as const;

// Inputs, features, costs, and baselines --------------------------------------

export const SOURCE_KINDS = [
  "BAR",
  "TICK",
  "ORDER_BOOK",
  "FILING",
  "FUNDAMENTAL",
  "CORPORATE_EVENT",
  "ECONOMIC_EVENT",
  "CORPORATE_ACTION",
  "CALENDAR",
  "BORROW_AVAILABILITY",
  "NEWS_SUMMARY",
] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const TIMESTAMP_PRECISIONS = [
  "NANOSECOND",
  "MICROSECOND",
  "MILLISECOND",
  "SECOND",
  "MINUTE",
  "DAY",
] as const;

export const FEATURE_FAMILIES = [
  "SPREAD",
  "DEPTH_IMBALANCE",
  "MICRO_PRICE_MOMENTUM",
  "MOVING_AVERAGE_CROSSOVER",
  "OPENING_RANGE_BREAKOUT",
  "VWAP",
  "RSI",
  "MACD",
  "VOLUME",
  "EVENT_MARKER",
  "SUPPORT_RESISTANCE",
  "PATTERN",
  "OVERNIGHT_GAP",
  "CORPORATE_ACTION_ADJUSTMENT",
  "VALUATION",
  "QUALITY",
  "SECTOR_CONTEXT",
  "DIVIDEND_SPLIT_ADJUSTMENT",
  "RESTATEMENT_TRACKING",
] as const;

export const COST_COMPONENTS = [
  "FEES",
  "SPREAD",
  "SLIPPAGE",
  "LATENCY",
  "PARTIAL_FILL",
  "MISSED_FILL",
  "ADVERSE_SELECTION",
  "OVERNIGHT_GAP",
  "LOCATE",
  "BORROW",
] as const;
export type CostComponent = (typeof COST_COMPONENTS)[number];

export const NAIVE_CONTROLS = [
  "MAJORITY_CLASS",
  "SEEDED_RANDOM",
  "PASSIVE_EXPOSURE",
  "DOLLAR_COST_AVERAGING",
  "VALUE_RULE",
] as const;

export const COMPARISON_ARMS = [
  "standard-tools",
  "jev",
  "full-jev-trade",
  "naive-controls",
] as const;
export const armSchema = z.enum(COMPARISON_ARMS);
export type ComparisonArm = z.infer<typeof armSchema>;

export const OUTCOME_STATES = [
  "UNRESOLVED",
  "UNAVAILABLE",
  "ADJUSTED",
  "VOID",
  "RESOLVED",
] as const;
export const VOID_TRIGGERS = [
  "HALT",
  "DELISTING",
  "MISSING_DATA",
  "PROVIDER_FAILURE",
] as const;

interface PackRequirements {
  readonly evidenceGranularity: string;
  readonly coarsestTimestampPrecision: (typeof TIMESTAMP_PRECISIONS)[number];
  readonly inputs: readonly SourceKind[];
  readonly features: readonly (typeof FEATURE_FAMILIES)[number][];
  readonly costComponents: readonly CostComponent[];
  readonly baselines: readonly (typeof NAIVE_CONTROLS)[number][];
  readonly corporateActionAdjustment: boolean;
}

/** Minimum declarations per pack from P2-R33-P2-R36 and the plan's pack table. */
export const PACK_REQUIREMENTS: Readonly<
  Record<EvidenceLabPack, PackRequirements>
> = {
  scalping: {
    evidenceGranularity: "TICK_AND_DEPTH",
    coarsestTimestampPrecision: "MILLISECOND",
    inputs: ["TICK", "ORDER_BOOK", "CALENDAR", "BORROW_AVAILABILITY"],
    features: [
      "SPREAD",
      "DEPTH_IMBALANCE",
      "MICRO_PRICE_MOMENTUM",
      "MOVING_AVERAGE_CROSSOVER",
    ],
    costComponents: [
      "FEES",
      "SPREAD",
      "SLIPPAGE",
      "LATENCY",
      "PARTIAL_FILL",
      "MISSED_FILL",
      "ADVERSE_SELECTION",
      "LOCATE",
      "BORROW",
    ],
    baselines: ["MAJORITY_CLASS", "SEEDED_RANDOM", "PASSIVE_EXPOSURE"],
    corporateActionAdjustment: false,
  },
  day: {
    evidenceGranularity: "INTRADAY_BARS",
    coarsestTimestampPrecision: "MINUTE",
    inputs: ["BAR", "ECONOMIC_EVENT", "CALENDAR", "BORROW_AVAILABILITY"],
    features: [
      "OPENING_RANGE_BREAKOUT",
      "VWAP",
      "RSI",
      "MACD",
      "VOLUME",
      "EVENT_MARKER",
    ],
    costComponents: [
      "FEES",
      "SPREAD",
      "SLIPPAGE",
      "PARTIAL_FILL",
      "MISSED_FILL",
      "LOCATE",
      "BORROW",
    ],
    baselines: ["MAJORITY_CLASS", "SEEDED_RANDOM", "PASSIVE_EXPOSURE"],
    corporateActionAdjustment: false,
  },
  swing: {
    evidenceGranularity: "FOUR_HOUR_OR_DAILY_BARS",
    coarsestTimestampPrecision: "DAY",
    inputs: [
      "BAR",
      "CORPORATE_EVENT",
      "CORPORATE_ACTION",
      "CALENDAR",
      "BORROW_AVAILABILITY",
    ],
    features: [
      "SUPPORT_RESISTANCE",
      "PATTERN",
      "OVERNIGHT_GAP",
      "EVENT_MARKER",
      "CORPORATE_ACTION_ADJUSTMENT",
    ],
    costComponents: [
      "FEES",
      "SPREAD",
      "SLIPPAGE",
      "OVERNIGHT_GAP",
      "LOCATE",
      "BORROW",
    ],
    baselines: ["MAJORITY_CLASS", "SEEDED_RANDOM", "PASSIVE_EXPOSURE"],
    corporateActionAdjustment: true,
  },
  "long-term": {
    evidenceGranularity: "POINT_IN_TIME_FILINGS",
    coarsestTimestampPrecision: "DAY",
    inputs: ["FILING", "FUNDAMENTAL", "CORPORATE_ACTION", "BAR", "CALENDAR"],
    features: [
      "VALUATION",
      "QUALITY",
      "SECTOR_CONTEXT",
      "DIVIDEND_SPLIT_ADJUSTMENT",
      "RESTATEMENT_TRACKING",
    ],
    costComponents: ["FEES", "SPREAD", "SLIPPAGE"],
    baselines: ["DOLLAR_COST_AVERAGING", "VALUE_RULE", "PASSIVE_EXPOSURE"],
    corporateActionAdjustment: true,
  },
};

const uniqueSorted = <T extends string>(values: readonly T[]): boolean =>
  values.every(
    (value, index) =>
      index === 0 || compareCodeUnits(values[index - 1] as string, value) < 0,
  );

const exactArray = (expected: readonly string[]) =>
  z
    .array(z.string())
    .refine(
      (values) =>
        values.length === expected.length &&
        values.every((value, index) => value === expected[index]),
      { message: `must equal ${JSON.stringify(expected)}` },
    );

const valuesProvenanceSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("FIXTURE_PLACEHOLDER"), note: reasonSchema })
    .strict(),
  z
    .object({
      kind: z.literal("TRAINING_ONLY_SELECTION"),
      datasetBoundary: z
        .object({ from: timestampSchema, to: timestampSchema })
        .strict()
        .refine((boundary) => boundary.from < boundary.to, {
          message: "training boundary must be non-empty",
        }),
      selectionReviewReference: reviewReferenceSchema,
    })
    .strict(),
]);

const shortSellingSchema = z.discriminatedUnion("permitted", [
  z
    .object({
      permitted: z.literal(true),
      requiresLocate: z.literal(true),
      unavailableLocate: z.literal("FAIL_CLOSED"),
      borrowCostModel: z.enum(["PER_SESSION", "TIME_DEPENDENT"]),
    })
    .strict(),
  z.object({ permitted: z.literal(false) }).strict(),
]);

const sessionRuleSchema = z.discriminatedUnion("forcedCloseBeforeSessionEnd", [
  z
    .object({
      forcedCloseBeforeSessionEnd: z.literal(true),
      closeBufferMinutes: z.number().int().min(1).max(60),
      calendar: z.literal("EXCHANGE"),
    })
    .strict(),
  z.object({ forcedCloseBeforeSessionEnd: z.literal(false) }).strict(),
]);

/**
 * P2-R32: every pack declares its input, horizon, action, cost, baseline, and
 * resolution profile. Numeric methodology values are placeholders until the
 * pack card selects them from training-only data (KTD11).
 */
export const packProfileSchema = z
  .object({
    schema: z.literal(PACK_PROFILE_SCHEMA),
    pack: packSchema,
    profileVersion: versionSchema,
    stances: z.array(stanceSchema),
    actions: z.array(policyActionSchema),
    positionSides: z.array(z.enum(["LONG", "SHORT"])),
    executionEvents: z.array(executionEventSchema),
    arms: exactArray(COMPARISON_ARMS),
    horizons: z.array(horizonSchema).min(1),
    riskWindows: z.array(z.enum(RISK_WINDOWS)),
    inputs: z
      .object({
        evidenceGranularity: z.string(),
        timestampPrecision: z.enum(TIMESTAMP_PRECISIONS),
        sourceKinds: z.array(sourceKindSchema).min(1),
      })
      .strict(),
    features: z.array(z.enum(FEATURE_FAMILIES)).min(1),
    costs: z
      .object({
        components: z.array(z.enum(COST_COMPONENTS)).min(1),
        scenarios: exactArray(["BASE", "ADVERSE"]),
      })
      .strict(),
    shortSelling: shortSellingSchema,
    session: sessionRuleSchema,
    resolution: z
      .object({
        rule: z.literal("FIRST_ELIGIBLE_FORWARD_OBSERVATION"),
        outcomeStates: exactArray(OUTCOME_STATES),
        neutralBandBps: z.record(z.string(), z.number().min(0).max(10_000)),
        corporateActionAdjustment: z.boolean(),
        voidTriggers: z.array(z.enum(VOID_TRIGGERS)),
      })
      .strict(),
    baselines: z.array(z.enum(NAIVE_CONTROLS)).min(1),
    valuesProvenance: valuesProvenanceSchema,
  })
  .strict()
  .superRefine((profile, ctx) => {
    const vocabulary = PACK_VOCABULARY[profile.pack];
    const requirements = PACK_REQUIREMENTS[profile.pack];
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const sameList = (actual: readonly string[], expected: readonly string[]) =>
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]);
    const includesAll = (
      actual: readonly string[],
      expected: readonly string[],
    ) => expected.every((value) => actual.includes(value));

    if (!sameList(profile.stances, vocabulary.stances)) {
      issue(["stances"], `must equal the ${profile.pack} stance vocabulary`);
    }
    if (!sameList(profile.actions, vocabulary.actions)) {
      issue(["actions"], `must equal the ${profile.pack} action vocabulary`);
    }
    if (!sameList(profile.positionSides, vocabulary.positionSides)) {
      issue(["positionSides"], `must equal the ${profile.pack} position sides`);
    }
    if (!sameList(profile.executionEvents, vocabulary.executionEvents)) {
      issue(
        ["executionEvents"],
        `must equal the ${profile.pack} simulated execution vocabulary`,
      );
    }

    const horizonIds: string[] = [];
    profile.horizons.forEach((horizon, index) => {
      const expected = canonicalHorizonId(profile.pack, horizon);
      if (expected === null || horizon.id !== expected) {
        issue(
          ["horizons", index],
          `is outside the ${profile.pack} horizon contract`,
        );
      }
      horizonIds.push(horizon.id);
    });
    if (new Set(horizonIds).size !== horizonIds.length) {
      issue(["horizons"], "horizon identifiers must be unique");
    }
    if (!uniqueSorted(profile.riskWindows)) {
      issue(["riskWindows"], "must be unique and sorted");
    }

    if (
      profile.inputs.evidenceGranularity !== requirements.evidenceGranularity
    ) {
      issue(
        ["inputs", "evidenceGranularity"],
        `must be ${requirements.evidenceGranularity}`,
      );
    }
    if (
      TIMESTAMP_PRECISIONS.indexOf(profile.inputs.timestampPrecision) >
      TIMESTAMP_PRECISIONS.indexOf(requirements.coarsestTimestampPrecision)
    ) {
      issue(
        ["inputs", "timestampPrecision"],
        `must be ${requirements.coarsestTimestampPrecision} or finer`,
      );
    }
    for (const [path, actual, expected] of [
      [
        ["inputs", "sourceKinds"],
        profile.inputs.sourceKinds,
        requirements.inputs,
      ],
      [["features"], profile.features, requirements.features],
      [
        ["costs", "components"],
        profile.costs.components,
        requirements.costComponents,
      ],
      [["baselines"], profile.baselines, requirements.baselines],
    ] as const) {
      if (!uniqueSorted(actual)) issue([...path], "must be unique and sorted");
      if (!includesAll(actual, expected)) {
        issue([...path], `must include ${expected.join(", ")}`);
      }
    }

    const shortTerm = profile.pack !== "long-term";
    if (profile.shortSelling.permitted !== shortTerm) {
      issue(
        ["shortSelling"],
        shortTerm
          ? "short-term packs must model locate and borrow"
          : "Long-Term Investing is long-only",
      );
    }
    if (
      profile.pack === "swing" &&
      profile.shortSelling.permitted &&
      profile.shortSelling.borrowCostModel !== "TIME_DEPENDENT"
    ) {
      issue(
        ["shortSelling", "borrowCostModel"],
        "swing borrow cost is time dependent",
      );
    }
    if (
      profile.session.forcedCloseBeforeSessionEnd !==
      (profile.pack === "day")
    ) {
      issue(
        ["session"],
        "only Day Trading forces a close before the session ends",
      );
    }

    const bandKeys = Object.keys(profile.resolution.neutralBandBps).sort(
      compareCodeUnits,
    );
    if (!sameList(bandKeys, [...horizonIds].sort(compareCodeUnits))) {
      issue(
        ["resolution", "neutralBandBps"],
        "must declare one band per horizon",
      );
    }
    if (
      profile.resolution.corporateActionAdjustment !==
      requirements.corporateActionAdjustment
    ) {
      issue(
        ["resolution", "corporateActionAdjustment"],
        `must be ${requirements.corporateActionAdjustment} for ${profile.pack}`,
      );
    }
    if (
      !uniqueSorted(profile.resolution.voidTriggers) ||
      !includesAll(profile.resolution.voidTriggers, ["DELISTING", "HALT"])
    ) {
      issue(
        ["resolution", "voidTriggers"],
        "must be unique, sorted, and include HALT and DELISTING",
      );
    }
  });
export type PackProfile = z.infer<typeof packProfileSchema>;

/** Base and adverse execution-cost scenarios (P2-R58). */
export const COST_SCENARIO_SCHEMA =
  "jev-evidence-lab-cost-scenarios/v1" as const;

const costParametersSchema = z.partialRecord(
  z.enum(COST_COMPONENTS),
  z.number().min(0).max(1_000_000),
);

export const costScenarioPayloadSchema = z
  .object({
    schema: z.literal(COST_SCENARIO_SCHEMA),
    pack: packSchema,
    units: z.literal("BPS_OR_MILLISECONDS"),
    base: costParametersSchema,
    adverse: costParametersSchema,
    evidenceBasis: reasonSchema,
  })
  .strict()
  .superRefine((scenarios, ctx) => {
    const required = PACK_REQUIREMENTS[scenarios.pack].costComponents;
    for (const component of required) {
      const base = scenarios.base[component];
      const adverse = scenarios.adverse[component];
      if (base === undefined || adverse === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [component],
          message:
            "base and adverse scenarios must price every required component",
        });
      } else if (adverse < base) {
        ctx.addIssue({
          code: "custom",
          path: ["adverse", component],
          message:
            "the adverse scenario cannot be cheaper than the base scenario",
        });
      }
    }
  });
export type CostScenarioPayload = z.infer<typeof costScenarioPayloadSchema>;

export const methodologyItemSchema = z
  .object({ id: identifierSchema, description: reasonSchema })
  .strict();
