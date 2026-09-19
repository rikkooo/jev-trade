import { formatProbability, sentenceCase } from "@/modules/view-model";
import type { Direction, JudgmentView } from "@/modules/view-model";

export function ProbabilityBars({
  judgment,
}: {
  readonly judgment: JudgmentView;
}) {
  return (
    <div
      className="probability-list"
      aria-label="Jev direction judgment distribution"
    >
      {(["up", "flat", "down"] as Direction[]).map((direction) => {
        const probability = judgment.probabilities[direction];
        return (
          <div className="probability-row" key={direction}>
            <div className="probability-label">
              <span>{sentenceCase(direction)}</span>
              <strong>{formatProbability(probability)}</strong>
            </div>
            <div
              className="probability-track"
              role="meter"
              aria-label={`${direction} probability`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(probability * 100)}
            >
              <span
                className={`probability-fill probability-${direction}`}
                style={{ width: `${probability * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
