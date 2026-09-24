# U2 audit evidence (issue #12)

Supporting artifacts for `docs/reviews/v0.1.0-ui-ux-accessibility-audit.md` and `docs/reviews/v0.1.0-ui-state-matrix.md`.

## Target identity

| Item | Value |
| --- | --- |
| Frozen worktree | `/home/admin/worktrees/jev-trade-v0.1-ui-target` |
| Frozen commit | `c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9` |
| Frozen tag | `v0.1.0` |
| Report publication build | `0.2.0-alpha.3` |
| Deployed origin | `https://www.jev-trade.dev` |
| Deployed `/api/health` revision | `c75b9aa26f8f` (matches frozen commit) |
| Local origin | `http://127.0.0.1:3000` standalone production server of the frozen tree |
| Reviewer | Grok 4.6, CTT-COMM job `20260920-085142-f137`, host `hq-axon`, seat `Grok` |
| Audit window (UTC) | 2026-09-20T00:52:48Z identity check through 2026-09-20T01:14:02Z UI run |

The two origins shared the frozen product revision during this dated run. One deployed LUMA capture in `audit-summary.json` caught the streaming loading fallback rather than the settled page, so the captures did not match for every path. The public deployment has advanced since this run; these historical observations must not be described as current deployment behavior.

## How the local server was produced

The frozen worktree's `node_modules` originally symlinked to `/home/admin/projects/jev-trade/node_modules`. `next build` (Turbopack) refused that symlink (`points out of the filesystem root`). A local `pnpm install --frozen-lockfile` was used only to produce the standalone server. Product source was not edited. Build and `node_modules` were removed from the frozen tree after the audit.

## Commands

```text
export PATH="/home/admin/.nvm/versions/node/v22.23.2/bin:$PATH"
export PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome
# Chrome 150.0.7871.128; Playwright 1.63.0; axe-core 4.x from /tmp/jev-u2-axe
# existing e2e against reused local server
playwright test --config=/tmp/jev-u2-playwright.config.ts
# 20 passed, 4 skipped (project filters)
vitest run components/decision-workspace.test.tsx components/blind-pick.test.tsx modules/view-model/fixtures.test.ts
# 23 passed
node docs/reviews/evidence/u2-ui-audit/run-audit.mjs
```

Viewports: desktop 1440×1000, tablet 768×1024, mobile 400×860. Input: Playwright keyboard and pointer. No hardware screen reader was attached.

## Files kept

- `run-audit.mjs` — reproduction harness (read-only against the app).
- `audit-summary.json` — a dated condensed capture. Its shape differs from the current `run-audit.mjs` output; the original raw `audit-raw.json` was not retained. It is not an exact replay artifact for every numeric claim in the report.
- `screenshots/` — selected local PNGs for findings and representative passes. Deployed captures were not committed; the LUMA summary row shows a loading-state mismatch.

The independent Opus cold review, summarized in [the report errata](../../v0.1.0-ui-ux-accessibility-audit.md#14-independent-cold-review-errata-and-unresolved-findings-2026-09-24), reproduced F02–F05, F07, F08, and F12, but found that the harness did not test the Tab after the skip-link jump. F01 remains disputed, and no hardware screen-reader or five-participant result is implied by these artifacts.

Numeric examples without retained raw output include the F05 target measurements, F07 sampled contrast ratios, F12 tab trace, F15 viewport widths, the 18-tab-stop focus sample, reduced-motion duration, and the tablet-route results. They are submitted audit observations, not independently replayable numbers from the committed summary.
