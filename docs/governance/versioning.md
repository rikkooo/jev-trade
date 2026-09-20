# Version and release policy

## Purpose

Jev Trade uses one visible version across the package manifest, the root `VERSION` file, application metadata, evidence records, release receipts, and the changelog. A reader must be able to connect a public result to the exact build that produced it.

## Version shape

- Stable releases use semantic versions such as `0.1.0` and `0.2.0`.
- Work toward a release uses monotonic prerelease builds such as `0.2.0-alpha.1`, `0.2.0-alpha.2`, and `0.2.0-rc.1`.
- The active release line is defined in `ROADMAP.md`; the exact current build is defined by `VERSION`.
- Git tags are reserved for release candidates and stable releases. Routine alpha builds remain traceable through commits, pull requests, issues, and changelog entries.

## Issue completion rule

Every issue that changes the repository and closes through a merge must:

1. rebase or update against the latest release branch before final review;
2. take the next unused prerelease number on that branch;
3. update `VERSION` and `package.json` to the same value;
4. add a `CHANGELOG.md` entry with the issue and pull request references; and
5. expose the version in any new evidence record or report produced by the change.

The release orchestrator serializes the final version bump when parallel pull requests are ready. This avoids assigning numbers on feature branches that later merge out of order.

Documentation-only program setup for Phase Two establishes `0.2.0-alpha.1`. Each later closing issue increments the alpha number. The release changes to `0.2.0-rc.1` after all required cards are complete and to `0.2.0` after the release gates pass.

## Source-of-truth order

When version surfaces disagree, resolve them in this order:

1. the version in the release's signed or committed release receipt;
2. the version in the deployed commit's `VERSION` file;
3. the version in the deployed commit's `package.json`;
4. display metadata derived during the build.

A disagreement blocks release verification.

## Changelog policy

`CHANGELOG.md` records user-visible behavior, experimental-method changes, data or policy compatibility boundaries, security fixes, operations changes, and governance changes that affect execution. Entries state what changed and why it matters. A model, prompt, feature, policy, scoring, or cohort-definition change must be explicit because it can invalidate aggregation.

## Release evidence

Release candidates and stable releases must include:

- the exact commit, version, deployment revision, and canonical origin;
- all required local and CI gate results;
- migration and rollback evidence when storage changes;
- active data-rights and public-mode gate results;
- unresolved known issues and accepted risks; and
- a link to the milestone and changelog section.
