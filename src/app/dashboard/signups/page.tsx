"use client";

import { useEffect, useState, useCallback } from "react";
import { langName } from "@/lib/languages";

type MyPosition = {
  id: string;
  positionNumber: number;
  isDriver: boolean;
  languageCode: string | null;
  status: string;
  shift: {
    id: string;
    date: string;
    volunteerStart: number;
    volunteerEnd: number;
    travelMinutes: number;
    languagesNeeded: string[];
    notes: string | null;
    keyRetrievalTime: number;
    driveStartTime: number;
    keyReturnTime: number;
    clinic: { name: string; address: string };
  };
};

const RATING_OPTIONS = [
  { value: 1, label: "Needs Improvement", active: "bg-red-100 text-red-700 border-red-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-600" },
  { value: 2, label: "Okay",              active: "bg-orange-100 text-orange-700 border-orange-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-orange-200 hover:text-orange-600" },
  { value: 3, label: "Good",              active: "bg-yellow-100 text-yellow-700 border-yellow-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-yellow-200 hover:text-yellow-600" },
  { value: 4, label: "Excellent",         active: "bg-green-100 text-green-700 border-green-300",  idle: "bg-white text-gray-500 border-gray-200 hover:border-green-200 hover:text-green-600" },
  { value: 5, label: "Exceptional",       active: "bg-emerald-100 text-emerald-700 border-emerald-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-emerald-200 hover:text-emerald-600" },
];

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

function fmtDate(s: string): string {
  const d = new Date(s.slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function MapsLinks({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const q = encodeURIComponent(address);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "6px" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ fontSize: "0.72rem", color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
      >Maps ↗</button>
      {open && (
        <span style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", padding: "6px 0", display: "flex", flexDirection: "column", whiteSpace: "nowrap", minWidth: "120px" }}>
          <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "var(--gray-900)", textDecoration: "none", display: "block" }}>Google Maps</a>
          <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "var(--gray-900)", textDecoration: "none", display: "block" }}>Apple Maps</a>
        </span>
      )}
    </span>
  );
}

export default function SignupsPage() {
  const [positions, setPositions] = useState<MyPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
  const [feedbackForms, setFeedbackForms] = useState<Record<string, { rating: number; note: string }>>({});
  const [submittingFeedbackFor, setSubmittingFeedbackFor] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [posRes, statusRes] = await Promise.all([
      fetch("/api/volunteer/positions"),
      fetch("/api/feedback/my-status"),
    ]);
    if (posRes.ok) setPositions(await posRes.json());
    if (statusRes.ok) {
      const { givenShiftIds } = await statusRes.json();
      setFeedbackGiven(new Set<string>(givenShiftIds ?? []));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const doCancel = async (positionId: string) => {
    setActionLoading(positionId);
    const res = await fetch(`/api/volunteer/positions/${positionId}`, { method: "DELETE" });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

  const submitFeedback = async (shiftId: string, positionId: string) => {
    const form = feedbackForms[shiftId];
    if (!form?.rating) return;
    setSubmittingFeedbackFor(shiftId);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId, rating: form.rating, note: form.note ?? "" }),
    });
    if (res.ok || res.status === 409) {
      setFeedbackGiven((prev) => new Set([...prev, shiftId]));
    }
    setSubmittingFeedbackFor(null);
  };

  // Group positions by shift
  const byShift = new Map<string, MyPosition[]>();
  for (const pos of positions) {
    if (!byShift.has(pos.shift.id)) byShift.set(pos.shift.id, []);
    byShift.get(pos.shift.id)!.push(pos);
  }

  const now = new Date();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: "24px" }}>My Signups</h1>

      {byShift.size === 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No active signups. Browse available shifts to sign up.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {Array.from(byShift.entries()).map(([shiftId, shiftPositions]) => {
            const shift = shiftPositions[0].shift;
            const shiftEndTime = new Date(shift.date.slice(0, 10) + "T23:59:59");
            const isPast = shiftEndTime <= now;

            return (
              <div key={shiftId} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.55 : 1 }}>
                {/* Header */}
                <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--navy)" }}>{shift.clinic.name}</div>
                    <div style={{ display: "flex", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Date</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtDate(shift.date)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Interpreting</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtMin(shift.volunteerStart)} – {fmtMin(shift.volunteerEnd)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Full Commitment</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtMin(shift.keyRetrievalTime)} – {fmtMin(shift.keyReturnTime)}</span>
                      </div>
                      {shift.clinic.address && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Location</span>
                          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>
                            {shift.clinic.address}
                            <MapsLinks address={shift.clinic.address} />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isPast && (
                    <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase", alignSelf: "flex-start" }}>Past</span>
                  )}
                </div>
                {shift.notes && (
                  <div style={{ padding: "8px 22px", fontSize: "0.82rem", color: "#111827", fontStyle: "italic", borderBottom: "1px solid var(--card-border)" }}>
                    {shift.notes}
                  </div>
                )}
                {/* My positions */}
                {shiftPositions.map((pos) => (
                  <div key={pos.id} style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: "1px solid var(--card-border)", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: isPast ? "var(--gray-400)" : "var(--green)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#111827" }}>
                        {pos.isDriver ? "Driver + Interpreter" : "Interpreter"}
                      </span>
                      {pos.languageCode && (
                        <span style={{ marginLeft: "8px", fontSize: "0.82rem", color: "#374151" }}>{langName(pos.languageCode)}</span>
                      )}
                    </div>
                    {isPast ? (
                      <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--gray-200)", color: "var(--gray-600)", borderRadius: "6px" }}>Past</span>
                    ) : (
                      <button
                        disabled={actionLoading === pos.id}
                        onClick={() => doCancel(pos.id)}
                        style={{ fontSize: "0.75rem", padding: "6px 14px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: actionLoading === pos.id ? 0.5 : 1 }}
                      >
                        {actionLoading === pos.id ? "..." : "Cancel"}
                      </button>
                    )}
                  </div>
                ))}
                {/* Inline feedback for past shifts */}
                {isPast && (() => {
                  if (feedbackGiven.has(shiftId)) {
                    return (
                      <div style={{ padding: "12px 22px", borderTop: "1px solid var(--card-border)", fontSize: "0.75rem", color: "var(--green)" }}>
                        ✓ Feedback submitted
                      </div>
                    );
                  }
                  const form = feedbackForms[shiftId] ?? { rating: 0, note: "" };
                  const positionId = shiftPositions[0].id;
                  return (
                    <div style={{ padding: "12px 22px", borderTop: "1px solid var(--card-border)" }}>
                      <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "8px", fontWeight: 500 }}>How was your shift at {shift.clinic.name}?</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                        {RATING_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setFeedbackForms((prev) => ({ ...prev, [shiftId]: { ...form, rating: opt.value } }))}
                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${form.rating === opt.value ? opt.active : opt.idle}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {form.rating > 0 && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginTop: "8px" }}>
                          <textarea
                            placeholder="Any comments? (optional)"
                            value={form.note}
                            onChange={(e) => setFeedbackForms((prev) => ({ ...prev, [shiftId]: { ...form, note: e.target.value } }))}
                            rows={2}
                            style={{ flex: 1, padding: "6px 10px", fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", outline: "none", resize: "none", color: "var(--gray-900)" }}
                          />
                          <button
                            disabled={submittingFeedbackFor === shiftId}
                            onClick={() => submitFeedback(shiftId, positionId)}
                            style={{ padding: "6px 16px", fontSize: "0.75rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: submittingFeedbackFor === shiftId ? 0.5 : 1, whiteSpace: "nowrap" }}
                          >
                            {submittingFeedbackFor === shiftId ? "..." : "Submit"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
