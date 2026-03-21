import type { ProviderUserContext } from "./provider.types";

const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;
const IDEMPOTENCY_MAX_ENTRIES = 100;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const buildIdempotencyKey = ({
  method,
  path,
  idempotencyKey,
}: {
  method: string;
  path: string;
  idempotencyKey: string;
}) => `${method.toUpperCase()}:${path}:${idempotencyKey.trim()}`;

export const hashIdempotencyRequest = async ({
  method,
  path,
  body,
}: {
  method: string;
  path: string;
  body: unknown;
}) => {
  const payload = JSON.stringify({
    method: method.toUpperCase(),
    path,
    body,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );

  return toHex(new Uint8Array(digest));
};

export const normalizeIdempotencyMap = (
  entries: ProviderUserContext["idempotency"],
  now = Date.now(),
) => {
  const cutoff = now - IDEMPOTENCY_RETENTION_MS;
  const filtered = Object.entries(entries).filter(([, value]) => {
    const createdAt = Date.parse(value.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });

  filtered.sort((left, right) => {
    return right[1].createdAt.localeCompare(left[1].createdAt);
  });

  return Object.fromEntries(filtered.slice(0, IDEMPOTENCY_MAX_ENTRIES));
};

export const readIdempotencyReplay = ({
  context,
  storageKey,
  requestHash,
}: {
  context: ProviderUserContext;
  storageKey: string;
  requestHash: string;
}) => {
  const entry = context.idempotency[storageKey];

  if (!entry) {
    return { kind: "miss" as const };
  }

  if (entry.requestHash !== requestHash) {
    return { kind: "conflict" as const };
  }

  return {
    kind: "replay" as const,
    status: entry.status,
    body: entry.body,
  };
};

export const storeIdempotencyReplay = ({
  context,
  storageKey,
  requestHash,
  status,
  body,
  now = new Date().toISOString(),
}: {
  context: ProviderUserContext;
  storageKey: string;
  requestHash: string;
  status: number;
  body: Record<string, unknown>;
  now?: string;
}) => ({
  ...context,
  idempotency: normalizeIdempotencyMap({
    ...context.idempotency,
    [storageKey]: {
      requestHash,
      status,
      body,
      createdAt: now,
    },
  }),
});
