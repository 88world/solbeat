"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

type TrackedEntry = { addr: string; label: string; addedAt: number };

/**
 * Tracked wallets management section. Only renders when the visitor's
 * connected wallet matches the profile being viewed (i.e., "your own
 * profile"). Lists up to 2 tracked wallets with inline rename + untrack.
 *
 * Sorted by addedAt descending so the most-recently-added shows first.
 * We deliberately don't sort by last-activity timestamp because the
 * tracked_state Upstash key holds a signature string, not a timestamp,
 * and resolving signatures → block times would cost RPC budget we
 * promised not to spend here.
 */
export function TrackedWalletsList({ profileAddress }: { profileAddress: string }) {
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? null;
  const [mounted, setMounted] = useState(false);
  const [list, setList] = useState<TrackedEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    fetch(`/api/tracked/${owner}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { list?: TrackedEntry[] } | null) => {
        if (!cancelled && j?.list) {
          setList([...j.list].sort((a, b) => b.addedAt - a.addedAt));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [owner]);

  // Only render on your own profile.
  if (!mounted || !owner || owner !== profileAddress) return null;
  if (list.length === 0) return null;

  const rename = async (addr: string) => {
    const label = editValue.trim();
    if (!label) return;
    try {
      const r = await fetch(`/api/tracked/${owner}/${addr}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = (await r.json()) as { list?: TrackedEntry[] };
      if (r.ok && json.list) {
        setList([...json.list].sort((a, b) => b.addedAt - a.addedAt));
      }
    } catch {
      /* silent */
    } finally {
      setEditing(null);
    }
  };

  const untrack = async (addr: string) => {
    try {
      const r = await fetch(`/api/tracked/${owner}/${addr}`, {
        method: "DELETE",
      });
      const json = (await r.json()) as { list?: TrackedEntry[] };
      if (r.ok && json.list) {
        setList([...json.list].sort((a, b) => b.addedAt - a.addedAt));
      }
    } catch {
      /* silent */
    }
  };

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 mt-5"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 28px rgba(10, 10, 30, 0.05)",
      }}
    >
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Tracked wallets
        </h3>
        <span className="text-[10px] text-text-muted font-mono">
          {list.length} / 2
        </span>
      </div>
      <ul className="space-y-2">
        {list.map((entry) => (
          <li
            key={entry.addr}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-subtle hover:border-border-emphasized transition"
          >
            {editing === entry.addr ? (
              <input
                autoFocus
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => rename(entry.addr)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename(entry.addr);
                  if (e.key === "Escape") setEditing(null);
                }}
                maxLength={40}
                className="flex-1 px-2 py-1 rounded-md text-[13px] text-text-primary outline-none bg-text-muted/[0.06]"
              />
            ) : (
              <Link
                href={`/wallet/${entry.addr}`}
                className="flex-1 min-w-0 flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <span className="text-[13px] font-bold text-text-primary truncate">
                  {entry.label}
                </span>
                <span className="text-[10.5px] text-text-muted text-mono">
                  {entry.addr.slice(0, 4)}…{entry.addr.slice(-4)}
                </span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                if (editing === entry.addr) return;
                setEditing(entry.addr);
                setEditValue(entry.label);
              }}
              className="text-[10.5px] uppercase tracking-[0.16em] font-bold text-text-muted hover:text-text-secondary transition"
            >
              {editing === entry.addr ? "" : "Rename"}
            </button>
            <button
              type="button"
              onClick={() => untrack(entry.addr)}
              className="text-[10.5px] uppercase tracking-[0.16em] font-bold transition"
              style={{ color: "#c1374a" }}
            >
              Untrack
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] text-text-muted mt-3">
        Free tier: 2 wallets.{" "}
        <span className="text-text-secondary font-bold">Pro coming.</span>
      </p>
    </div>
  );
}
