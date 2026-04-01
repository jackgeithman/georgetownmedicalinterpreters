"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, Fragment, Suspense } from "react";
import { langName } from "@/lib/languages";

type SubBlockSignup = {
  id: string;
  subBlockHour: number;
  status: string;
  volunteer: {
    id: string;
    user: { name: string; email: string };
  };
};

type Slot = {
  id: string;
  language: string;
  date: string;
  startTime: number;
  endTime: number;
  interpreterCount: number;
  isRecurring: boolean;
  recurrenceGroupId: string | null;
  notes: string | null;
  status: string;
  signups: SubBlockSignup[];
};

type Tab = "upcoming" | "past" | "settings";
type CancelConfirm = { slotId: string; isRecurring: boolean };

type ClinicNotifPrefs = {
  dailySummary: boolean;
  volunteerCancelWindow: number | null;
  unfilledAlert24h: boolean;
};


const RATING_OPTIONS = [
  { value: 1, label: "Needs Improvement", active: "bg-red-100 text-red-700 border-red-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-600" },
  { value: 2, label: "Okay",              active: "bg-orange-100 text-orange-700 border-orange-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-orange-200 hover:text-orange-600" },
  { value: 3, label: "Good",              active: "bg-yellow-100 text-yellow-700 border-yellow-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-yellow-200 hover:text-yellow-600" },
  { value: 4, label: "Excellent",         active: "bg-green-100 text-green-700 border-green-300",  idle: "bg-white text-gray-500 border-gray-200 hover:border-green-200 hover:text-green-600" },
  { value: 5, label: "Exceptional", active: "bg-emerald-100 text-emerald-700 border-emerald-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-emerald-200 hover:text-emerald-600" },
];

const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-[#EBF3FC] text-[#041E42]",
};

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
        className="text-xs text-[#4A90D9] underline"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
      >Maps ↗</button>
      {open && (
        <span data-maps-dropdown style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", padding: "6px 0", display: "flex", flexDirection: "column", whiteSpace: "nowrap", minWidth: "120px" }}>
          <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "#1a1a1a", textDecoration: "none", display: "block" }}>Google Maps</a>
          <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "#1a1a1a", textDecoration: "none", display: "block" }}>Apple Maps</a>
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

function formatDateLong(s: string): string {
  return new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function isUpcoming(slot: Slot): boolean {
  return new Date(slot.date.slice(0, 10) + "T" + String(slot.endTime).padStart(2, "0") + ":00:00") > new Date();
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

const iStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid var(--card-border)",
  borderRadius: "9px", fontFamily: "inherit", fontSize: "0.9rem",
  color: "var(--gray-900)", background: "#fff", outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px",
  padding: "10px 22px", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600,
  cursor: "pointer", transition: "all .18s",
};

const card: React.CSSProperties = {
  background: "var(--card-bg)", border: "1.5px solid var(--card-border)",
  borderRadius: "14px", overflow: "hidden", marginBottom: "14px",
  boxShadow: "0 2px 6px rgba(0,0,0,.05)",
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={onToggle} style={{ flexShrink: 0, position: "relative", display: "inline-flex", height: "22px", width: "38px", borderRadius: "99px", border: "none", cursor: "pointer", background: on ? "var(--blue)" : "var(--gray-200)", transition: "background .15s" }}>
      <span style={{ display: "inline-block", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", position: "absolute", top: "3px", left: on ? "19px" : "3px", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#111827", marginBottom: "6px" }}>{children}</label>;
}

function ClinicDashboardInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminPreviewId = searchParams.get("adminPreview");
  const isAdminPreview = !!(adminPreviewId && session?.user?.role === "ADMIN");
  const [tab, setTab] = useState<Tab>("upcoming");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editScope, setEditScope] = useState<"single" | "this_and_future">("single");
  const [cancelConfirm, setCancelConfirm] = useState<CancelConfirm | null>(null);
  const [editWarning, setEditWarning] = useState<{ cancelCount: number } | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<ClinicNotifPrefs>({ dailySummary: true, volunteerCancelWindow: null, unfilledAlert24h: true });
  const [notifSaved, setNotifSaved] = useState(false);
  const [form, setForm] = useState({ language: "ES", date: "", startTime: 9, endTime: 12, interpreterCount: 1, notes: "", isRecurring: false, recurrenceEndDate: "" });
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [postError, setPostError] = useState("");
  const [activeLanguages, setActiveLanguages] = useState<{ code: string; name: string }[]>([]);
  // Feedback state — inline (no modal), keyed by "${slotId}-${volunteerId}"
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
  const [feedbackForms, setFeedbackForms] = useState<Record<string, { rating: number; note: string }>>({});
  const [submittingFeedbackFor, setSubmittingFeedbackFor] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "CLINIC" && !isAdminPreview) router.push("/dashboard");
  }, [status, session, router, isAdminPreview]);

  const fetchSlots = useCallback(async () => {
    if (adminPreviewId) {
      const res = await fetch(`/api/admin/clinic-preview/${adminPreviewId}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots);
      }
      setLoading(false);
      return;
    }
    const [slotsRes, notifRes, statusRes] = await Promise.all([
      fetch("/api/clinic/slots"),
      fetch("/api/clinic/notif-prefs"),
      fetch("/api/feedback/my-status"),
    ]);
    if (slotsRes.ok) setSlots(await slotsRes.json());
    if (notifRes.ok) setNotifPrefs(await notifRes.json());
    if (statusRes.ok) {
      const { givenKeys } = await statusRes.json();
      setFeedbackGiven(new Set<string>(givenKeys ?? []));
    }
    setLoading(false);
  }, [adminPreviewId]);

  useEffect(() => {
    if (session?.user?.role === "CLINIC" || isAdminPreview) fetchSlots();
  }, [session, fetchSlots, isAdminPreview]);

  useEffect(() => {
    fetch("/api/languages").then((r) => r.ok ? r.json() : []).then(setActiveLanguages);
  }, []);

  const saveNotifPrefs = async (updated: ClinicNotifPrefs) => {
    await fetch("/api/clinic/notif-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    setNotifPrefs(updated); setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2000);
  };

  const postSlot = async () => {
    if (!form.date || (form.isRecurring && !form.recurrenceEndDate)) return;
    setActionLoading("post"); setPostError("");
    const res = await fetch("/api/clinic/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      await fetchSlots(); setShowPostForm(false);
      setForm({ language: "ES", date: "", startTime: 9, endTime: 12, interpreterCount: 1, notes: "", isRecurring: false, recurrenceEndDate: "" });
    } else { const d = await res.json().catch(() => ({})); setPostError(d.error ?? "Could not post slot."); }
    setActionLoading(null);
  };

  const toggleSelectSlot = (slotId: string) => {
    setSelectedSlotIds((prev) => { const next = new Set(prev); if (next.has(slotId)) next.delete(slotId); else next.add(slotId); return next; });
  };

  const cancelSelectedSlots = async () => {
    if (!selectedSlotIds.size || !confirm(`Cancel ${selectedSlotIds.size} slot(s)? This cannot be undone.`)) return;
    setActionLoading("batch-delete");
    for (const id of selectedSlotIds) await fetch(`/api/clinic/slots/${id}?deleteScope=single`, { method: "DELETE" });
    setSelectedSlotIds(new Set()); await fetchSlots(); setActionLoading(null);
  };

  const requestSaveEdit = () => {
    if (!editSlot) return;
    const original = slots.find((s) => s.id === editSlot.id);
    if (!original) { void confirmSaveEdit(); return; }
    const dateChanged = editSlot.date.split("T")[0] !== original.date.split("T")[0];
    const langChanged = editSlot.language !== original.language;
    const cancelCount = original.signups.filter((s) => {
      if (s.status !== "ACTIVE") return false;
      if (langChanged || dateChanged) return true;
      return s.subBlockHour < editSlot.startTime || s.subBlockHour >= editSlot.endTime;
    }).length;
    if (cancelCount > 0) setEditWarning({ cancelCount }); else void confirmSaveEdit();
  };

  const confirmSaveEdit = async () => {
    if (!editSlot) return;
    setEditWarning(null); setActionLoading("edit");
    const res = await fetch(`/api/clinic/slots/${editSlot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: editSlot.language, date: editSlot.date.split("T")[0], startTime: editSlot.startTime, endTime: editSlot.endTime, interpreterCount: editSlot.interpreterCount, notes: editSlot.notes, editScope }) });
    if (res.ok) { await fetchSlots(); setEditSlot(null); }
    setActionLoading(null);
  };

  const cancelSlot = async (slotId: string, deleteScope: "single" | "this_and_future") => {
    setActionLoading(slotId);
    const res = await fetch(`/api/clinic/slots/${slotId}?deleteScope=${deleteScope}`, { method: "DELETE" });
    if (res.ok) await fetchSlots(); setCancelConfirm(null); setActionLoading(null);
  };

  const reportNoShow = async (slotId: string, signupId: string) => {
    setActionLoading(signupId);
    const res = await fetch(`/api/clinic/slots/${slotId}/no-show`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signupId }) });
    if (res.ok) await fetchSlots(); setActionLoading(null);
  };

  const submitInlineFeedback = async (feedbackKey: string, signupId: string) => {
    const form = feedbackForms[feedbackKey];
    if (!form?.rating) return;
    setSubmittingFeedbackFor(feedbackKey);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signupId, rating: form.rating, note: form.note ?? "" }),
    });
    if (res.ok || res.status === 409) {
      setFeedbackGiven((prev) => new Set([...prev, feedbackKey]));
    }
    setSubmittingFeedbackFor(null);
  };

  const upcoming = slots.filter((s) => s.status === "ACTIVE" && isUpcoming(s));
  const past = slots.filter((s) => !isUpcoming(s) || s.status !== "ACTIVE");

  if (status === "loading" || loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}><p style={{ color: "#111827" }}>Loading…</p></div>;

  if (!session?.user?.clinicId && !isAdminPreview) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontWeight: 600, color: "var(--gray-900)" }}>No clinic assigned</p>
        <p style={{ color: "#111827", fontSize: "0.875rem", marginTop: "6px" }}>Contact your admin to be assigned to a clinic.</p>
      </div>
    </div>
  );

  const displaySlots = tab === "upcoming" ? upcoming : past;
  const upcomingByDate: Record<string, Slot[]> = {};
  for (const s of upcoming) { const label = formatDateLong(s.date); if (!upcomingByDate[label]) upcomingByDate[label] = []; upcomingByDate[label].push(s); }
  const postDisabled = !form.date || form.endTime <= form.startTime || (form.isRecurring && !form.recurrenceEndDate) || actionLoading === "post";

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)" }}>
      {isAdminPreview && (
        <div style={{ background: "#1E40AF", color: "#fff", padding: "10px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif" }}>
          <span>Admin Preview Mode — viewing as clinic</span>
          <button
            onClick={() => router.push("/dashboard/admin")}
            style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", padding: "5px 14px", borderRadius: "7px", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif" }}
          >← Back to Admin</button>
        </div>
      )}
      {/* Topbar */}
      <header style={{ background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "36px", height: "36px", borderRadius: "9px" }} />
          <div>
            <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
            <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>Clinic Dashboard{session?.user?.name ? ` — ${session.user.name}` : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <a href="mailto:georgetownmedicalinterpreters@gmail.com" style={{ color: "#CBD5E1", fontSize: "0.8rem", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.15)" }}>Contact Us</a>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer" }}>Sign Out</button>
        </div>
      </header>

      <main style={{ maxWidth: "920px", margin: "0 auto", padding: "36px 24px" }}>
        {/* Tabs + action */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div style={{ display: "flex", gap: "4px", background: "var(--card-bg)", padding: "5px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,.08)", border: "1px solid var(--card-border)" }}>
            {[{ key: "upcoming" as Tab, label: "Upcoming", count: upcoming.length }, { key: "past" as Tab, label: "Past", count: past.length }, { key: "settings" as Tab, label: "Notifications" }].map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "9px 20px", borderRadius: "9px", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer", border: "none", fontFamily: "inherit", transition: "all .15s", background: tab === t.key ? "var(--blue)" : "none", color: tab === t.key ? "#fff" : "var(--gray-900)", whiteSpace: "nowrap" }}>
                {t.label}
                {t.count !== undefined && t.count > 0 && <span style={{ background: tab === t.key ? "rgba(255,255,255,.3)" : "var(--gray-200)", color: tab === t.key ? "#fff" : "var(--gray-900)", fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px", borderRadius: "99px", marginLeft: "5px" }}>{t.count}</span>}
              </button>
            ))}
          </div>
          {tab === "upcoming" && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "0.82rem", color: "#111827" }}>{upcoming.length}/100 slots</span>
              {!isAdminPreview && (!showPostForm
                ? <button onClick={() => setShowPostForm(true)} disabled={upcoming.length >= 100} style={{ ...btnPrimary, opacity: upcoming.length >= 100 ? 0.4 : 1 }}>+ Post Slot</button>
                : <button onClick={() => setShowPostForm(false)} style={{ padding: "10px 22px", borderRadius: "9px", background: "none", border: "1.5px solid var(--card-border)", color: "#111827", fontFamily: "inherit", fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
              )}
            </div>
          )}
        </div>

        {/* Post Slot Form */}
        {showPostForm && tab === "upcoming" && (
          <div style={{ ...card, padding: "24px", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)", marginBottom: "18px" }}>New Slot</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div><FieldLabel>Language</FieldLabel><select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} style={{ ...iStyle, cursor: "pointer" }}>{activeLanguages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
              <div><FieldLabel>Date</FieldLabel><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={iStyle} /></div>
              <div><FieldLabel>Start Time</FieldLabel><select value={form.startTime} onChange={(e) => setForm({ ...form, startTime: Number(e.target.value) })} style={{ ...iStyle, cursor: "pointer" }}>{HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
              <div><FieldLabel>End Time</FieldLabel><select value={form.endTime} onChange={(e) => setForm({ ...form, endTime: Number(e.target.value) })} style={{ ...iStyle, cursor: "pointer" }}>{HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
              <div><FieldLabel>Interpreters / Hour</FieldLabel><input type="number" min={1} max={10} value={form.interpreterCount} onChange={(e) => setForm({ ...form, interpreterCount: Number(e.target.value) })} style={iStyle} /></div>
              <div><FieldLabel>Notes (optional)</FieldLabel><input placeholder="Any notes for volunteers…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={iStyle} /></div>
            </div>
            <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--card-border)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "0.9rem", color: "var(--gray-900)" }}>
                <Toggle on={form.isRecurring} onToggle={() => setForm({ ...form, isRecurring: !form.isRecurring, recurrenceEndDate: "" })} />
                Repeat weekly
              </label>
              {form.isRecurring && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                  <span style={{ fontSize: "0.82rem", color: "#111827" }}>Repeat until</span>
                  <input type="date" value={form.recurrenceEndDate} min={form.date || undefined} onChange={(e) => setForm({ ...form, recurrenceEndDate: e.target.value })} style={{ ...iStyle, width: "auto" }} />
                  {form.date && form.recurrenceEndDate && form.recurrenceEndDate >= form.date && (
                    <span style={{ fontSize: "0.82rem", color: "#111827" }}>
                      {Math.floor((new Date(form.recurrenceEndDate + "T12:00:00").getTime() - new Date(form.date + "T12:00:00").getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1} occurrences
                    </span>
                  )}
                </div>
              )}
            </div>
            {postError && <p style={{ marginTop: "10px", fontSize: "0.82rem", color: "#DC2626" }}>{postError}</p>}
            {form.endTime <= form.startTime && form.date && <p style={{ marginTop: "6px", fontSize: "0.82rem", color: "#DC2626" }}>End time must be after start time.</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
              <button disabled={postDisabled} onClick={postSlot} style={{ ...btnPrimary, opacity: postDisabled ? 0.5 : 1 }}>
                {actionLoading === "post" ? "Posting…" : form.isRecurring ? "Post Recurring Slots" : "Post Slot"}
              </button>
            </div>
          </div>
        )}

        {/* Bulk selection bar */}
        {selectedSlotIds.size > 0 && tab !== "settings" && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px" }}>
            <span style={{ fontSize: "0.875rem", color: "#B91C1C", fontWeight: 600 }}>{selectedSlotIds.size} slot{selectedSlotIds.size !== 1 ? "s" : ""} selected</span>
            {!isAdminPreview && <button disabled={actionLoading === "batch-delete"} onClick={cancelSelectedSlots} style={{ padding: "6px 14px", fontSize: "0.8rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === "batch-delete" ? 0.5 : 1 }}>{actionLoading === "batch-delete" ? "Cancelling…" : "Cancel Selected"}</button>}
            <button onClick={() => setSelectedSlotIds(new Set())} style={{ background: "none", border: "none", color: "#DC2626", fontFamily: "inherit", fontSize: "0.8rem", cursor: "pointer" }}>Clear</button>
          </div>
        )}

        {/* Slot list */}
        {tab !== "settings" && (
          displaySlots.length === 0
            ? <div style={{ ...card, padding: "48px", textAlign: "center" }}><p style={{ color: "#111827" }}>{tab === "upcoming" ? "No upcoming slots. Post one to get started." : "No past slots."}</p></div>
            : tab === "upcoming"
              ? Object.entries(upcomingByDate).map(([label, ds]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gray-900)", margin: "28px 0 12px" }}>{label}</div>
                  {ds.map((slot) => <SlotCard key={slot.id} slot={slot} isPast={false} selectedSlotIds={selectedSlotIds} actionLoading={actionLoading} onToggleSelect={toggleSelectSlot} onEdit={(s) => { setEditSlot({ ...s }); setEditScope("single"); }} onCancel={(s) => setCancelConfirm({ slotId: s.id, isRecurring: s.isRecurring && !!s.recurrenceGroupId })} onNoShow={reportNoShow} isAdminPreview={isAdminPreview} />)}
                </div>
              ))
              : past.map((slot) => <SlotCard key={slot.id} slot={slot} isPast={!isUpcoming(slot)} selectedSlotIds={selectedSlotIds} actionLoading={actionLoading} onToggleSelect={toggleSelectSlot} onEdit={(s) => { setEditSlot({ ...s }); setEditScope("single"); }} onCancel={(s) => setCancelConfirm({ slotId: s.id, isRecurring: s.isRecurring && !!s.recurrenceGroupId })} onNoShow={reportNoShow} isAdminPreview={isAdminPreview} />)
        )}

        {/* Notification Settings */}
        {tab === "settings" && (
          <div style={{ maxWidth: "560px" }}>
            <div style={card}>
              <div style={{ padding: "18px 24px", borderBottom: "1.5px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>Email Notifications</h2>
                {notifSaved && <span style={{ fontSize: "0.82rem", color: "var(--green)" }}>Saved ✓</span>}
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: "0.82rem", color: "#111827", marginBottom: "20px" }}>Changes save instantly.</p>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "18px", cursor: "pointer" }}>
                  <Toggle on={notifPrefs.dailySummary} onToggle={() => saveNotifPrefs({ ...notifPrefs, dailySummary: !notifPrefs.dailySummary })} />
                  <div><p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--gray-900)" }}>Daily summary email</p><p style={{ fontSize: "0.8rem", color: "#111827", marginTop: "2px" }}>Sent each morning with all your upcoming slots and their current roster</p></div>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "22px", cursor: "pointer" }}>
                  <Toggle on={notifPrefs.unfilledAlert24h} onToggle={() => saveNotifPrefs({ ...notifPrefs, unfilledAlert24h: !notifPrefs.unfilledAlert24h })} />
                  <div><p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--gray-900)" }}>Unfilled slot alert (24 hrs before)</p><p style={{ fontSize: "0.8rem", color: "#111827", marginTop: "2px" }}>Email if any sub-block is still open within 24 hours</p></div>
                </label>
                <div style={{ paddingTop: "18px", borderTop: "1px solid var(--card-border)" }}>
                  <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--gray-900)", marginBottom: "4px" }}>Volunteer cancellation alert</p>
                  <p style={{ fontSize: "0.8rem", color: "#111827", marginBottom: "12px" }}>Get notified when a volunteer cancels within a certain window of the appointment</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {([null, 2, 4, 12, 24] as (number | null)[]).map((v) => (
                      <button key={String(v)} onClick={() => saveNotifPrefs({ ...notifPrefs, volunteerCancelWindow: v })} style={{ padding: "8px 16px", fontSize: "0.82rem", fontFamily: "inherit", cursor: "pointer", borderRadius: "8px", border: "1.5px solid", background: notifPrefs.volunteerCancelWindow === v ? "var(--blue)" : "transparent", color: notifPrefs.volunteerCancelWindow === v ? "#fff" : "var(--gray-600)", borderColor: notifPrefs.volunteerCancelWindow === v ? "var(--blue)" : "var(--card-border)", fontWeight: 500 }}>
                        {v === null ? "Don't notify" : `Within ${v}h`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Edit Slot Modal */}
      {editSlot && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "520px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy)" }}>Edit Slot</h3>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {editSlot.isRecurring && editSlot.recurrenceGroupId && (
                <div style={{ display: "flex", border: "1.5px solid var(--card-border)", borderRadius: "10px", overflow: "hidden", marginBottom: "18px" }}>
                  {(["single", "this_and_future"] as const).map((scope, i) => (
                    <button key={scope} onClick={() => setEditScope(scope)} style={{ flex: 1, padding: "10px 14px", fontSize: "0.875rem", fontFamily: "inherit", cursor: "pointer", border: "none", background: editScope === scope ? "var(--blue)" : "#fff", color: editScope === scope ? "#fff" : "var(--gray-600)", fontWeight: editScope === scope ? 600 : 400, borderRight: i === 0 ? "1px solid var(--card-border)" : "none" }}>
                      {scope === "single" ? "This date only" : "This and all future dates"}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div><FieldLabel>Language</FieldLabel><select value={editSlot.language} onChange={(e) => setEditSlot({ ...editSlot, language: e.target.value })} style={{ ...iStyle, cursor: "pointer" }}>{activeLanguages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
                <div><FieldLabel>Date</FieldLabel><input type="date" value={editSlot.date.split("T")[0]} onChange={(e) => setEditSlot({ ...editSlot, date: e.target.value })} style={iStyle} /></div>
                <div><FieldLabel>Start Time</FieldLabel><select value={editSlot.startTime} onChange={(e) => setEditSlot({ ...editSlot, startTime: Number(e.target.value) })} style={{ ...iStyle, cursor: "pointer" }}>{HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
                <div><FieldLabel>End Time</FieldLabel><select value={editSlot.endTime} onChange={(e) => setEditSlot({ ...editSlot, endTime: Number(e.target.value) })} style={{ ...iStyle, cursor: "pointer" }}>{HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
                <div><FieldLabel>Interpreters / Hour</FieldLabel><input type="number" min={1} max={10} value={editSlot.interpreterCount} onChange={(e) => setEditSlot({ ...editSlot, interpreterCount: Number(e.target.value) })} style={iStyle} /></div>
                <div><FieldLabel>Notes</FieldLabel><input value={editSlot.notes ?? ""} onChange={(e) => setEditSlot({ ...editSlot, notes: e.target.value })} style={iStyle} /></div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button disabled={actionLoading === "edit" || editSlot.endTime <= editSlot.startTime} onClick={requestSaveEdit} style={{ ...btnPrimary, opacity: actionLoading === "edit" || editSlot.endTime <= editSlot.startTime ? 0.5 : 1 }}>{actionLoading === "edit" ? "Saving…" : "Save Changes"}</button>
                <button onClick={() => setEditSlot(null)} style={{ padding: "10px 22px", borderRadius: "9px", background: "none", border: "1.5px solid var(--card-border)", color: "#111827", fontFamily: "inherit", fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Warning Modal */}
      {editWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 24px", width: "100%", maxWidth: "380px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "20px" }}>
              <div style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%", background: "#FFFBEB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#D97706" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>Volunteers will be removed</h3>
                <p style={{ fontSize: "0.875rem", color: "#111827" }}>{editWarning.cancelCount} volunteer signup{editWarning.cancelCount !== 1 ? "s" : ""} conflict with your changes and will be cancelled.</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button disabled={actionLoading === "edit"} onClick={confirmSaveEdit} style={{ ...btnPrimary, width: "100%", textAlign: "center", opacity: actionLoading === "edit" ? 0.5 : 1 }}>{actionLoading === "edit" ? "Saving…" : "Save Changes Anyway"}</button>
              <button onClick={() => setEditWarning(null)} style={{ padding: "10px", borderRadius: "9px", background: "var(--page-bg)", border: "1.5px solid var(--card-border)", color: "#111827", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}>Go Back &amp; Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "360px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>Cancel Slot</h3>
            <p style={{ fontSize: "0.82rem", color: "#111827", marginBottom: "16px" }}>All volunteer signups for the cancelled slot(s) will be removed.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
              {cancelConfirm.isRecurring ? (
                <>
                  <button disabled={!!actionLoading} onClick={() => cancelSlot(cancelConfirm.slotId, "single")} style={{ textAlign: "left", padding: "12px 16px", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", fontFamily: "inherit", cursor: "pointer", opacity: !!actionLoading ? 0.5 : 1 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)" }}>This date only</p>
                    <p style={{ fontSize: "0.78rem", color: "#111827", marginTop: "2px" }}>Cancel just this occurrence</p>
                  </button>
                  <button disabled={!!actionLoading} onClick={() => cancelSlot(cancelConfirm.slotId, "this_and_future")} style={{ textAlign: "left", padding: "12px 16px", border: "1px solid #FECACA", borderRadius: "9px", background: "#FEF2F2", fontFamily: "inherit", cursor: "pointer", opacity: !!actionLoading ? 0.5 : 1 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#DC2626" }}>This and all future dates</p>
                    <p style={{ fontSize: "0.78rem", color: "#EF4444", marginTop: "2px" }}>Cancel this and all future occurrences</p>
                  </button>
                </>
              ) : (
                <button disabled={!!actionLoading} onClick={() => cancelSlot(cancelConfirm.slotId, "single")} style={{ textAlign: "left", padding: "12px 16px", border: "1px solid #FECACA", borderRadius: "9px", background: "#FEF2F2", fontFamily: "inherit", cursor: "pointer", opacity: !!actionLoading ? 0.5 : 1, fontSize: "0.875rem", fontWeight: 600, color: "#DC2626" }}>
                  {actionLoading ? "Cancelling…" : "Confirm Cancel"}
                </button>
              )}
            </div>
            <button onClick={() => setCancelConfirm(null)} style={{ width: "100%", padding: "10px", borderRadius: "9px", background: "none", border: "1.5px solid var(--card-border)", color: "#111827", fontFamily: "inherit", fontSize: "0.875rem", cursor: "pointer" }}>Keep Slot</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClinicDashboard() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}><p style={{ color: "#111827" }}>Loading…</p></div>}>
      <ClinicDashboardInner />
    </Suspense>
  );
}

// ── Slot Card ─────────────────────────────────────────────────────────────────

function SlotCard({ slot, isPast, selectedSlotIds, actionLoading, onToggleSelect, onEdit, onCancel, onNoShow, isAdminPreview }: {
  slot: Slot; isPast: boolean; selectedSlotIds: Set<string>; actionLoading: string | null;
  onToggleSelect: (id: string) => void; onEdit: (slot: Slot) => void;
  onCancel: (slot: Slot) => void; onNoShow: (slotId: string, signupId: string) => void;
  isAdminPreview?: boolean;
}) {
  const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
  const totalFilled = slot.signups.filter((s) => s.status === "ACTIVE").length;
  const openCount = subBlocks.length * slot.interpreterCount - totalFilled;

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.55 : 1 }}>
      {/* Header */}
      <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {!isPast && slot.status === "ACTIVE" && <input type="checkbox" checked={selectedSlotIds.has(slot.id)} onChange={() => onToggleSelect(slot.id)} onClick={(e) => e.stopPropagation()} style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--navy)" }} />}
            <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{langName(slot.language)}</span>
            {slot.isRecurring && <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 9px", borderRadius: "99px", background: "#F5F3FF", color: "#7C3AED", border: "1px solid #E9D5FF" }}>Weekly</span>}
            {slot.status === "CANCELLED" && <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 9px", borderRadius: "99px", background: "var(--gray-200)", color: "var(--gray-600)" }}>Cancelled</span>}
          </div>
          <div style={{ display: "flex", gap: "24px", marginTop: "10px", flexWrap: "wrap" }}>
            {[{ label: "Date", val: formatDate(slot.date) }, { label: "Session", val: `${formatHour(slot.startTime)} – ${formatHour(slot.endTime)}` }, { label: "Interpreters/hr", val: String(slot.interpreterCount) }].map(({ label, val }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#111827" }}>{label}</span>
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{val}</span>
              </div>
            ))}
          </div>
          {slot.notes && <p style={{ fontSize: "0.82rem", color: "#111827", fontStyle: "italic", marginTop: "8px" }}>{slot.notes}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          {!isPast && <div style={{ background: openCount > 0 ? "var(--green-light)" : "var(--gray-200)", color: openCount > 0 ? "var(--green)" : "var(--gray-600)", fontSize: "0.9rem", fontWeight: 700, padding: "9px 18px", borderRadius: "10px", textAlign: "center", lineHeight: 1.2 }}>{openCount} open<span style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, marginTop: "2px", opacity: 0.8 }}>slots</span></div>}
          {!isPast && slot.status === "ACTIVE" && !isAdminPreview && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => onEdit(slot)} style={{ fontSize: "0.78rem", padding: "6px 14px", background: "var(--page-bg)", color: "#111827", border: "1px solid var(--card-border)", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer" }}>Edit</button>
              <button disabled={actionLoading === slot.id} onClick={() => onCancel(slot)} style={{ fontSize: "0.78rem", padding: "6px 14px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === slot.id ? 0.5 : 1 }}>Cancel Slot</button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-blocks table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ background: "#FAFAF9", borderBottom: "1px solid var(--card-border)" }}>
            {["Hour", "Volunteer", "Status", ...(isPast ? ["Action"] : [])].map((h) => (
              <th key={h} style={{ textAlign: h === "Action" ? "right" : "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#111827", padding: "9px 16px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subBlocks.map((hour) => {
            const hourSignups = slot.signups.filter((s) => s.subBlockHour === hour);
            const empty = slot.interpreterCount - hourSignups.length;
            return (
              <Fragment key={hour}>
                {hourSignups.map((signup) => (
                  <tr key={signup.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "10px 16px", color: "#111827", fontSize: "0.82rem", whiteSpace: "nowrap" }}>{formatHour(hour)} – {formatHour(hour + 1)}</td>
                    <td style={{ padding: "10px 16px", fontSize: "0.82rem" }}>
                      <span style={{ fontWeight: 500, color: "var(--gray-900)" }}>{signup.volunteer.user.name}</span>
                      <span style={{ color: "#111827", marginLeft: "8px", fontSize: "0.78rem" }}>{signup.volunteer.user.email}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "3px 9px", borderRadius: "99px", background: signup.status === "ACTIVE" ? "var(--green-light)" : signup.status === "NO_SHOW" ? "#FEF2F2" : "var(--gray-200)", color: signup.status === "ACTIVE" ? "var(--green)" : signup.status === "NO_SHOW" ? "#DC2626" : "var(--gray-600)" }}>
                        {signup.status === "ACTIVE" ? "Confirmed" : signup.status.replace("_", " ")}
                      </span>
                    </td>
                    {isPast && <td style={{ padding: "10px 16px", textAlign: "right" }}>{signup.status === "ACTIVE" && <button disabled={actionLoading === signup.id} onClick={() => onNoShow(slot.id, signup.id)} style={{ fontSize: "0.75rem", padding: "4px 10px", background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === signup.id ? 0.5 : 1 }}>No-Show</button>}</td>}
                  </tr>
                ))}
                {Array.from({ length: empty }).map((_, i) => (
                  <tr key={`empty-${hour}-${i}`} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "10px 16px", color: "#111827", fontSize: "0.82rem", whiteSpace: "nowrap" }}>{formatHour(hour)} – {formatHour(hour + 1)}</td>
                    <td style={{ padding: "10px 16px", color: "#111827", fontSize: "0.82rem", fontStyle: "italic" }}>Open</td>
                    <td style={{ padding: "10px 16px" }}><span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "3px 9px", borderRadius: "99px", background: "var(--page-bg)", color: "#111827", border: "1px solid var(--card-border)" }}>Available</span></td>
                    {isPast && <td />}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
