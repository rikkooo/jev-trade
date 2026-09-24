# Preliminary Opus governance DD (2026-09-24)

- **Served model:** `claude-opus-5-5` from Claude Code `modelUsage`; `high` effort.
- **Target:** staged diff on `fb667d1` before commit `2b5dd0b`; this was not a clean-checkout test.
- **Independence limit:** the PR includes an Opus-authored advisory artifact, and this session loaded HQ Claude customizations. This review is an adversarial input, not the independent #10 acceptance DD. Grok 4.6 is assigned to the final commit.
- **Outcome:** changes required; Sol applied the material corrections before requesting Grok DD.

# Cold DD: issue #10, staged governance diff (Sol-authored; Claude artifact treated as source evidence)

## Verdict: CHANGES REQUIRED

The pivot is written down consistently. Sol orchestrates, Opus 5.5 executes and does DD, and Claude-authored work cannot get Claude-only DD. GOAL states that the simulation boundary, evidence standard, four-pack contract and completion criteria are unchanged. The false "complete/ready" claims are corrected. The timestamp sink (#30), the #31 gate before the first real Jev call, and the #21 Swing card's dependency on #14 now appear in both the plan and the roadmap.

The defects below are about how the independence rule is written and applied. Some exit gates exist only in the advisory snapshot. Some statements will become false once this merges.

## Findings

**1. The lineage rule can be met on paper and still fail, starting with #15.**
- **Where:** `GOAL.md` § Execution mandate; `agent-execution.md` § Three distinct roles (3) and § Current recovery sequence; `STATUS.md` #15 row; `ROADMAP.md` § Parallel execution policy.
- **Defect:** GOAL requires "a reviewer from a different model lineage" for every card. The runbook only puts the Claude case into practice.
  - It never defines "lineage".
  - It never says what happens when one commit has authors from two lineages.
  - It bars a model whose served identity can't be verified only from being the *sole DD*. Nothing stops it from being an *author*.
- **#15:** commit `69a921e` is Terra's draft (OpenAI lineage, per the artifact's list of agent seats) and carries a `Co-Authored-By: Claude Opus 5` trailer. Opus 5.5 is now salvaging it. The assigned reviewer, GPT-6 Astra, is also OpenAI lineage. If Opus salvages rather than redoes the work, Terra's code gets same-lineage review, which breaks GOAL's own rule on the first card of the pivot.
- **K3:** its served model is unverifiable (per the artifact), yet it is primary author of #18 (leakage suite), #20 (statistics) and #23. Nobody can show that its lineage differs from its reviewer's.
- **PR #29 itself:** it contains a Claude-authored file plus rules taken from Claude advice. Under the new rule, a Claude reviewer (this one) cannot validate it.
- **Fix:**
  - Define lineage as the vendor/model family.
  - Count every contributing lineage as an author, including co-author trailers. The reviewer must come from outside all of them.
  - #15 DD goes to Grok or Gemini. Astra is acceptable only if Opus records a full redo.
  - An author with unverifiable identity needs either verified identity or two reviewers from different verified lineages.
  - Require authored-by trailers on commits.

**2. The rule only checks who wrote the code, not conflicts of interest.**
- **Where:** `agent-execution.md` (3), "Opus may DD non-Claude work"; `ROADMAP.md` Stage 1.
- **Defect:** Opus 5.5 now writes the core platform: #15, #16, #17 and #30. #18 exists to attack that code and #20 judges its outputs. As written, Opus may cold-review both, so the lineage under test would approve its own tests. The artifact's §5 advised against this; the disposition neither adopts nor narrows that advice.
- **Fix:** a lineage may not review a card whose purpose is to test, attest or evaluate that lineage's own work.

**3. Authors, including the orchestrator, can effectively accept their own work.**
- **Where:** `GOAL.md` ("orchestrator resolves findings and serializes merges"); `agent-execution.md` paragraph after the roles and § Current recovery sequence; `ROADMAP.md` policy.
- **Sol as author:** Sol writes #10, #13 and #26 but also resolves findings and merges. No one else is named to accept a card when the author is the orchestrator.
  - "Resolve" can mean dismissing a blocker or major finding.
  - Founder sign-off covers only "accepted material risks", not findings marked INVALID.
  - This matters most for #13. There Sol reconciles audits of v0.1 code whose author lineage was never recorded (artifact F11, not addressed).
- **Reviewer shopping:** reviewers are assigned "before implementation acceptance", which can be after the diff has been seen. Nothing keeps receipts from reviews that were replaced.
- **Author-launched review:** the runbook says Opus "asks a fresh GPT-6 Astra session for DD". That means the author writes the reviewer's prompt, which contradicts "must not inherit the author's prompt".
- **Fix:**
  - Cards the orchestrator wrote need acceptance by the founder or a named non-author.
  - Marking a blocker or major finding INVALID or ACCEPTED_RISK needs founder sign-off.
  - Fix the reviewer when the card starts and keep every receipt.
  - The orchestrator, not the author, launches the review.

**4. On this box, a Claude session cannot actually start "fresh".** (I observed this in the context loaded into this session.)
- **Where:** `agent-execution.md` roles 1–3.
- **Defect:** Claude Code sessions on this box automatically load:
  - `/home/admin/CLAUDE.md`, the HQ rules, including "no GO needed", "standing authority to push" and "asking = idling = failure";
  - a global SessionStart hook that injects stored memory;
  - a persistent memory directory for the jev-trade project.
- **Consequence:** an advisory or executor session can leave notes that a later Opus reviewer loads automatically. The HQ autonomy rules also compete with Jev's own chain of authority. The runbook forbids inheriting "private notes" but doesn't cover these routes.
- **Fix:**
  - Run Claude executor and reviewer sessions with project memory and hooks disabled, or verified empty.
  - State that `GOAL.md` and `AGENTS.md` override the parent HQ instructions for Jev work.
  - Record how each session was launched in its receipt.

**5. The #15 exit gate lost the specific timestamp and security defects.**
- **Where:** `ROADMAP.md` § Current execution gate; `agent-execution.md` § Current recovery sequence; `STATUS.md` #15 row.
- **Defect:** these files only say "full contract, migration, least-privilege, clean-checkout" gates. The concrete defects in `69a921e` appear only in the non-authoritative advisory snapshot:
  - The contract rejects LATE, MISSING and FAILED receipts, although P2-R57/AE13 requires them to stay visible.
  - The `jev_operator` database role can append receipts marked timely on its own say-so.
  - Sensitive fields are redacted by key name only.
  - Nothing blocks imports of the canonicaliser whose key order depends on the host locale.
  - The rollback window that Sol's own disposition says #15 "must document and test" is missing.
- **Consequence:** the runbook itself says a passing command proves only what it exercised. The existing gates could pass with every one of these unfixed.
- **Fix:** make each one a numbered #15 acceptance criterion, unless the issue card already has them (I can't see it).

**6. Data rights: #14 is presented as further along than it is, and no one is named who can clear rights.**
- **Where:** `ROADMAP.md` #14 row ("rights DD pending"); `STATUS.md` #14 next gate; plan U4 Files and Approach; `agent-execution.md` ("land… with limits intact").
- **Scope gap:** plan U4 now requires sources for short-borrow/locate data, a survivorship-free stock universe, and runtime benchmarks. Per the artifact, `7199c1b` has none of them. Its runtime check is marked "PASS" with no benchmark. The roadmap reads as if only the review is left, when the research itself isn't finished.
- **Path changes:** the plan's deliverable paths were renamed to match the unreviewed artifact. The data dictionary moved from `docs/governance/` to `docs/research/`.
- **Label:** landing it "with limits intact" would put a report titled "Canonical Legal & Rights Audit" on `main`. Artifact finding F8, which flagged that label, was neither adopted nor narrowed.
- **Clearance:** the gate is described as a model "rights DD", yet #14 itself says legal counsel must confirm. A model reading vendor terms pages could end up recorded as the rights clearance for going live.
- **Fix:**
  - Mark #14 as incomplete against the widened U4 scope.
  - Before landing, remove the "canonical" label and change runtime to UNMEASURED, or add a non-authoritative banner.
  - Define rights clearance as a receipt per source and per field or use: executed terms or a counsel determination, accepted by the founder.
  - A model reviewer checks only that sources are traceable.

**7. The roadmap doesn't show who reviews each card, and the new cards aren't wired in.**
- **Where:** `ROADMAP.md` Stage 0–3 tables and Stage 0 prose; the plan's unit table.
- **No reviewer column:** no table names a cold reviewer. The artifact reports Opus5 as reviewer on 14 of 18 cards, including #15 and #17, which are now assigned to Opus 5.5. Whether those reviews were reassigned can't be checked from the repo.
- **No worker on #19 and #21:** they say "assigned at start", so no reviewer from a valid lineage can be named. #10 requires every card to name its worker and reviewer.
- **#31–#34 exist only in prose:** they have no worker, reviewer, state or blocked-by links. It's undefined whether #13, and through it #26, waits on #32 and #33.
- **Fix re-verification (F3) was dropped:** the artifact found three conflicting rules for who re-checks fixes, and nothing resolves them. If Opus 5.5 writes the fixes, as the artifact expects, the "finder re-checks" path becomes Claude reviewing Claude.
- **Tables contradict the rule that GitHub's blocked-by links mirror them:**
  - #18 is hard-blocked on #17 in the table, but the prose starts it after #15 and #16.
  - #17 is hard-blocked on #31 in ROADMAP but only conditionally in plan U7.
- **Fix:**
  - Add a reviewer column that shows lineage.
  - Add a table for the fix cards.
  - Pick one rule for who re-checks fixes.
  - Align the dependency links.

**8. Several statements become false the moment this merges.**
- **Where:** `STATUS.md` header ("in open PR #29; `main` remains v0.1.0 until it merges"); `ROADMAP.md` #10 row and Stage 0 prose; `CHANGELOG.md` alpha.1 heading.
- **Defect:** each of these becomes false once PR #29 lands on `main`.
- **CHANGELOG:** this diff leaves the alpha.1 heading untouched, and the artifact (F1) says the file records alpha.1 as released. If the heading is dated 2026-09-20, it contradicts STATUS and the rule that build numbers are assigned at merge.
- **Frozen target:** STATUS also shortens the frozen v0.1.0 revision to a 12-character prefix and no longer calls it the frozen validation target, which #10's scope requires.
- **Fix:** before merge, make a final commit worded to be true after the merge, date the alpha.1 entry at merge time, and restore the frozen-target line.

**9. STATUS softened the simulation-only boundary.**
- **Where:** `STATUS.md` § Holds and blockers, "Future products".
- **Defect:**
  - "Real-money automation: outside Phase Two and outside the committed roadmap" became "any real-money path remain[s] held by their separate evidence and product gates". That turns an exclusion into something that sounds like it will open later.
  - "Phase Two schedules only operator-run research cohorts" was dropped.
  - The line saying brokerage, deposits, order execution and allocation are absent was dropped.
- **Consequence:** this contradicts GOAL's statement that the pivot is "not a change to the simulation boundary".
- **Fix:** restore the original wording.

**10. The formatting check probably fails, and "checks green" is out of date.**
- **Where:** plan Implementation Units rows U7, U11, U16 and E1, whose columns are misaligned while the rest of the file is aligned; the new review file's unpadded `|---|` tables; `STATUS.md` #10 row.
- **Consequence:** if Prettier covers these paths, the format check fails #10's "formatting and repository checks pass". Either way, "green at last review" predates this revision.
- **Fix:** rerun the format and link checks on the final commit and record the result.

**11. Holds have no owners, and two dropped items put evidence at risk.**
- **Where:** `STATUS.md` § Holds and blockers.
- **No owners:** the runbook says each hold must state the missing proof and an owner. None of the seven holds names an owner.
- **Terra's capacity problem (F9) was dropped.** Terra is still primary worker on #22, #24, #25 and #26, and a candidate for #19 and #21.
- **#11's raw evidence may be lost.** It exists only in `/tmp/jev-audit-c75b9aa/evidence` on a disk that is 99% full. The artifact's recommended checksum list and durable archive were dropped. Losing these files would make the #11 audit impossible to reproduce.
- **Fix:**
  - Name an owner for each hold.
  - Add Terra's availability as a hold.
  - Add a step to checksum and archive the #11 evidence before any cleanup or reboot.

**12. The GOAL change has no founder record.**
- **Where:** `GOAL.md` header and § Execution mandate.
- **Defect:** the orchestrator edited the founder-locked goal without linking a founder decision. #10 traces to the goal's change-control contract, so a later reader can't tell a founder mandate from an orchestrator's assertion.
- **Fix:** link the approval, for example an issue comment or signed note.

## Limits

- **What I saw:** only the staged diff and #10's text. I did not see:
  - the unchanged parts of GOAL, ROADMAP, the plan or CHANGELOG, including the alpha.1 heading;
  - `VERSION`, `package.json`, `versioning.md` or `VISION.md`;
  - issue cards #11–#34, the milestone or the blocked-by links;
  - CI results or the audit reports themselves.

  Findings 5 and 7 may be partly resolved in issue cards I can't see.
- **No commands run:** as instructed, I reran no gates. This is a document review, not a DD receipt that meets the protocol. It applies to the staged changes on top of `fb667d1`, which have no commit SHA yet, so it has to be re-applied to the final commit.
- **The artifact's facts are unverified:** I took the Opus artifact's claims as source evidence without checking them. That covers seat lineages, K3's unverifiable model, line numbers, Terra's status, disk space and the `/tmp` logs. Findings 1, 2, 5, 6 and 11 depend on them.
- **I am not independent here:** I'm Claude (served model `claude-opus-5-5` according to my system context; not checked against `modelUsage`). This PR contains Claude-written content and rules taken from Claude advice. This session also loaded the HQ `CLAUDE.md` and a memory hook. By the PR's own rule, this review can only add to #10's assigned Grok 4.6 review, not replace it.

I made no edits. Next, Sol addresses findings 1–9, then Grok 4.6 does the review #10 assigns on the final commit.

---

## Sol's disposition before final Grok DD

- **Findings 1–3:** defined provider/family lineage and mixed-authorship exclusion in `GOAL.md` and the agent runbook; changed #15 to Grok DD; prevented Opus from accepting tests of its own substrate; fixed reviewer assignment at card start, preserved dissenting receipts, required founder sign-off for `ACCEPTED_RISK` and `INVALID_WITH_COUNTEREVIDENCE`, and made Sol the DD dispatcher.
- **Finding 4:** future Claude sessions use `--safe-mode` with explicit repo authority. The already-running advisory and #15 execution sessions began without it and cannot be recast as fresh DD. Their limitations must be disclosed to #15's reviewer.
- **Findings 5–7:** added numbered #15 issue gates, corrected #14 to incomplete research with use-specific rights clearance, added a roadmap DD assignment matrix, updated issue ownership, and clarified #18 early work versus full closure. #31 is required before #17 closes or makes a real Jev call.
- **Findings 8–9:** dated alpha.1 at its planned merge day, made PR merge state link-authoritative, restored the full frozen v0.1.0 SHA and the explicit operator-only/simulation boundary.
- **Finding 10:** Prettier, ESLint, TypeScript, and all 340 unit tests passed before the follow-up edits; the final head reruns formatting and CI. The reviewer had no direct check evidence for its predicted format failure.
- **Finding 11:** named hold owners and preserved all 30 #11 raw logs privately with SHA-256 manifest at `/home/admin/jev-trade-evidence/issue-11/`.
- **Finding 12:** recorded the founder's 2026-09-24 authorization in `docs/decisions/0002-opus-execution-pivot.md` and linked it from the goal. The conversation itself remains private.

This disposition does not replace the final independent Grok review or prove data rights, predictive efficacy, or Phase Two implementation readiness.
