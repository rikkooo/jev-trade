import type { Cohort, CohortEvent } from "../contracts";

export const cohortTransitions: Readonly<
  Record<Cohort["status"], readonly CohortEvent["type"][]>
> = {
  DRAFT: ["VALIDATED", "CORRECTION"],
  VALIDATED: ["APPROVED", "CORRECTION"],
  APPROVED: ["ACTIVE", "PAUSED", "CLOSED", "CORRECTION"],
  ACTIVE: ["PAUSED", "CLOSED", "CORRECTION"],
  PAUSED: ["ACTIVE", "CLOSED", "CORRECTION"],
  CLOSED: ["CORRECTION"],
};

export function cohortStatusAfterEvent(
  status: Cohort["status"],
  event: CohortEvent["type"],
): Cohort["status"] {
  if (!cohortTransitions[status].includes(event)) {
    throw new Error(`invalid cohort transition ${status} -> ${event}`);
  }
  return event === "CORRECTION" ? status : event;
}
