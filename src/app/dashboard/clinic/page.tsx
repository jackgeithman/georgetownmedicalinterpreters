"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, Fragment } from "react";

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

const LANG_LABELS: Record<string, string> = {
  ES: "Spanish",
  ZH: "Chinese",
  KO: "Korean",
};

const RATING_OPTIONS = [
  { value: 1, label: "Needs Improvement", active: "bg-red-100 text-red-700 border-red-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-red-200 hover:text-red-600" },
  { value: 2, label: "Okay",              active: "bg-orange-100 text-orange-700 border-orange-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-orange-200 hover:text-orange-600" },
  { value: 3, label: "Good",              active: "bg-yellow-100 text-yellow-700 border-yellow-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-yellow-200 hover:text-yellow-600" },
  { value: 4, label: "Excellent",         active: "bg-green-100 text-green-700 border-green-300",  idle: "bg-white text-stone-500 border-stone-200 hover:border-green-200 hover:text-green-600" },
  { value: 5, label: "I'd literally hire them", active: "bg-emerald-100 text-emerald-700 border-emerald-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-emerald-200 hover:text-emerald-600" },
];

const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-blue-50 text-blue-700",
};

function MapsLinks({ address }: { address: string }) {
  const q = encodeURIComponent(address);
  return (
    <span className="inline-flex gap-1.5 ml-1.5 items-center">
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${q}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-500 hover:text-blue-700 underline"
        title="Google Maps"
      >
        G Maps
      </a>
      <span className="text-stone-300">·</span>
      <a
        href={`https://maps.apple.com/?q=${q}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-500 hover:text-blue-700 underline"
        title="Apple Maps"
      >
        Apple Maps
      </a>
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
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isUpcoming(slot: Slot): boolean {
  // A slot is upcoming until its end time has passed (local/browser time matches ET for GMI)
  const slotEnd = new Date(slot.date.slice(0, 10) + "T" + String(slot.endTime).padStart(2, "0") + ":00:00");
  return slotEnd > new Date();
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function ClinicDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editScope, setEditScope] = useState<"single" | "this_and_future">("single");
  const [cancelConfirm, setCancelConfirm] = useState<CancelConfirm | null>(null);
  const [editWarning, setEditWarning] = useState<{ cancelCount: number } | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<ClinicNotifPrefs>({
    dailySummary: true,
    volunteerCancelWindow: null,
    unfilledAlert24h: true,
  });
  const [notifSaved, setNotifSaved] = useState(false);
  const [form, setForm] = useState({
    language: "ES",
    date: "",
    startTime: 9,
    endTime: 12,
    interpreterCount: 1,
    notes: "",
    isRecurring: false,
    recurrenceEndDate: "",
  });
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [postError, setPostError] = useState("");
  // Feedback state
  const [feedbackModal, setFeedbackModal] = useState<{ signupId: string; feedbackKey: string; volunteerName: string } | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "CLINIC") router.push("/dashboard");
  }, [status, session, router]);

  const fetchSlots = useCallback(async () => {
    const [slotsRes, notifRes] = await Promise.all([
      fetch("/api/clinic/slots"),
      fetch("/api/clinic/notif-prefs"),
    ]);
    if (slotsRes.ok) setSlots(await slotsRes.json());
    if (notifRes.ok) setNotifPrefs(await notifRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === "CLINIC") fetchSlots();
  }, [session, fetchSlots]);

  const saveNotifPrefs = async (updated: ClinicNotifPrefs) => {
    await fetch("/api/clinic/notif-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setNotifPrefs(updated);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  const postSlot = async () => {
    if (!form.date) return;
    if (form.isRecurring && !form.recurrenceEndDate) return;
    setActionLoading("post");
    setPostError("");
    const res = await fetch("/api/clinic/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      await fetchSlots();
      setShowPostForm(false);
      setForm({ language: "ES", date: "", startTime: 9, endTime: 12, interpreterCount: 1, notes: "", isRecurring: false, recurrenceEndDate: "" });
    } else {
      const data = await res.json().catch(() => ({}));
      setPostError(data.error ?? "Could not post slot.");
    }
    setActionLoading(null);
  };

  const toggleSelectSlot = (slotId: string) => {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const cancelSelectedSlots = async () => {
    if (selectedSlotIds.size === 0) return;
    if (!confirm(`Cancel ${selectedSlotIds.size} selected slot(s)? This cannot be undone.`)) return;
    setActionLoading("batch-delete");
    for (const slotId of selectedSlotIds) {
      await fetch(`/api/clinic/slots/${slotId}?deleteScope=single`, { method: "DELETE" });
    }
    setSelectedSlotIds(new Set());
    await fetchSlots();
    setActionLoading(null);
  };

  // Called when the clinic clicks "Save Changes" — checks for affected volunteers first.
  const requestSaveEdit = () => {
    if (!editSlot) return;
    const original = slots.find((s) => s.id === editSlot.id);
    if (!original) { void confirmSaveEdit(); return; }

    const dateChanged = editSlot.date.split("T")[0] !== original.date.split("T")[0];
    const langChanged = editSlot.language !== original.language;

    const cancelCount = original.signups.filter((s) => {
      if (s.status !== "ACTIVE") return false;
      if (langChanged || dateChanged) return true; // all signups affected
      return s.subBlockHour < editSlot.startTime || s.subBlockHour >= editSlot.endTime;
    }).length;

    if (cancelCount > 0) {
      setEditWarning({ cancelCount });
    } else {
      void confirmSaveEdit();
    }
  };

  // Actually sends the PATCH request — called after confirmation.
  const confirmSaveEdit = async () => {
    if (!editSlot) return;
    setEditWarning(null);
    setActionLoading("edit");
    const res = await fetch(`/api/clinic/slots/${editSlot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: editSlot.language,
        date: editSlot.date.split("T")[0],
        startTime: editSlot.startTime,
        endTime: editSlot.endTime,
        interpreterCount: editSlot.interpreterCount,
        notes: editSlot.notes,
        editScope,
      }),
    });
    if (res.ok) {
      await fetchSlots();
      setEditSlot(null);
    }
    setActionLoading(null);
  };

  const cancelSlot = async (slotId: string, deleteScope: "single" | "this_and_future") => {
    setActionLoading(slotId);
    const res = await fetch(`/api/clinic/slots/${slotId}?deleteScope=${deleteScope}`, { method: "DELETE" });
    if (res.ok) await fetchSlots();
    setCancelConfirm(null);
    setActionLoading(null);
  };

  const reportNoShow = async (slotId: string, signupId: string) => {
    setActionLoading(signupId);
    const res = await fetch(`/api/clinic/slots/${slotId}/no-show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signupId }),
    });
    if (res.ok) await fetchSlots();
    setActionLoading(null);
  };

  const submitFeedback = async () => {
    if (!feedbackModal) return;
    setFeedbackSubmitting(true);
    setFeedbackError("");
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signupId: feedbackModal.signupId, rating: feedbackRating, note: feedbackNote }),
    });
    if (res.ok) {
      setFeedbackGiven((prev) => new Set([...prev, feedbackModal.feedbackKey]));
      setFeedbackModal(null);
      setFeedbackRating(0);
      setFeedbackNote("");
    } else {
      const err = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setFeedbackGiven((prev) => new Set([...prev, feedbackModal.feedbackKey]));
        setFeedbackModal(null);
        setFeedbackRating(0);
        setFeedbackNote("");
      } else {
        setFeedbackError(err.error ?? "Could not submit feedback.");
      }
    }
    setFeedbackSubmitting(false);
  };

  const upcoming = slots.filter((s) => s.status === "ACTIVE" && isUpcoming(s));
  const past = slots.filter((s) => !isUpcoming(s) || s.status !== "ACTIVE");

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!session?.user?.clinicId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <p className="text-stone-600 font-medium">No clinic assigned</p>
          <p className="text-stone-400 text-sm mt-1">
            Contact your admin to be assigned to a clinic.
          </p>
        </div>
      </div>
    );
  }

  const displaySlots = tab === "upcoming" ? upcoming : past;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
              <p className="text-xs text-stone-400">
                Clinic Dashboard
                {session?.user?.name && (
                  <span className="ml-1 text-stone-500">— {session.user.name}</span>
                )}
              </p>
            </div>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Contact Us
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <div className="flex gap-1 bg-stone-200/50 p-1 rounded-lg w-fit">
          {[
            { key: "upcoming" as Tab, label: "Upcoming", count: upcoming.length },
            { key: "past" as Tab, label: "Past", count: past.length },
            { key: "settings" as Tab, label: "Notifications", count: 0 },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                tab === t.key
                  ? "bg-white text-stone-800 shadow-sm font-medium"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab === "upcoming" && !showPostForm && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-400">{upcoming.length}/100 slots</span>
            <button
              onClick={() => setShowPostForm(true)}
              disabled={upcoming.length >= 100}
              className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-40"
              title={upcoming.length >= 100 ? "You have reached the 100-slot limit" : undefined}
            >
              + Post Slot
            </button>
          </div>
        )}
        {tab === "upcoming" && showPostForm && (
          <button
            onClick={() => setShowPostForm(false)}
            className="px-4 py-2 text-sm bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Post Slot Form */}
        {showPostForm && tab === "upcoming" && (
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h3 className="text-sm font-medium text-stone-700 mb-4">New Slot</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Language</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  {Object.entries(LANG_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Start Time</label>
                <select
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">End Time</label>
                <select
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Interpreters per Hour</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.interpreterCount}
                  onChange={(e) => setForm({ ...form, interpreterCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Notes (optional)</label>
                <input
                  placeholder="Any notes for volunteers..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
            </div>

            {/* Recurring toggle */}
            <div className="mt-4 border-t border-stone-100 pt-4">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked, recurrenceEndDate: "" })}
                  className="w-4 h-4 accent-stone-700"
                />
                <span className="text-sm text-stone-700">Repeat weekly</span>
              </label>
              {form.isRecurring && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs text-stone-500">Repeat until</label>
                  <input
                    type="date"
                    value={form.recurrenceEndDate}
                    min={form.date || undefined}
                    onChange={(e) => setForm({ ...form, recurrenceEndDate: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  {form.date && form.recurrenceEndDate && form.recurrenceEndDate >= form.date && (
                    <span className="text-xs text-stone-400">
                      {Math.floor(
                        (new Date(form.recurrenceEndDate + "T12:00:00").getTime() -
                          new Date(form.date + "T12:00:00").getTime()) /
                          (7 * 24 * 60 * 60 * 1000)
                      ) + 1}{" "}
                      occurrences
                    </span>
                  )}
                </div>
              )}
            </div>

            {postError && (
              <p className="mt-2 text-xs text-red-500">{postError}</p>
            )}
            <button
              disabled={
                actionLoading === "post" ||
                !form.date ||
                form.endTime <= form.startTime ||
                (form.isRecurring && !form.recurrenceEndDate)
              }
              onClick={postSlot}
              className="mt-4 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
            >
              {actionLoading === "post" ? "Posting..." : form.isRecurring ? "Post Recurring Slots" : "Post Slot"}
            </button>
            {form.endTime <= form.startTime && form.date && (
              <p className="mt-2 text-xs text-red-500">End time must be after start time.</p>
            )}
          </div>
        )}


        {selectedSlotIds.size > 0 && tab !== "settings" && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-sm text-red-700 font-medium">{selectedSlotIds.size} slot{selectedSlotIds.size !== 1 ? "s" : ""} selected</span>
            <button
              disabled={actionLoading === "batch-delete"}
              onClick={cancelSelectedSlots}
              className="px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
            >
              {actionLoading === "batch-delete" ? "Cancelling..." : "Cancel Selected"}
            </button>
            <button
              onClick={() => setSelectedSlotIds(new Set())}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Slot List */}
        {tab !== "settings" && (displaySlots.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
            <p className="text-stone-400">
              {tab === "upcoming" ? "No upcoming slots. Post one to get started." : "No past slots."}
            </p>
          </div>
        ) : (
          displaySlots.map((slot) => {
            const subBlocks = Array.from(
              { length: slot.endTime - slot.startTime },
              (_, i) => slot.startTime + i
            );
            const isPast = !isUpcoming(slot);

            return (
              <div key={slot.id} className="bg-white rounded-xl border border-stone-200 p-5">
                {/* Slot Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {!isPast && slot.status === "ACTIVE" && (
                      <input
                        type="checkbox"
                        checked={selectedSlotIds.has(slot.id)}
                        onChange={() => toggleSelectSlot(slot.id)}
                        className="w-4 h-4 accent-stone-700 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${LANG_COLORS[slot.language]}`}>
                      {LANG_LABELS[slot.language]}
                    </span>
                    <span className="text-sm font-medium text-stone-800">{formatDate(slot.date)}</span>
                    <span className="text-sm text-stone-500">
                      {formatHour(slot.startTime)} – {formatHour(slot.endTime)}
                    </span>
                    <span className="text-xs text-stone-400">
                      {slot.interpreterCount} interpreter{slot.interpreterCount !== 1 ? "s" : ""}/hour
                    </span>
                    {slot.isRecurring && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                        Weekly
                      </span>
                    )}
                  </div>
                  {!isPast && slot.status === "ACTIVE" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setEditSlot({ ...slot }); setEditScope("single"); }}
                        className="text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        disabled={actionLoading === slot.id}
                        onClick={() => setCancelConfirm({ slotId: slot.id, isRecurring: slot.isRecurring && !!slot.recurrenceGroupId })}
                        className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md transition-colors disabled:opacity-50"
                      >
                        Cancel Slot
                      </button>
                    </div>
                  )}
                  {slot.status === "CANCELLED" && (
                    <span className="text-xs px-2 py-1 bg-stone-100 text-stone-400 rounded-full">Cancelled</span>
                  )}
                </div>
                {slot.notes && (
                  <p className="text-xs text-stone-400 mb-3 italic">{slot.notes}</p>
                )}

                {/* Sub-blocks */}
                <div className="border border-stone-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-100">
                        <th className="text-left text-xs text-stone-400 font-medium px-4 py-2">Hour</th>
                        <th className="text-left text-xs text-stone-400 font-medium px-4 py-2">Volunteer</th>
                        <th className="text-left text-xs text-stone-400 font-medium px-4 py-2">Status</th>
                        {isPast && (
                          <th className="text-right text-xs text-stone-400 font-medium px-4 py-2">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {subBlocks.map((hour) => {
                        const hourSignups = slot.signups.filter((s) => s.subBlockHour === hour);
                        const filled = hourSignups.length;
                        const empty = slot.interpreterCount - filled;

                        return (
                          <Fragment key={hour}>
                            {hourSignups.map((signup) => (
                              <tr key={signup.id} className="border-b border-stone-50 last:border-0">
                                <td className="px-4 py-2.5 text-stone-600 text-xs">
                                  {formatHour(hour)} – {formatHour(hour + 1)}
                                </td>
                                <td className="px-4 py-2.5 text-stone-800 text-xs">
                                  {signup.volunteer.user.name}
                                  <span className="ml-1 text-stone-400">{signup.volunteer.user.email}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    signup.status === "ACTIVE"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : signup.status === "NO_SHOW"
                                      ? "bg-red-50 text-red-600"
                                      : "bg-stone-100 text-stone-500"
                                  }`}>
                                    {signup.status === "ACTIVE" ? "Confirmed" : signup.status.replace("_", " ")}
                                  </span>
                                </td>
                                {isPast && (
                                  <td className="px-4 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {signup.status === "ACTIVE" && (
                                        <button
                                          disabled={actionLoading === signup.id}
                                          onClick={() => reportNoShow(slot.id, signup.id)}
                                          className="text-xs px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded transition-colors disabled:opacity-50"
                                        >
                                          No-Show
                                        </button>
                                      )}
                                      {(() => {
                                        const feedbackKey = `${slot.id}-${signup.volunteer.id}`;
                                        // Only show the button on the first hour row for this volunteer in this slot
                                        const firstHourForVolunteer = Math.min(
                                          ...slot.signups
                                            .filter((s) => s.volunteer.id === signup.volunteer.id)
                                            .map((s) => s.subBlockHour)
                                        );
                                        if (signup.subBlockHour !== firstHourForVolunteer) return null;
                                        return feedbackGiven.has(feedbackKey) ? (
                                          <span className="text-xs text-emerald-600">✓ Rated</span>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setFeedbackModal({ signupId: signup.id, feedbackKey, volunteerName: signup.volunteer.user.name ?? signup.volunteer.user.email });
                                              setFeedbackRating(0);
                                              setFeedbackNote("");
                                              setFeedbackError("");
                                            }}
                                            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition-colors"
                                          >
                                            Rate
                                          </button>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                            {Array.from({ length: empty }).map((_, i) => (
                              <tr key={`empty-${hour}-${i}`} className="border-b border-stone-50 last:border-0">
                                <td className="px-4 py-2.5 text-stone-600 text-xs">
                                  {formatHour(hour)} – {formatHour(hour + 1)}
                                </td>
                                <td className="px-4 py-2.5 text-stone-300 text-xs italic">Open</td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-50 text-stone-300">
                                    Available
                                  </span>
                                </td>
                                {isPast && <td />}
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        ))}
        {/* Notification Settings */}
        {tab === "settings" && (
          <div className="max-w-lg space-y-6">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-stone-700">Email Notifications</h3>
                {notifSaved && <span className="text-xs text-emerald-600">Saved ✓</span>}
              </div>
              <p className="text-xs text-stone-400 mb-5">Changes save instantly.</p>

              <div className="space-y-4">
                {/* Daily summary */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <button
                    role="switch"
                    aria-checked={notifPrefs.dailySummary}
                    onClick={() => saveNotifPrefs({ ...notifPrefs, dailySummary: !notifPrefs.dailySummary })}
                    className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      notifPrefs.dailySummary ? "bg-stone-800" : "bg-stone-200"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notifPrefs.dailySummary ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <div>
                    <p className="text-sm text-stone-700">Daily summary email</p>
                    <p className="text-xs text-stone-400">Sent each morning with all your upcoming slots and their current roster</p>
                  </div>
                </label>

                {/* Unfilled alert */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <button
                    role="switch"
                    aria-checked={notifPrefs.unfilledAlert24h}
                    onClick={() => saveNotifPrefs({ ...notifPrefs, unfilledAlert24h: !notifPrefs.unfilledAlert24h })}
                    className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      notifPrefs.unfilledAlert24h ? "bg-stone-800" : "bg-stone-200"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notifPrefs.unfilledAlert24h ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <div>
                    <p className="text-sm text-stone-700">Unfilled slot alert (24 hrs before)</p>
                    <p className="text-xs text-stone-400">Email if any sub-block is still open within 24 hours of the appointment</p>
                  </div>
                </label>

                {/* Volunteer cancel window */}
                <div className="pt-2 border-t border-stone-100">
                  <p className="text-sm text-stone-700 mb-1">Volunteer cancellation alert</p>
                  <p className="text-xs text-stone-400 mb-3">Get notified when a volunteer cancels within a certain window of the appointment</p>
                  <div className="flex flex-wrap gap-2">
                    {([null, 2, 4, 12, 24] as (number | null)[]).map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => saveNotifPrefs({ ...notifPrefs, volunteerCancelWindow: v })}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                          notifPrefs.volunteerCancelWindow === v
                            ? "bg-stone-800 text-white border-stone-800"
                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        {v === null ? "Don't notify" : `Within ${v}h`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Slot Modal */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-sm font-medium text-stone-700 mb-4">Edit Slot</h3>

            {/* Scope selector for recurring slots */}
            {editSlot.isRecurring && editSlot.recurrenceGroupId && (
              <div className="mb-4 border border-stone-200 rounded-lg overflow-hidden">
                {(["single", "this_and_future"] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setEditScope(scope)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      editScope === scope
                        ? "bg-stone-800 text-white"
                        : "bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {scope === "single" ? "This date only" : "This and all future dates"}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Language</label>
                <select
                  value={editSlot.language}
                  onChange={(e) => setEditSlot({ ...editSlot, language: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  {Object.entries(LANG_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Date</label>
                <input
                  type="date"
                  value={editSlot.date.split("T")[0]}
                  onChange={(e) => setEditSlot({ ...editSlot, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Start Time</label>
                <select
                  value={editSlot.startTime}
                  onChange={(e) => setEditSlot({ ...editSlot, startTime: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">End Time</label>
                <select
                  value={editSlot.endTime}
                  onChange={(e) => setEditSlot({ ...editSlot, endTime: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Interpreters per Hour</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editSlot.interpreterCount}
                  onChange={(e) => setEditSlot({ ...editSlot, interpreterCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Notes</label>
                <input
                  value={editSlot.notes ?? ""}
                  onChange={(e) => setEditSlot({ ...editSlot, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                disabled={actionLoading === "edit" || editSlot.endTime <= editSlot.startTime}
                onClick={requestSaveEdit}
                className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
              >
                {actionLoading === "edit" ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setEditSlot(null)}
                className="px-4 py-2 text-sm bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit — Volunteer Cancellation Warning Modal */}
      {editWarning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Volunteers will be removed</h3>
                <p className="text-sm text-stone-500 mt-1">
                  {editWarning.cancelCount} volunteer signup{editWarning.cancelCount !== 1 ? "s" : ""}{" "}
                  conflict{editWarning.cancelCount === 1 ? "s" : ""} with your changes and will be cancelled
                  if you proceed.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                disabled={actionLoading === "edit"}
                onClick={confirmSaveEdit}
                className="w-full px-4 py-2.5 text-sm bg-stone-800 hover:bg-stone-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === "edit" ? "Saving..." : "Save Changes Anyway"}
              </button>
              <button
                onClick={() => setEditWarning(null)}
                className="w-full px-4 py-2.5 text-sm bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-lg transition-colors"
              >
                Go Back &amp; Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-stone-800 mb-1">How did {feedbackModal.volunteerName} perform?</h3>
            <p className="text-xs text-stone-400 mb-4">Your feedback helps us improve volunteer quality.</p>

            {/* Rating */}
            <div className="flex flex-col gap-2 mb-4">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFeedbackRating(opt.value)}
                  className={`px-3 py-2 text-sm rounded-md border transition-colors text-left ${feedbackRating === opt.value ? opt.active : opt.idle}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <textarea
              placeholder="Any additional comments? (optional)"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none mb-3"
            />

            {feedbackError && <p className="text-xs text-red-500 mb-3">{feedbackError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setFeedbackModal(null); setFeedbackRating(0); setFeedbackNote(""); setFeedbackError(""); }}
                className="flex-1 px-4 py-2 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={feedbackSubmitting || feedbackRating === 0}
                onClick={submitFeedback}
                className="flex-1 px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
              >
                {feedbackSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-medium text-stone-700 mb-2">Cancel Slot</h3>
            <p className="text-xs text-stone-500 mb-4">
              All volunteer signups for the cancelled slot(s) will be removed.
            </p>
            {cancelConfirm.isRecurring ? (
              <div className="space-y-2 mb-4">
                <button
                  disabled={!!actionLoading}
                  onClick={() => cancelSlot(cancelConfirm.slotId, "single")}
                  className="w-full text-left px-4 py-3 text-sm border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  <span className="font-medium text-stone-700">This date only</span>
                  <p className="text-xs text-stone-400 mt-0.5">Cancel just this occurrence</p>
                </button>
                <button
                  disabled={!!actionLoading}
                  onClick={() => cancelSlot(cancelConfirm.slotId, "this_and_future")}
                  className="w-full text-left px-4 py-3 text-sm border border-red-100 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 text-red-700"
                >
                  <span className="font-medium">This and all future dates</span>
                  <p className="text-xs text-red-400 mt-0.5">Cancel this occurrence and all future ones</p>
                </button>
              </div>
            ) : (
              <div className="mb-4">
                <button
                  disabled={!!actionLoading}
                  onClick={() => cancelSlot(cancelConfirm.slotId, "single")}
                  className="w-full text-left px-4 py-3 text-sm border border-red-100 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 text-red-700 font-medium"
                >
                  {actionLoading ? "Cancelling..." : "Confirm Cancel"}
                </button>
              </div>
            )}
            <button
              onClick={() => setCancelConfirm(null)}
              className="w-full px-4 py-2 text-sm bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Keep Slot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
