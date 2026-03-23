"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type BrowseSlot = {
  id: string;
  language: string;
  date: string;
  startTime: number;
  endTime: number;
  interpreterCount: number;
  notes: string | null;
  clinic: { name: string; address: string };
  signups: { subBlockHour: number; volunteerId: string }[];
};

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

type VolunteerProfile = {
  id: string;
  languages: string[];
  backgroundInfo: string | null;
  sessionsCompleted: number;
  totalCancellations: number;
  noShows: number;
};

type Tab = "browse" | "signups" | "profile";

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
  const d = new Date(s.slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function VolunteerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("browse");
  const [browseSlots, setBrowseSlots] = useState<BrowseSlot[]>([]);
  const [mySignups, setMySignups] = useState<MySignup[]>([]);
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<string>("ALL");
  const [profileForm, setProfileForm] = useState<{ languages: string[]; backgroundInfo: string }>({
    languages: [],
    backgroundInfo: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "VOLUNTEER") router.push("/dashboard");
  }, [status, session, router]);

  const fetchAll = useCallback(async () => {
    const [slotsRes, signupsRes, profileRes] = await Promise.all([
      fetch("/api/volunteer/slots"),
      fetch("/api/volunteer/signups"),
      fetch("/api/volunteer/profile"),
    ]);
    if (slotsRes.ok) setBrowseSlots(await slotsRes.json());
    if (signupsRes.ok) setMySignups(await signupsRes.json());
    if (profileRes.ok) {
      const p = await profileRes.json();
      setProfile(p);
      setProfileForm({ languages: p.languages ?? [], backgroundInfo: p.backgroundInfo ?? "" });
    }
    setLoading(false);
  }, []);

  const fetchBrowse = useCallback(async () => {
    const params = langFilter !== "ALL" ? `?language=${langFilter}` : "";
    const res = await fetch(`/api/volunteer/slots${params}`);
    if (res.ok) setBrowseSlots(await res.json());
  }, [langFilter]);

  useEffect(() => {
    if (session?.user?.role === "VOLUNTEER") fetchAll();
  }, [session, fetchAll]);

  useEffect(() => {
    if (profile) fetchBrowse();
  }, [langFilter, fetchBrowse, profile]);

  const signUp = async (slotId: string, subBlockHour: number) => {
    const key = `${slotId}-${subBlockHour}`;
    setActionLoading(key);
    const res = await fetch("/api/volunteer/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, subBlockHour }),
    });
    if (res.ok) {
      await Promise.all([fetchBrowse(), fetchAll()]);
    } else {
      const err = await res.json();
      alert(err.error ?? "Could not sign up.");
    }
    setActionLoading(null);
  };

  const cancelSignup = async (id: string) => {
    if (!confirm("Cancel this signup?")) return;
    setActionLoading(id);
    const res = await fetch(`/api/volunteer/signups/${id}`, { method: "DELETE" });
    if (res.ok) await fetchAll();
    setActionLoading(null);
  };

  const saveProfile = async () => {
    setActionLoading("profile");
    const res = await fetch("/api/volunteer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    if (res.ok) setProfile(await res.json());
    setActionLoading(null);
  };

  const toggleLanguage = (lang: string) => {
    const langs = profileForm.languages.includes(lang)
      ? profileForm.languages.filter((l) => l !== lang)
      : [...profileForm.languages, lang];
    setProfileForm({ ...profileForm, languages: langs });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  // Group my signups by slot
  const signupsBySlot: Record<string, MySignup[]> = {};
  for (const s of mySignups) {
    if (!signupsBySlot[s.slot.id]) signupsBySlot[s.slot.id] = [];
    signupsBySlot[s.slot.id].push(s);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
            <p className="text-xs text-stone-400">Volunteer Dashboard</p>
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
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <div className="flex gap-1 bg-stone-200/50 p-1 rounded-lg w-fit">
          {[
            { key: "browse" as Tab, label: "Browse Slots", count: 0 },
            { key: "signups" as Tab, label: "My Signups", count: mySignups.length },
            { key: "profile" as Tab, label: "Profile", count: 0 },
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
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Browse Slots */}
        {tab === "browse" && (
          <div>
            {/* Language Filter */}
            <div className="flex gap-2 mb-5">
              {["ALL", "ES", "ZH", "KO", "AR"].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLangFilter(lang)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    langFilter === lang
                      ? "bg-stone-800 text-white"
                      : "bg-white border border-stone-200 text-stone-500 hover:border-stone-300"
                  }`}
                >
                  {lang === "ALL" ? "All Languages" : LANG_LABELS[lang]}
                </button>
              ))}
            </div>

            {browseSlots.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No available slots. Check back soon.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {browseSlots.map((slot) => {
                  const subBlocks = Array.from(
                    { length: slot.endTime - slot.startTime },
                    (_, i) => slot.startTime + i
                  );

                  return (
                    <div key={slot.id} className="bg-white rounded-xl border border-stone-200 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${LANG_COLORS[slot.language]}`}>
                            {LANG_LABELS[slot.language]}
                          </span>
                          <span className="text-sm font-medium text-stone-800">{formatDate(slot.date)}</span>
                          <span className="text-sm text-stone-500">
                            {formatHour(slot.startTime)} – {formatHour(slot.endTime)}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-stone-800">{slot.clinic.name}</p>
                          {slot.clinic.address && (
                            <p className="text-xs text-stone-400">{slot.clinic.address}</p>
                          )}
                        </div>
                      </div>
                      {slot.notes && (
                        <p className="text-xs text-stone-400 italic mb-3">{slot.notes}</p>
                      )}

                      {/* Sub-blocks */}
                      <div className="space-y-2">
                        {subBlocks.map((hour) => {
                          const filled = slot.signups.filter((s) => s.subBlockHour === hour).length;
                          const isMine = profile
                            ? slot.signups.some((s) => s.subBlockHour === hour && s.volunteerId === profile.id)
                            : false;
                          const isFull = filled >= slot.interpreterCount;
                          const key = `${slot.id}-${hour}`;

                          return (
                            <div
                              key={hour}
                              className="flex items-center justify-between px-3 py-2 rounded-md bg-stone-50"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-stone-600 w-28">
                                  {formatHour(hour)} – {formatHour(hour + 1)}
                                </span>
                                <span className="text-xs text-stone-400">
                                  {filled}/{slot.interpreterCount} filled
                                </span>
                              </div>
                              {isMine ? (
                                <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-medium">
                                  Signed Up
                                </span>
                              ) : isFull ? (
                                <span className="text-xs px-2 py-1 bg-stone-100 text-stone-400 rounded-md">
                                  Full
                                </span>
                              ) : (
                                <button
                                  disabled={actionLoading === key}
                                  onClick={() => signUp(slot.id, hour)}
                                  className="text-xs px-3 py-1 bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
                                >
                                  {actionLoading === key ? "..." : "Sign Up"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* My Signups */}
        {tab === "signups" && (
          <div>
            {mySignups.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No active signups. Browse available slots to sign up.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(signupsBySlot).map(([slotId, sigs]) => {
                  const slot = sigs[0].slot;
                  return (
                    <div key={slotId} className="bg-white rounded-xl border border-stone-200 p-5">
                      <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${LANG_COLORS[slot.language]}`}>
                          {LANG_LABELS[slot.language]}
                        </span>
                        <span className="text-sm font-medium text-stone-800">{formatDate(slot.date)}</span>
                        <span className="text-sm text-stone-500">
                          {formatHour(slot.startTime)} – {formatHour(slot.endTime)}
                        </span>
                        <span className="text-sm text-stone-600">{slot.clinic.name}</span>
                        {slot.clinic.address && (
                          <span className="text-xs text-stone-400">{slot.clinic.address}</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {sigs
                          .sort((a, b) => a.subBlockHour - b.subBlockHour)
                          .map((sig) => (
                            <div
                              key={sig.id}
                              className="flex items-center justify-between px-3 py-2 rounded-md bg-stone-50"
                            >
                              <span className="text-xs text-stone-600">
                                {formatHour(sig.subBlockHour)} – {formatHour(sig.subBlockHour + 1)}
                              </span>
                              <button
                                disabled={actionLoading === sig.id}
                                onClick={() => cancelSignup(sig.id)}
                                className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Profile */}
        {tab === "profile" && profile && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Sessions Completed", value: profile.sessionsCompleted },
                { label: "Total Cancellations", value: profile.totalCancellations },
                { label: "No-Shows", value: profile.noShows },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border border-stone-200 p-5 text-center">
                  <p className="text-2xl font-semibold text-stone-800">{stat.value}</p>
                  <p className="text-xs text-stone-400 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Languages */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h3 className="text-sm font-medium text-stone-700 mb-4">Languages</h3>
              <div className="flex gap-3 flex-wrap mb-6">
                {Object.entries(LANG_LABELS).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => toggleLanguage(code)}
                    className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                      profileForm.languages.includes(code)
                        ? "border-stone-800 bg-stone-800 text-white"
                        : "border-stone-200 text-stone-600 hover:border-stone-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <h3 className="text-sm font-medium text-stone-700 mb-2">Background / Notes</h3>
              <textarea
                rows={3}
                placeholder="Any relevant background, certifications, or notes..."
                value={profileForm.backgroundInfo}
                onChange={(e) => setProfileForm({ ...profileForm, backgroundInfo: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
              />

              <button
                disabled={actionLoading === "profile"}
                onClick={saveProfile}
                className="mt-4 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
              >
                {actionLoading === "profile" ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
