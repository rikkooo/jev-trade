# U2 audit evidence (issue #12)

Supporting artifacts for `docs/reviews/v0.1.0-ui-ux-accessibility-audit.md` and `docs/reviews/v0.1.0-ui-state-matrix.md`.

## Target identity

| Item | Value |
| --- | --- |
| Frozen worktree | `/home/admin/worktrees/jev-trade-v0.1-ui-target` |
| Frozen commit | `c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9` |
| Frozen tag | `v0.1.0` |
| Deployed origin | `https://www.jev-trade.dev` |
| Deployed `/api/health` revision | `c75b9aa26f8f` (matches frozen commit) |
| Local origin | `http://127.0.0.1:3000` standalone production server of the frozen tree |
| Reviewer | Grok 4.6, CTT-COMM job `20260920-085142-f137`, host `hq-axon`, seat `Grok` |
| Audit window (UTC) | 2026-09-20T00:52:48Z identity check through 2026-09-20T01:14:02Z UI run |

Deployed HTML, routes, and screenshots matched the local frozen build for every compared public path. Findings are reported against that shared revision.

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
- `audit-summary.json` — compact route, axe, skip-link, zoom, and contrast extracts.
- `screenshots/` — one local PNG per cited finding or representative pass. Deployed captures were pixel-identical and were not committed.
