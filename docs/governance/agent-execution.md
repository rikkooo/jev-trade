# Jev Trade agent execution and cold DD

This runbook implements the [Phase Two goal](../../GOAL.md). Sol (GPT-6) is the orchestrator. Claude Opus 5.5 is available directly through Claude Code on the HQ box at `high` reasoning effort. The served model was verified on 2026-09-24 from Claude Code JSON `modelUsage` as `claude-opus-5-5`; verify it again in each review receipt. Model availability and quotas may change.

## Three distinct roles

1. **Advisory:** one continuing, read-only Opus session helps Sol reconsider sequence, scope, and conflicts. Its local session ID is saved at `/home/admin/.local/state/jev-trade/opus-advisory-session-id` (outside Git). Resume it with Claude Code `--resume`; after each restart supply the current `GOAL.md`, `ROADMAP.md`, `STATUS.md`, and relevant issue links. It does not edit or sign DD. Its decisions are recorded in reviewed repo artifacts, not merely in chat history.
2. **Execution:** an Opus card starts in its own issue worktree and its own Claude session. Give it the exact issue, pinned base SHA, applicable product contract, acceptance tests, and permitted scope. Use `--model claude-opus-5-5 --effort high`; capture the session ID and exact served model. It may implement and test only that card. Never reuse the advisory or DD session as an executor.
3. **Cold DD:** a fresh session from a different model lineage reads the issue, authority documents, exact commit diff, and repository. It must not inherit the author's prompt, conversation, or private notes. A Claude-family seat cannot DD a Claude-authored change. A fresh GPT-6 Astra or Grok review may judge Opus work; Opus may DD non-Claude work. A model with unverifiable served identity cannot be the sole DD.

The orchestrator checks the model and author provenance, resolves blocker and major findings, and serializes merges and prerelease versions. An author does not mark their own card accepted. Founder sign-off is required for product-boundary changes and accepted material risks.

## Required receipt

Store each cold review as `docs/reviews/issue-N-cold-review.md` or an issue-linked equivalent. Record reviewer lineage and served model, author lineage, exact base/head SHA, worktree or clean-checkout identity, commands and results, reproducible findings by severity, limitations, disposition, and the final tested SHA. A passing command proves only the behavior it exercised. Keep secrets, raw licensed payloads, and protected prompts out of receipts.

Each card remains open until its acceptance criteria, required gates, cold DD, version bump, changelog, roadmap, and status update are complete. Conditional rights or evidence holds must state the missing proof and owner. `NOT ENOUGH EVIDENCE` is a valid scientific result, not a software pass.

## Current recovery sequence

- Merge the Phase Two program PR #29, then land the existing #11, #12, and #14 reports with their limits intact.
- For #15, treat Terra's `69a921e` as unverified partial work. Opus writes a salvage-or-redo decision, completes the contract and migration gates, and asks a fresh GPT-6 Astra session for DD on the exact commit.
- Keep prospective publication held until the independent timestamp sink in #30, pack data rights, runtime evidence, and forward-outcome rules all pass. Fixture and replay work may continue behind those gates.
