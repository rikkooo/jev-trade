# Jev Trade status

- **Updated:** 2026-09-20
- **Active goal:** [Phase Two](GOAL.md)
- **Active milestone:** [v0.2.0 — Evidence Lab](https://github.com/rikkooo/jev-trade/milestone/1)
- **Program epic:** [#28](https://github.com/rikkooo/jev-trade/issues/28)
- **Current build:** `0.2.0-alpha.1`
- **Current tranche:** [#11](https://github.com/rikkooo/jev-trade/issues/11), [#12](https://github.com/rikkooo/jev-trade/issues/12), [#14](https://github.com/rikkooo/jev-trade/issues/14), and fixture-safe work in [#15](https://github.com/rikkooo/jev-trade/issues/15)

## Current position

The founder-approved goal, durable vision, requirements, release policy, milestone, labels, and 18 executable child cards are established in `0.2.0-alpha.1`. Independent validation, data-readiness research, and fixture-safe platform work form the first parallel execution tranche.

The public product remains the fixture-only v0.1.0 prototype at [www.jev-trade.dev](https://www.jev-trade.dev), built from `c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9`. It remains the frozen target for independent review. No Phase Two predictor or live market-data behavior is deployed yet.

## Latest verified baseline

- v0.1.0 passed its recorded local, CI, build, and deployment checks before publication; #11 will rerun and judge those claims independently.
- The fixture deployment exposes synthetic, non-current data and fails closed for durable writes.
- The v0.1.0 scorecard has no prospective evidence and makes no efficacy claim.
- Brokerage, deposits, order execution, personalized allocation, and real-money automation remain absent.

## Active work

| Work                               | State                       | Owner            | Evidence expected                                               |
| ---------------------------------- | --------------------------- | ---------------- | --------------------------------------------------------------- |
| Governance and requirements        | Complete in alpha.1         | Sol              | Green checks, cold document review, merged PR, issue #10 closed |
| Cold code and release audit        | Ready                       | Opus5            | Requirement matrix, gate reruns, adversarial report             |
| Cold UI/UX audit                   | Ready                       | Grok 4.6         | State matrix, traces, accessibility and comprehension report    |
| Data-rights and readiness research | Ready                       | Gemini 3.8 Flash | Rights matrix, data dictionary, cost and activation gates       |
| Core Phase Two contracts           | Ready for fixture-safe work | Terra            | Versioned schemas, migrations, invariants, safe projections     |

## Next gate

Dispatch #11, #12, #14, and the fixture-safe portion of #15 in parallel. Live activation remains held. The next governance checkpoint reconciles the two independent audits and founder testing in #13 while the shared contracts proceed on fixtures.

## Holds and blockers

There is no blocker to planning, validation, fixtures, or the shared contracts.

- **Live Day and Scalping:** held until provider rights, timestamp precision, health, cost, and execution-model gates pass.
- **Long-Term conclusions:** held until prospectively frozen outcomes mature; software and cohort launch may proceed earlier.
- **Public predictor SaaS:** held until the v0.2.0 evidence gate says go and a separate public-service release covers authentication, tenancy, quotas, and disclosures.
- **Learner-triggered paper automation:** held for the v0.4.0 gate; Phase Two schedules only operator-run research cohorts.
- **Real-money automation:** outside Phase Two and outside the committed roadmap.

## Decision state

- **Known:** the v0.1.0 fixture product is deployed and reproducible under its recorded release evidence.
- **Unknown:** whether Jev improves forecasting or simulated policy results beyond equivalent deterministic and naive controls.
- **Method:** preregistered prospective cohorts carry authority; historical replay remains exploratory.
- **Required final decision:** `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` for each pack and proposed next product stage.

## Update rule

This file describes the present, not the desired future. Update it after every merged issue, material audit finding, activation decision, deployment change, or new blocker. Move durable principles to `VISION.md`, requirements to the Phase Two plan, implementation details to issue cards, and release history to `CHANGELOG.md`.
