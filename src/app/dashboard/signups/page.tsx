"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { langName } from "@/lib/languages";

type MySignup = {
  id: string;
  subBlockHour: number;
  status: string;
  slot: {
    id: string;
    language: string;
    date: string;
    startTime: number;
    endTime: number;
    clinic: { name: string; address: string };
  };
};


const RATING_OPTIONS = [
  { value: 1, label: "Needs Improvement", active: "bg-red-100 text-red-700 border-red-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-600" },
  { value: 2, label: "Okay",              active: "bg-orange-100 text-orange-700 border-orange-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-orange-200 hover:text-orange-600" },
  { value: 3, label: "Good",              active: "bg-yellow-100 text-yellow-700 border-yellow-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-yellow-200 hover:text-yellow-600" },
  { value: 4, label: "Excellent",         active: "bg-green-100 text-green-700 border-green-300",  idle: "bg-white text-gray-500 border-gray-200 hover:border-green-200 hover:text-green-600" },
  { value: 5, label: "Exceptional", active: "bg-emerald-100 text-emerald-700 border-emerald-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-emerald-200 hover:text-emerald-600" },
];

function MapsLinks({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const q = encodeURIComponent(address);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-maps-dropdown]") && !t.closest("[data-maps-btn]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "6px" }}>
      <button
        data-maps-btn
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ fontSize: "0.72rem", color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
      >Maps ↗</button>
      {open && (
        <span data-maps-dropdown style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", padding: "6px 0", display: "flex", flexDirection: "column", whiteSpace: "nowrap", minWidth: "120px" }}>
          <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "var(--gray-900)", textDecoration: "none", display: "block" }}>Google Maps</a>
          <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "var(--gray-900)", textDecoration: "none", display: "block" }}>Apple Maps</a>
        </span>
      )}
    </span>
  );
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDate(s: string): string {
  const d = new Date(s.slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function SignupsPage() {
  const { data: session } = useSession();
  const [mySignups, setMySignups] = useState<MySignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelCounts, setCancelCounts] = useState<Record<string, number>>({});
  const [spamModal, setSpamModal] = useState<{ onProceed: (() => void) | null; isBlocked: boolean } | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
  const [feedbackForms, setFeedbackForms] = useState<Record<string, { rating: number; note: string }>>({});
  const [submittingFeedbackFor, setSubmittingFeedbackFor] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [signupsRes, statusRes] = await Promise.all([
      fetch("/api/volunteer/signups"),
      fetch("/api/feedback/my-status"),
    ]);
    if (signupsRes.ok) setMySignups(await signupsRes.json());
    if (statusRes.ok) {
      const { givenSlotIds } = await statusRes.json();
      setFeedbackGiven(new Set<string>(givenSlotIds ?? []));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const doCancel = async (id: string, slotHourKey: string) => {
    setActionLoading(id);
    const res = await fetch(`/api/volunteer/signups/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCancelCounts((prev) => ({ ...prev, [slotHourKey]: (prev[slotHourKey] ?? 0) + 1 }));
      await fetchData();
    }
    setActionLoading(null);
  };

  const cancelSignup = (id: string, slotHourKey: string) => {
    const count = cancelCounts[slotHourKey] ?? 0;
    if (count >= 3) {
      setSpamModal({ onProceed: null, isBlocked: true });
      return;
    }
    if (count >= 1) {
      setSpamModal({
        isBlocked: false,
        onProceed: () => {
          setSpamModal(null);
          void doCancel(id, slotHourKey);
        },
      });
      return;
    }
    void doCancel(id, slotHourKey);
  };

  const submitInlineFeedback = async (slotId: string, signupId: string) => {
    const form = feedbackForms[slotId];
    if (!form?.rating) return;
    setSubmittingFeedbackFor(slotId);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signupId, rating: form.rating, note: form.note ?? "" }),
    });
    if (res.ok || res.status === 409) {
      setFeedbackGiven((prev) => new Set([...prev, slotId]));
    }
    setSubmittingFeedbackFor(null);
  };

  // Group signups by slot
  const signupsBySlot: Record<string, MySignup[]> = {};
  for (const s of mySignups) {
    if (!signupsBySlot[s.slot.id]) signupsBySlot[s.slot.id] = [];
    signupsBySlot[s.slot.id].push(s);
  }

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

      {mySignups.length === 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No active signups. Browse available slots to sign up.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {Object.entries(signupsBySlot).map(([slotId, sigs]) => {
            const slot = sigs[0].slot;
            const slotEndTime = new Date(slot.date.slice(0, 10) + "T" + String(slot.endTime).padStart(2, "0") + ":00:00");
            const isPast = slotEndTime <= new Date();
            return (
              <div key={slotId} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.5 : 1 }}>
                {/* Card header */}
                <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111827", marginTop: "3px" }}>
                      {langName(slot.language)}
                    </div>
                    <div style={{ display: "flex", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Date</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{formatDate(slot.date)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Session</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{formatHour(slot.startTime)} – {formatHour(slot.endTime)}</span>
                      </div>
                      {slot.clinic.address && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Location</span>
                          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>
                            {slot.clinic.address}
                            <MapsLinks address={slot.clinic.address} />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isPast && (
                    <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase", alignSelf: "flex-start" }}>Past</span>
                  )}
                </div>
                {/* Hour rows */}
                {sigs
                  .sort((a, b) => a.subBlockHour - b.subBlockHour)
                  .map((sig) => (
                    <div
                      key={sig.id}
                      style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: "1px solid var(--card-border)", gap: "16px" }}
                    >
                      <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: isPast ? "var(--gray-400)" : "var(--green)", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", flex: 1 }}>
                        {formatHour(sig.subBlockHour)} – {formatHour(sig.subBlockHour + 1)}
                      </span>
                      {isPast ? (
                        <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--gray-200)", color: "var(--gray-600)", borderRadius: "6px" }}>Past</span>
                      ) : (
                        <button
                          disabled={actionLoading === sig.id}
                          onClick={() => cancelSignup(sig.id, `${sig.slot.id}-${sig.subBlockHour}`)}
                          style={{ fontSize: "0.75rem", padding: "6px 14px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: actionLoading === sig.id ? 0.5 : 1 }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                {/* Inline feedback for past slots */}
                {(() => {
                  const end = new Date(slot.date.slice(0, 10) + "T" + String(slot.endTime).padStart(2, "0") + ":00:00");
                  if (end >= new Date()) return null;
                  const signupId = sigs[0].id;
                  if (feedbackGiven.has(slot.id)) {
                    return (
                      <div style={{ padding: "12px 22px", borderTop: "1px solid var(--card-border)", fontSize: "0.75rem", color: "var(--green)" }}>
                        ✓ Feedback submitted
                      </div>
                    );
                  }
                  const form = feedbackForms[slot.id] ?? { rating: 0, note: "" };
                  return (
                    <div style={{ padding: "12px 22px", borderTop: "1px solid var(--card-border)" }}>
                      <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "8px", fontWeight: 500 }}>How was your shift at {slot.clinic.name}?</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                        {RATING_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setFeedbackForms((prev) => ({ ...prev, [slot.id]: { ...form, rating: opt.value } }))}
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
                            onChange={(e) => setFeedbackForms((prev) => ({ ...prev, [slot.id]: { ...form, note: e.target.value } }))}
                            rows={2}
                            style={{ flex: 1, padding: "6px 10px", fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", outline: "none", resize: "none", color: "var(--gray-900)" }}
                          />
                          <button
                            disabled={submittingFeedbackFor === slot.id}
                            onClick={() => submitInlineFeedback(slot.id, signupId)}
                            style={{ padding: "6px 16px", fontSize: "0.75rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: submittingFeedbackFor === slot.id ? 0.5 : 1, whiteSpace: "nowrap" }}
                          >
                            {submittingFeedbackFor === slot.id ? "..." : "Submit"}
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

      {/* Anti-spam modal */}
      {spamModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "14px", boxShadow: "0 20px 60px rgba(0,0,0,.15)", width: "100%", maxWidth: "384px", padding: "24px", textAlign: "center" }}>
            {spamModal.isBlocked ? (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🎨</div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "8px" }}>Looks like you enjoy clicking!</h3>
                <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>You&apos;ve cancelled this shift too many times. Each cancellation within 24 hours sends an urgent alert to the clinic.</p>
                <button
                  onClick={() => setSpamModal(null)}
                  style={{ width: "100%", padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", marginBottom: "8px" }}
                >
                  OK
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "8px" }}>Heads up</h3>
                <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>Cancelling a shift within 24 hours sends an urgent email alert to the clinic. Please be considerate of their time. Are you sure you want to cancel?</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => setSpamModal(null)}
                    style={{ flex: 1, padding: "9px 20px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "9px", background: "var(--card-bg)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Keep Signup
                  </button>
                  <button
                    onClick={spamModal.onProceed ?? (() => setSpamModal(null))}
                    style={{ flex: 1, padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer" }}
                  >
                    Yes, Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Suppress unused session warning */}
      {session && null}
    </div>
  );
}
