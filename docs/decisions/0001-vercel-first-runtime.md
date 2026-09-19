# ADR 0001: Vercel-first prototype runtime

- **Status:** accepted
- **Date:** 2026-09-19
- **Supersedes:** the box-first hosting choice in KTD1 for the prototype deployment only

## Context

The implementation plan originally targeted a western Linux box. The project owner later created the Vercel project `jev-trade`, attached `jev-trade.dev`, and directed the prototype to use Vercel while keeping the HQ box for builds and validation.

The product's audit, simulation, data-rights, and safety requirements remain unchanged. Vercel Functions do not provide a durable local filesystem or an always-on worker.

## Decision

Deploy the public Next.js app on Vercel using Node.js 22. Use committed synthetic fixtures for the first read-only online demonstration. Fixture mode fails closed for server-side mutations and labels browser-only game state as local and non-prospective.

Use Neon Postgres through Vercel Marketplace for the durable ledger when provisioned. Replace the long-running worker with authenticated, idempotent Vercel Cron routes that claim bounded work from Postgres. Keep portable Docker files for HQ-box validation and disaster recovery.

Use OpenRouter's dedicated Decisions endpoint for Jev. The Vercel AI Gateway credential is a separate optional development path and does not replace the supplied OpenRouter transport.

## Consequences

- The fixture deployment can validate product flow and responsive design before market-data rights or a database contract exist.
- No deployed result is called live, prospective, or durable until Postgres and provider gates pass.
- Operator mutations remain local scripts for the prototype; no public admin surface is exposed.
- The production region is `iad1`, colocated with the recommended Neon region.
- Domain ownership and DNS remain with the project owner.

The supporting architecture and operational controls are documented in `docs/research/vercel-runtime-architecture.md`.
