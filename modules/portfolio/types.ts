import type { PaperEvent } from "@/modules/ledger/types";

export type PaperPortfolioEvent = PaperEvent;

export interface PaperPositionProjection {
  readonly symbol: string;
  readonly shares: number;
  readonly markPrice: number;
  readonly marketValue: number;
  readonly forecastIds: readonly string[];
}

export interface PaperPortfolioProjection {
  readonly cash: number;
  readonly marketValue: number;
  readonly equity: number;
  readonly positions: Readonly<Record<string, PaperPositionProjection>>;
  readonly appliedEventIds: readonly string[];
  readonly duplicateEventIds: readonly string[];
  readonly projectionVersion: "paper-portfolio-v1";
}
