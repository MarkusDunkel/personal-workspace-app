import type {
  AzureBoardsCategory,
  DigestApplyResult,
  DigestPlanResponse,
  IngestResult,
  IngestScanResponse,
  SubmitDecision,
} from './azureBoardsTypes';

export async function scanIngest(category: AzureBoardsCategory): Promise<IngestScanResponse> {
  const res = await fetch('/api/azureboards/ingest/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `POST /api/azureboards/ingest/scan failed: ${res.status}`);
  return body;
}

export async function applyIngestDecisions(
  reviewToken: string | null,
  decisions: SubmitDecision[],
  category: AzureBoardsCategory,
): Promise<IngestResult> {
  const res = await fetch('/api/azureboards/ingest/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewToken, decisions, category }),
  });
  const body: IngestResult = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `POST /api/azureboards/ingest/apply failed: ${res.status}`);
  return body;
}

export async function planDigest(category: AzureBoardsCategory): Promise<DigestPlanResponse> {
  const res = await fetch('/api/azureboards/digest/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `POST /api/azureboards/digest/plan failed: ${res.status}`);
  return body;
}

export async function applyDigest(planToken: string): Promise<DigestApplyResult> {
  const res = await fetch('/api/azureboards/digest/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planToken }),
  });
  const body: DigestApplyResult = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `POST /api/azureboards/digest/apply failed: ${res.status}`);
  return body;
}
