"use client";

import { useEffect, useState, useCallback } from "react";
import { langName } from "@/lib/languages";

// ─── Types ───────────────────────────────────────────────────────────────────

type Position = {
  id: string;
  positionNumber: number;
  isDriver: boolean;
  languageCode: string | null;
  status: "OPEN" | "LOCKED" | "FILLED" | "CANCELLED";
  volunteer: {
    id: string;
    user: { name: string | null; email: string };
  } | null;
};

type Shift = {
  id: string;
  date: string;
  volunteerStart: number;
  volunteerEnd: number;
  travelMinutes: number;
  languagesNeeded: string[];
  notes: string | null;
  clinic: { id: string; name: string; address: string };
  positions: Position[];
};

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  status: string;
  role: string;
  volunteer: {
    languages: string[];
    driverCleared: boolean;
  } | null;
};

// ─── Bucketing ───────────────────────────────────────────────────────────────

const BUCKETS = [
  { label: "Today",      color: "#DC2626", minDays: 0,  maxDays: 0  },
  { label: "Tomorrow",   color: "#DC2626", minDays: 1,  maxDays: 1  },
  { label: "2 Days",     color: "#EA580C", minDays: 2,  maxDays: 2  },
  { label: "3 Days",     color: "#D97706", minDays: 3,  maxDays: 3  },
  { label: "This Week",  color: "#2563EB", minDays: 4,  maxDays: 7  },
  { label: "2 Weeks",    color: "#4F46E5", minDays: 8,  maxDays: 14 },
  { label: "This Month", color: "#7C3AED", minDays: 15, maxDays: 30 },
];

function daysUntil(dateStr: string): number {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(dateStr);
  const shiftMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((shiftMidnight.getTime() - todayMidnight.getTime()) / 86_400_000);
}

function bucketOf(shift: Shift): number {
  const days = daysUntil(shift.date);
  return BUCKETS.findIndex((b) => days >= b.minDays && days <= b.maxDays);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function overallColor(filled: number, total: number): string {
  if (total === 0) return "#9CA3AF";
  const p = filled / total;
  if (p === 1) return "#16a34a";
  if (p >= 0.5) return "#FBBF24";
  return "#EF4444";
}

const STATUS_STYLES = {
  FILLED: { dot: "#16a34a", bg: "#F0FDF4", text: "#15803D" },
  OPEN:   { dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8" },
  LOCKED: { dot: "#9CA3AF", bg: "#F9FAFB", text: "#6B7280" },
  CANCELLED: { dot: "#9CA3AF", bg: "#F9FAFB", text: "#6B7280" },
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

type EditShiftModalProps = {
  shift: Shift;
  onClose: () => void;
  onSaved: (updated: Shift) => void;
};

function EditShiftModal({ shift, onClose, onSaved }: EditShiftModalProps) {
  const [date, setDate] = useState(shift.date.slice(0, 10));
  const [start, setStart] = useState(shift.volunteerStart);
  const [end, setEnd] = useState(shift.volunteerEnd);
  const [travel, setTravel] = useState(shift.travelMinutes);
  const [notes, setNotes] = useState(shift.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/shifts/${shift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, volunteerStart: start, volunteerEnd: end, travelMinutes: travel, notes }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Failed"); setSaving(false); return; }
      const updated = await res.json();
      onSaved(updated);
    } catch { setErr("Network error"); setSaving(false); }
  }

  const timeOptions: { label: string; value: number }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      const mins = h * 60 + m;
      const label = fmtTime(mins);
      timeOptions.push({ label, value: mins });
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "420px", boxShadow: "0 8px 40px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "20px" }}>
          Edit Shift — {shift.clinic.name}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ padding: "8px 10px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827" }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>Start time</span>
              <select value={start} onChange={(e) => setStart(Number(e.target.value))}
                style={{ padding: "8px 10px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827", background: "#fff" }}>
                {timeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>End time</span>
              <select value={end} onChange={(e) => setEnd(Number(e.target.value))}
                style={{ padding: "8px 10px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827", background: "#fff" }}>
                {timeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>Travel (minutes)</span>
            <input type="number" value={travel} onChange={(e) => setTravel(Number(e.target.value))}
              style={{ padding: "8px 10px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827" }} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              style={{ padding: "8px 10px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827", resize: "vertical" }} />
          </label>
        </div>

        {err && <p style={{ color: "#EF4444", fontSize: "0.8rem", marginTop: "8px" }}>{err}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #D1D5DB", background: "#fff", color: "#111827", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: saving ? "#93C5FD" : "var(--blue)", color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────

type AssignModalProps = {
  position: Position;
  shift: Shift;
  users: AdminUser[];
  onClose: () => void;
  onAssigned: () => void;
};

function AssignModal({ position, shift, users, onClose, onAssigned }: AssignModalProps) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [langCode, setLangCode] = useState(position.isDriver ? (shift.languagesNeeded[0] ?? "") : (position.languageCode ?? ""));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Filter to active volunteers who are cleared for the required language (or driver-cleared for driver seat)
  const eligible = users.filter((u) => {
    if (u.status !== "ACTIVE") return false;
    if (!u.volunteer) return false;
    if (position.isDriver) return u.volunteer.driverCleared;
    const needed = position.languageCode;
    if (!needed) return false;
    return u.volunteer.languages.includes(needed);
  });

  const filtered = eligible.filter((u) => {
    const q = search.toLowerCase();
    return (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  async function assign() {
    if (!selectedUser) return;
    setSaving(true);
    setErr("");
    try {
      const body: Record<string, string> = { userId: selectedUser.id };
      if (position.isDriver) body.languageCode = langCode;
      const res = await fetch(`/api/admin/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Failed"); setSaving(false); return; }
      onAssigned();
    } catch { setErr("Network error"); setSaving(false); }
  }

  const seatLabel = position.isDriver ? "Driver" : `Seat ${position.positionNumber}`;
  const langLabel = position.isDriver ? null : (position.languageCode ? langName(position.languageCode) : null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "440px", boxShadow: "0 8px 40px rgba(0,0,0,.18)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
          Assign Volunteer
        </h2>
        <p style={{ fontSize: "0.8rem", color: "#374151", marginBottom: "16px" }}>
          {shift.clinic.name} · {fmtDate(shift.date)} · {seatLabel}{langLabel ? ` · ${langLabel}` : ""}
        </p>

        {position.isDriver && (
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>Language</span>
            <select value={langCode} onChange={(e) => setLangCode(e.target.value)}
              style={{ padding: "8px 10px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827", background: "#fff" }}>
              {shift.languagesNeeded.map((l) => (
                <option key={l} value={l}>{langName(l)}</option>
              ))}
            </select>
          </label>
        )}

        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "8px 12px", border: "1.5px solid #D1D5DB", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "#111827", marginBottom: "10px" }}
        />

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", minHeight: 0 }}>
          {filtered.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#374151", textAlign: "center", padding: "20px 0" }}>
              {eligible.length === 0 ? "No eligible volunteers found." : "No matches."}
            </p>
          )}
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 12px", borderRadius: "8px", border: "1.5px solid",
                borderColor: selectedUser?.id === u.id ? "var(--blue)" : "#E5E7EB",
                background: selectedUser?.id === u.id ? "#EFF6FF" : "#fff",
                cursor: "pointer", textAlign: "left",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.8rem", fontWeight: 700, color: "#1D4ED8" }}>
                {(u.name ?? u.email)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827" }}>{u.name ?? u.email}</div>
                <div style={{ fontSize: "0.75rem", color: "#374151" }}>{u.email}</div>
              </div>
            </button>
          ))}
        </div>

        {err && <p style={{ color: "#EF4444", fontSize: "0.8rem", marginTop: "8px" }}>{err}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #D1D5DB", background: "#fff", color: "#111827", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Cancel
          </button>
          <button onClick={assign} disabled={!selectedUser || saving}
            style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: !selectedUser || saving ? "#93C5FD" : "var(--blue)", color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: !selectedUser || saving ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shift Card ───────────────────────────────────────────────────────────────

type ShiftCardProps = {
  shift: Shift;
  users: AdminUser[];
  onShiftUpdated: (updated: Shift) => void;
  onRefresh: () => void;
};

type UrgencyLevel = "critical" | "warning" | "ok";

function urgencyLevel(shift: Shift): UrgencyLevel | null {
  const days = daysUntil(shift.date);
  if (days > 7) return null;
  const positions = shift.positions.filter((p) => p.status !== "CANCELLED");
  const filled = positions.filter((p) => p.status === "FILLED").length;
  const total = positions.length;
  const p = total > 0 ? filled / total : 0;
  if (p === 1)  return "ok";
  if (p >= 0.5) return "warning";
  return "critical";
}

const URGENCY = {
  critical: { stripe: "#DC2626", border: "1.5px solid #E5E7EB", trackBg: "#FEE2E2", label: "UNFILLED", labelColor: "#DC2626" },
  warning:  { stripe: "#F59E0B", border: "1.5px solid #E5E7EB", trackBg: "#FEF3C7", label: "PARTIAL",  labelColor: "#B45309" },
  ok:       { stripe: "#16a34a", border: "1.5px solid #E5E7EB", trackBg: "#DCFCE7", label: null,       labelColor: null },
};

function ShiftCard({ shift, users, onShiftUpdated, onRefresh }: ShiftCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [assignPos, setAssignPos] = useState<Position | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const positions = shift.positions.filter((p) => p.status !== "CANCELLED");
  const filled = positions.filter((p) => p.status === "FILLED").length;
  const total = positions.length;
  const barColor = overallColor(filled, total);
  const level = urgencyLevel(shift);
  const urgency = level ? URGENCY[level] : null;

  // Language slot summary — all language requirements from the shift post
  const langCounts: Record<string, { filled: number; total: number }> = {};
  for (const lang of shift.languagesNeeded) {
    if (!langCounts[lang]) langCounts[lang] = { filled: 0, total: 0 };
    langCounts[lang].total++;
  }
  // Count filled positions by their assigned languageCode (driver + interpreters)
  for (const pos of positions) {
    if (pos.status === "FILLED" && pos.languageCode && langCounts[pos.languageCode]) {
      langCounts[pos.languageCode].filled++;
    }
  }
  const langSummary = Object.entries(langCounts);

  async function remove(pos: Position) {
    setRemoving(pos.id);
    await fetch(`/api/admin/positions/${pos.id}`, { method: "DELETE" });
    setRemoving(null);
    onRefresh();
  }

  return (
    <>
      <div style={{ background: "#fff", border: urgency?.border ?? "1.5px solid #E5E7EB", borderRadius: "12px", overflow: "hidden" }}>

        {/* Shift header */}
        <div style={{ padding: "12px 14px", borderBottom: "1.5px solid #F3F4F6" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#111827" }}>{shift.clinic.name}</div>
              <div style={{ fontSize: "0.75rem", color: "#374151", marginTop: "2px" }}>
                {fmtDate(shift.date)}
              </div>
              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Commitment</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827" }}>
                    {fmtTime(shift.volunteerStart - shift.travelMinutes - 30)}–{fmtTime(shift.volunteerEnd + shift.travelMinutes + 15)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Interpreting</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>
                    {fmtTime(shift.volunteerStart)}–{fmtTime(shift.volunteerEnd)}
                  </span>
                </div>
              </div>
              {/* Language slot summary */}
              {langSummary.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                  {langSummary.map(([code, counts]) => (
                    <span key={code} style={{
                      fontSize: "0.68rem", fontWeight: 600, padding: "2px 7px", borderRadius: "99px",
                      background: counts.filled === counts.total ? "#DCFCE7" : counts.filled > 0 ? "#FEF3C7" : "#EFF6FF",
                      color: counts.filled === counts.total ? "#15803D" : counts.filled > 0 ? "#92400E" : "#1D4ED8",
                      border: `1px solid ${counts.filled === counts.total ? "#86EFAC" : counts.filled > 0 ? "#FDE68A" : "#BFDBFE"}`
                    }}>
                      {langName(code)} {counts.filled}/{counts.total}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setEditOpen(true)}
              style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "6px", border: "1.5px solid #D1D5DB", background: "#fff", fontSize: "0.72rem", fontWeight: 600, color: "#111827", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >
              Edit
            </button>
          </div>

          {/* Fill bar */}
          <div style={{ marginTop: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }}>Fill</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {urgency?.label && (
                  <span style={{ fontSize: "0.62rem", fontWeight: 800, color: urgency.labelColor!, background: urgency.trackBg, padding: "1px 6px", borderRadius: "4px", letterSpacing: "0.06em" }}>
                    {urgency.label}
                  </span>
                )}
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#111827" }}>{filled}/{total}</span>
              </div>
            </div>
            <div style={{ height: "8px", background: urgency?.trackBg ?? "#E5E7EB", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: total > 0 ? `${(filled / total) * 100}%` : "0%", background: barColor, borderRadius: "99px", transition: "width 0.3s" }} />
            </div>
          </div>
        </div>

        {/* Positions */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {positions.map((pos) => {
            const st = STATUS_STYLES[pos.status] ?? STATUS_STYLES.LOCKED;
            const label = pos.isDriver ? "Driver" : `Seat ${pos.positionNumber}`;
            const lang = pos.languageCode ? langName(pos.languageCode) : null;
            const volunteerName = pos.volunteer?.user?.name ?? pos.volunteer?.user?.email ?? null;

            return (
              <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", borderTop: "1px solid #F3F4F6", background: st.bg }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: st.dot, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#111827", minWidth: "46px", flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: "0.72rem", color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lang ?? <span style={{ color: "#374151" }}>(Language TBD)</span>}
                </span>

                {pos.status === "FILLED" && volunteerName && (
                  <>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, color: st.text, maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {volunteerName}
                    </span>
                    <button
                      onClick={() => remove(pos)}
                      disabled={removing === pos.id}
                      style={{ flexShrink: 0, padding: "2px 7px", borderRadius: "5px", border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: "0.65rem", fontWeight: 600, cursor: removing === pos.id ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {removing === pos.id ? "…" : "Remove"}
                    </button>
                  </>
                )}

                {pos.status === "OPEN" && (
                  <button
                    onClick={() => setAssignPos(pos)}
                    style={{ flexShrink: 0, padding: "2px 8px", borderRadius: "5px", border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", fontSize: "0.65rem", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Assign
                  </button>
                )}

                {pos.status === "LOCKED" && (
                  <span style={{ fontSize: "0.65rem", color: "#374151", flexShrink: 0 }}>Locked</span>
                )}
              </div>
            );
          })}
        </div>

        {shift.notes && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid #F3F4F6", fontSize: "0.72rem", color: "#374151", background: "#FAFAFA" }}>
            {shift.notes}
          </div>
        )}
      </div>

      {editOpen && (
        <EditShiftModal
          shift={shift}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { onShiftUpdated(updated); setEditOpen(false); }}
        />
      )}

      {assignPos && (
        <AssignModal
          position={assignPos}
          shift={shift}
          users={users}
          onClose={() => setAssignPos(null)}
          onAssigned={() => { setAssignPos(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UpcomingShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadShifts = useCallback(async () => {
    const res = await fetch("/api/admin/shifts");
    if (res.ok) {
      const data: Shift[] = await res.json();
      setShifts(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadShifts();
    fetch("/api/admin/users")
      .then((r) => r.ok ? r.json() : [])
      .then((data: AdminUser[]) => setUsers(Array.isArray(data) ? data : []));
  }, [loadShifts]);

  function updateShift(updated: Shift) {
    setShifts((prev) => prev.map((s) => s.id === updated.id ? updated : s));
  }

  if (loading) {
    return <div style={{ padding: "40px", color: "#374151", fontFamily: "'DM Sans', sans-serif" }}>Loading…</div>;
  }

  // Group shifts into buckets
  const bucketed: (Shift[])[] = BUCKETS.map(() => []);
  const beyond: Shift[] = [];
  const past: Shift[] = [];

  for (const shift of shifts) {
    const days = daysUntil(shift.date);
    if (days < 0) { past.push(shift); continue; }
    const idx = bucketOf(shift);
    if (idx === -1) beyond.push(shift);
    else bucketed[idx].push(shift);
  }

  const upcomingCount = shifts.length - past.length;
  const hasAny = upcomingCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", paddingBottom: "48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#111827" }}>Upcoming Shifts</h1>
        <span style={{ fontSize: "0.8rem", color: "#374151" }}>{upcomingCount} shift{upcomingCount !== 1 ? "s" : ""} scheduled</span>
      </div>

      {!hasAny && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#374151", fontSize: "0.9rem" }}>
          No upcoming shifts scheduled.
        </div>
      )}

      {BUCKETS.map((bucket, idx) => {
        const bucketShifts = bucketed[idx];
        if (bucketShifts.length === 0) return null;

        const allPositions = bucketShifts.flatMap((s) => s.positions.filter((p) => p.status !== "CANCELLED"));
        const totalFilled = allPositions.filter((p) => p.status === "FILLED").length;
        const totalSeats = allPositions.length;
        const bucketBarColor = overallColor(totalFilled, totalSeats);

        return (
          <section key={bucket.label}>
            {/* Bucket header */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: bucket.color, flexShrink: 0 }} />
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", margin: 0 }}>{bucket.label}</h2>
              <span style={{ fontSize: "0.75rem", color: "#374151" }}>{bucketShifts.length} shift{bucketShifts.length !== 1 ? "s" : ""}</span>
              {/* Mini fill bar */}
              <div style={{ flex: 1, height: "6px", background: "#E5E7EB", borderRadius: "99px", overflow: "hidden", maxWidth: "120px" }}>
                <div style={{ height: "100%", width: totalSeats > 0 ? `${(totalFilled / totalSeats) * 100}%` : "0%", background: bucketBarColor, borderRadius: "99px" }} />
              </div>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#374151" }}>{totalFilled}/{totalSeats} seats</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
              {bucketShifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  users={users}
                  onShiftUpdated={updateShift}
                  onRefresh={loadShifts}
                />
              ))}
            </div>
          </section>
        );
      })}

      {beyond.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#9CA3AF", flexShrink: 0 }} />
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", margin: 0 }}>Beyond This Month</h2>
            <span style={{ fontSize: "0.75rem", color: "#374151" }}>{beyond.length} shift{beyond.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
            {beyond.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} users={users} onShiftUpdated={updateShift} onRefresh={loadShifts} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <>
          <hr style={{ border: "none", borderTop: "1.5px solid #E5E7EB", margin: "4px 0" }} />
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#D1D5DB", flexShrink: 0 }} />
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#6B7280", margin: 0 }}>Past Shifts</h2>
              <span style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{past.length} shift{past.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px", opacity: 0.6 }}>
              {past.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} users={users} onShiftUpdated={updateShift} onRefresh={loadShifts} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
