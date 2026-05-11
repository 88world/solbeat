/**
 * Storage helpers for the wallet-tracking feature.
 *
 * Schema:
 *   tracked:list:{owner}   → TrackedWallet[] (max 2 entries, enforced)
 *   tracked_state:{addr}   → last-seen signature for diff detection
 *   tracked_cooldown:{addr}→ unix ms of last actual Helius poll call
 *
 * All operations route through the existing cache helpers (Upstash with
 * in-memory fallback) so the feature degrades gracefully when Upstash is
 * unavailable — the rest of the site stays up.
 */

import { cacheGet, cacheSet } from "@/lib/cache/redis";

export type TrackedWallet = {
  addr: string;
  label: string;
  addedAt: number;
};

export const TRACKED_MAX = 2;
const LIST_TTL_S = 60 * 60 * 24 * 90; // 90 days; effectively persistent
const STATE_TTL_S = 60 * 60 * 24 * 7; // 7 days
const POLL_COOLDOWN_MS = 10 * 60 * 1000; // 10 min, hard rule

const listKey = (owner: string): string => `tracked:list:${owner}`;
const stateKey = (addr: string): string => `tracked_state:${addr}`;
const cooldownKey = (addr: string): string => `tracked_cooldown:${addr}`;

export async function getTrackedList(owner: string): Promise<TrackedWallet[]> {
  const list = await cacheGet<TrackedWallet[]>(listKey(owner));
  return Array.isArray(list) ? list : [];
}

/** Adds a tracked wallet. Returns the new list, or `null` if at cap. */
export async function addTracked(
  owner: string,
  entry: { addr: string; label: string },
): Promise<TrackedWallet[] | null> {
  const list = await getTrackedList(owner);
  // Idempotent: re-adding same addr just updates the label.
  const existingIdx = list.findIndex((e) => e.addr === entry.addr);
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], label: entry.label };
    await cacheSet(listKey(owner), list, LIST_TTL_S);
    return list;
  }
  if (list.length >= TRACKED_MAX) return null;
  const next: TrackedWallet[] = [
    ...list,
    { addr: entry.addr, label: entry.label, addedAt: Date.now() },
  ];
  await cacheSet(listKey(owner), next, LIST_TTL_S);
  return next;
}

export async function renameTracked(
  owner: string,
  addr: string,
  label: string,
): Promise<TrackedWallet[]> {
  const list = await getTrackedList(owner);
  const next = list.map((e) => (e.addr === addr ? { ...e, label } : e));
  await cacheSet(listKey(owner), next, LIST_TTL_S);
  return next;
}

export async function untrack(
  owner: string,
  addr: string,
): Promise<TrackedWallet[]> {
  const list = await getTrackedList(owner);
  const next = list.filter((e) => e.addr !== addr);
  await cacheSet(listKey(owner), next, LIST_TTL_S);
  return next;
}

/** Per-wallet last-seen signature (for diff-based event derivation). */
export async function getLastSignature(addr: string): Promise<string | null> {
  return cacheGet<string>(stateKey(addr));
}

export async function setLastSignature(
  addr: string,
  signature: string,
): Promise<void> {
  await cacheSet(stateKey(addr), signature, STATE_TTL_S);
}

/**
 * Per-wallet poll cooldown. Returns true and updates the cooldown if it's
 * been more than POLL_COOLDOWN_MS since the last actual Helius call —
 * caller should fire the RPC. Returns false if still in cooldown — caller
 * should skip and return empty events.
 */
export async function tryClaimPollCooldown(addr: string): Promise<boolean> {
  const last = await cacheGet<number>(cooldownKey(addr));
  const now = Date.now();
  if (typeof last === "number" && now - last < POLL_COOLDOWN_MS) {
    return false;
  }
  await cacheSet(cooldownKey(addr), now, Math.ceil(POLL_COOLDOWN_MS / 1000) * 2);
  return true;
}
