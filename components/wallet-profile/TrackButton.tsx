"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type TrackedEntry = { addr: string; label: string; addedAt: number };

/**
 * Track button shown on every public wallet profile. Three behavioral
 * states keyed off wallet-adapter connection + tracked-list state:
 *
 *   - Not connected → "Connect wallet to track" opens wallet modal
 *   - Connected + not tracking this addr + under cap → "Track" opens
 *     label modal
 *   - Connected + at cap (2 tracked) trying to add new → upsell modal
 *     ("Free tier supports 2. Pro tier coming soon.")
 *   - Connected + already tracking this addr → "Tracked as {label}" with X
 *     to untrack
 *
 * Self-protection: hides entirely when viewing your own profile (you
 * can't track yourself).
 */
export function TrackButton({ profileAddress }: { profileAddress: string }) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const owner = publicKey?.toBase58() ?? null;

  const [mounted, setMounted] = useState(false);
  const [list, setList] = useState<TrackedEntry[]>([]);
  const [modal, setModal] = useState<"closed" | "label" | "upsell" | "connect">(
    "closed",
  );
  const [labelInput, setLabelInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid SSR/CSR mismatch: render only after mount.
  useEffect(() => setMounted(true), []);

  // Fetch this owner's tracked list when connected.
  useEffect(() => {
    if (!owner) {
      setList([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/tracked/${owner}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { list?: TrackedEntry[] } | null) => {
        if (!cancelled && j?.list) setList(j.list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [owner]);

  if (!mounted) return null;

  // Hide on own profile.
  if (owner && owner === profileAddress) return null;

  const tracked = list.find((e) => e.addr === profileAddress);
  const atCap = list.length >= 2 && !tracked;

  const openTrackFlow = () => {
    setError(null);
    if (!owner) {
      setModal("connect");
      return;
    }
    if (atCap) {
      setModal("upsell");
      return;
    }
    setLabelInput(tracked?.label ?? "");
    setModal("label");
  };

  const save = async () => {
    if (!owner) return;
    const label = labelInput.trim();
    if (!label) {
      setError("Label can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/tracked/${owner}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addr: profileAddress, label }),
      });
      const json = (await r.json()) as { list?: TrackedEntry[]; error?: string };
      if (!r.ok) {
        if (json.error === "limit_reached") {
          setModal("upsell");
        } else {
          setError(json.error ?? "Couldn't save. Try again.");
        }
        return;
      }
      setList(json.list ?? []);
      setModal("closed");
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const untrack = async () => {
    if (!owner || !tracked) return;
    try {
      const r = await fetch(`/api/tracked/${owner}/${profileAddress}`, {
        method: "DELETE",
      });
      const json = (await r.json()) as { list?: TrackedEntry[] };
      if (r.ok && json.list) setList(json.list);
    } catch {
      /* silent */
    }
  };

  // ── Render ──
  if (tracked) {
    return (
      <span
        className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{
          background: "rgba(255, 45, 156, 0.10)",
          color: "#FF2D9C",
          boxShadow: "inset 0 0 0 1px rgba(255, 45, 156, 0.35)",
        }}
      >
        <span aria-hidden>★</span>
        Tracked as {tracked.label}
        <button
          type="button"
          onClick={untrack}
          aria-label="Untrack"
          className="size-5 rounded-full flex items-center justify-center hover:bg-accent-pulse/15 transition"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openTrackFlow}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-[0.14em] transition hover:scale-[1.03] active:scale-[0.97]"
        style={{
          background: "var(--glass-soft)",
          color: "var(--text-secondary)",
          boxShadow: "inset 0 0 0 1px var(--border-subtle)",
        }}
      >
        <span aria-hidden>＋</span>
        {owner ? "Track" : "Connect to track"}
      </button>

      {modal !== "closed" && (
        <ModalShell onClose={() => setModal("closed")}>
          {modal === "connect" && (
            <ConnectPrompt
              onConnect={() => {
                setModal("closed");
                setVisible(true);
              }}
              onClose={() => setModal("closed")}
            />
          )}
          {modal === "upsell" && (
            <UpsellPrompt onClose={() => setModal("closed")} />
          )}
          {modal === "label" && (
            <LabelPrompt
              profileAddress={profileAddress}
              value={labelInput}
              onChange={setLabelInput}
              onSave={save}
              onClose={() => setModal("closed")}
              saving={saving}
              error={error}
            />
          )}
        </ModalShell>
      )}
    </>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 10, 30, 0.55)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          background:
            "linear-gradient(135deg, var(--glass-strong), var(--glass-medium)), var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.08) inset, 0 16px 48px rgba(10, 10, 30, 0.30)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ConnectPrompt({
  onConnect,
  onClose,
}: {
  onConnect: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <h3 className="text-[15px] font-bold text-text-primary mb-1">
        Connect wallet to track
      </h3>
      <p className="text-[12.5px] text-text-secondary mb-4">
        Tracking lives in your account. Connect to add this wallet to your
        watchlist.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConnect}
          className="flex-1 h-9 rounded-full text-[12px] font-bold text-white"
          style={{
            background:
              "linear-gradient(110deg, #FF2D9C 0%, #5E5CFF 60%, #14F195 110%)",
          }}
        >
          Connect wallet
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 rounded-full text-[12px] font-bold text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function UpsellPrompt({ onClose }: { onClose: () => void }) {
  return (
    <>
      <h3 className="text-[15px] font-bold text-text-primary mb-1">
        You&apos;re at the free-tier limit
      </h3>
      <p className="text-[12.5px] text-text-secondary mb-4">
        Free tier supports tracking <span className="text-mono">2</span>{" "}
        wallets. Untrack one from your profile to make room, or wait for{" "}
        <span className="font-bold text-text-primary">Pro tier</span> (coming
        soon) for unlimited tracking + alerts.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full h-9 rounded-full text-[12px] font-bold text-text-primary"
        style={{
          background: "var(--glass-soft)",
          boxShadow: "inset 0 0 0 1px var(--border-subtle)",
        }}
      >
        Got it
      </button>
    </>
  );
}

function LabelPrompt({
  profileAddress,
  value,
  onChange,
  onSave,
  onClose,
  saving,
  error,
}: {
  profileAddress: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <>
      <h3 className="text-[15px] font-bold text-text-primary mb-1">
        Track this wallet
      </h3>
      <p className="text-[11.5px] text-text-muted mb-3 font-mono">
        {profileAddress.slice(0, 6)}…{profileAddress.slice(-6)}
      </p>
      <label className="block text-[10.5px] uppercase tracking-[0.18em] font-bold text-text-muted mb-1.5">
        Label
      </label>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onClose();
        }}
        maxLength={40}
        placeholder="theo, big whale, my alt…"
        className="w-full px-3 py-2 rounded-lg text-[13px] text-text-primary outline-none"
        style={{
          background: "var(--glass-soft)",
          border: "1px solid var(--border-subtle)",
        }}
      />
      {error && (
        <p className="text-[11px] text-signal-negative mt-2">{error}</p>
      )}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-1 h-9 rounded-full text-[12px] font-bold text-white disabled:opacity-60"
          style={{
            background:
              "linear-gradient(110deg, #FF2D9C 0%, #5E5CFF 60%, #14F195 110%)",
          }}
        >
          {saving ? "Saving…" : "Track"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 rounded-full text-[12px] font-bold text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </>
  );
}
