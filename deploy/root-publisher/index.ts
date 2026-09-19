import {
  isTimelyAttestation,
  toDispatchEnvelope,
  type LedgerRoot,
} from "@/modules/ledger/root-chain";

export interface RootPublisherEnvironment {
  readonly DURABLE_WRITES?: string;
  readonly ROOT_ATTESTATION_ENABLED?: string;
  readonly ROOT_ARCHIVE_ENABLED?: string;
  readonly GITHUB_REPOSITORY?: string;
  readonly GITHUB_ROOT_DISPATCH_TOKEN?: string;
  readonly DEPLOYMENT_SHA?: string;
}

export interface RootDispatchReceipt {
  readonly accepted: true;
  readonly batchKey: string;
  readonly rootHash: string;
  readonly repository: string;
  readonly acceptedAt: string;
  readonly externalAttestation: "pending";
}

export async function publishLedgerRoot(
  root: LedgerRoot,
  environment: RootPublisherEnvironment,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  now: () => Date = () => new Date(),
): Promise<RootDispatchReceipt> {
  if (
    environment.DURABLE_WRITES !== "true" ||
    environment.ROOT_ATTESTATION_ENABLED !== "true" ||
    environment.ROOT_ARCHIVE_ENABLED !== "true"
  ) {
    throw new Error(
      "root publication is disabled without durable writes, attestation, and durable root archival",
    );
  }
  const repository = environment.GITHUB_REPOSITORY;
  const token = environment.GITHUB_ROOT_DISPATCH_TOKEN;
  const sourceRevision = environment.DEPLOYMENT_SHA;
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("root publication requires a valid GitHub repository");
  }
  if (!token) {
    throw new Error("root publication requires a dispatch credential");
  }
  if (!sourceRevision) {
    throw new Error("root publication requires the deployment revision");
  }
  const acceptedAt = now().toISOString();
  if (!isTimelyAttestation(root, acceptedAt)) {
    throw new Error("root publication deadline has passed");
  }
  const payload = toDispatchEnvelope(root, sourceRevision);
  const response = await fetchImplementation(
    `https://api.github.com/repos/${repository}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "ledger-root",
        client_payload: payload,
      }),
    },
  );
  if (response.status !== 204) {
    throw new Error(`root dispatch failed with status ${response.status}`);
  }
  return {
    accepted: true,
    batchKey: root.batchKey,
    rootHash: root.rootHash,
    repository,
    acceptedAt,
    externalAttestation: "pending",
  };
}
