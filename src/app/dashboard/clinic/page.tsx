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
  notes: string | null;
  status: string;
  signups: SubBlockSignup[];
};

type Tab = "upcoming" | "past";

const LANG_LABELS: Record<string, string> = {
  ES: "Spanish",
  ZH: "Chinese",
  KO: "Korean",
  AR: "Arabic",
};

const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-blue-50 text-blue-700",
  AR: "bg-emerald-50 text-emerald-700",
};

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isUpcoming(slot: Slot): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(slot.date) >= today;
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
  const [form, setForm] = useState({
    language: "ES",
    date: "",
    startTime: 9,
    endTime: 12,
    interpreterCount: 1,
    notes: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "CLINIC") router.push("/dashboard");
  }, [status, session, router]);

  const fetchSlots = useCallback(async () => {
    const res = await fetch("/api/clinic/slots");
    if (res.ok) setSlots(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === "CLINIC") fetchSlots();
  }, [session, fetchSlots]);

  const postSlot = async () => {
    if (!form.date) return;
    setActionLoading("post");
    const res = await fetch("/api/clinic/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      await fetchSlots();
      setShowPostForm(false);
      setForm({ language: "ES", date: "", startTime: 9, endTime: 12, interpreterCount: 1, notes: "" });
    }
    setActionLoading(null);
  };

  const saveEdit = async () => {
    if (!editSlot) return;
    setActionLoading("edit");
    const res = await fetch(`/api/clinic/slots/${editSlot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: editSlot.language,
        date: editSlot.date,
        startTime: editSlot.startTime,
        endTime: editSlot.endTime,
        interpreterCount: editSlot.interpreterCount,
        notes: editSlot.notes,
      }),
    });
    if (res.ok) {
      const { cancelledCount } = await res.json();
      await fetchSlots();
      setEditSlot(null);
      if (cancelledCount > 0) {
        alert(`${cancelledCount} volunteer signup(s) were automatically cancelled due to the time change.`);
      }
    }
    setActionLoading(null);
  };

  const cancelSlot = async (id: string) => {
    if (!confirm("Cancel this slot? All volunteer signups will be removed.")) return;
    setActionLoading(id);
    const res = await fetch(`/api/clinic/slots/${id}`, { method: "DELETE" });
    if (res.ok) await fetchSlots();
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
          <div>
            <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
            <p className="text-xs text-stone-400">Clinic Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-500">{session?.user?.email}</span>
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
        {tab === "upcoming" && (
          <button
            onClick={() => setShowPostForm(!showPostForm)}
            className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors"
          >
            {showPostForm ? "Cancel" : "+ Post Slot"}
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
            <button
              disabled={actionLoading === "post" || !form.date || form.endTime <= form.startTime}
              onClick={postSlot}
              className="mt-4 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
            >
              {actionLoading === "post" ? "Posting..." : "Post Slot"}
            </button>
            {form.endTime <= form.startTime && form.date && (
              <p className="mt-2 text-xs text-red-500">End time must be after start time.</p>
            )}
          </div>
        )}

        {/* Slot List */}
        {displaySlots.length === 0 ? (
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
                  <div className="flex items-center gap-3">
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
                  </div>
                  {!isPast && slot.status === "ACTIVE" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditSlot({ ...slot })}
                        className="text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        disabled={actionLoading === slot.id}
                        onClick={() => cancelSlot(slot.id)}
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
                                    {signup.status === "ACTIVE" && (
                                      <button
                                        disabled={actionLoading === signup.id}
                                        onClick={() => reportNoShow(slot.id, signup.id)}
                                        className="text-xs px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded transition-colors disabled:opacity-50"
                                      >
                                        No-Show
                                      </button>
                                    )}
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
        )}
      </div>

      {/* Edit Slot Modal */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-sm font-medium text-stone-700 mb-4">Edit Slot</h3>
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-md mb-4">
              Volunteers outside the new time window will be automatically unassigned.
            </p>
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
                onClick={saveEdit}
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
    </div>
  );
}
