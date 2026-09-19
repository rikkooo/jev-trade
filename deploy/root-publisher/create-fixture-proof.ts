import { buildFixtureManualProof } from "@/scripts/fixture-proof";

process.stdout.write(`${JSON.stringify(buildFixtureManualProof(), null, 2)}\n`);
