import {
  FIXTURE_DECISION_STATE_VERSION,
  FIXTURE_JUDGMENT_INPUT_VERSION,
  FIXTURE_SOURCE_MANIFEST_VERSION,
} from "@/modules/view-model";

import { fixtureJson } from "../../_lib/responses";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return fixtureJson({
    dataKind: "synthetic_fixture",
    versions: {
      methodology: "methodology-v1.0",
      model: "typesafe/jev-1.13-20260917",
      questions: "jev-questions-v1",
      policy: "paper-policy-v1",
      marketRisk: "market-risk-v1",
      positionRisk: "position-risk-v1",
      scorecard: "scorecard-v1",
      sourceManifest: FIXTURE_SOURCE_MANIFEST_VERSION,
      decisionState: FIXTURE_DECISION_STATE_VERSION,
      judgmentInput: FIXTURE_JUDGMENT_INPUT_VERSION,
    },
  });
}
