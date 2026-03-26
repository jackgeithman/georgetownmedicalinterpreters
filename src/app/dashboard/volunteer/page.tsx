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
  signups: { subBlockHour: number; volunteerId: string; volunteer: { user: { name: string | null } } }[];
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
  hoursVolunteered: number;
};

type VolunteerNotifPrefs = {
  signupReceipt: boolean;
  cancellationReceipt: boolean;
  reminder24h: boolean;
  unfilledSlotAlert: boolean;
};

type Tab = "browse" | "signups" | "profile";

const LANG_LABELS: Record<string, string> = {
  ES: "Spanish",
  ZH: "Chinese",
  KO: "Korean",
};

const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-blue-50 text-blue-700",
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
  const [clinicFilter, setClinicFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [profileForm, setProfileForm] = useState<{ languages: string[] }>({ languages: [] });
  const [notifPrefs, setNotifPrefs] = useState<VolunteerNotifPrefs>({
    signupReceipt: true,
    cancellationReceipt: true,
    reminder24h: true,
    unfilledSlotAlert: false,
  });
  const [notifSaved, setNotifSaved] = useState(false);
  const [spamModal, setSpamModal] = useState<{ onProceed: () => void } | null>(null);

  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    const role = session?.user?.role;
    if (role && role !== "VOLUNTEER" && role !== "ADMIN" && role !== "SUPER_ADMIN") router.push("/dashboard");
  }, [status, session, router]);

  const fetchAll = useCallback(async () => {
    const [slotsRes, signupsRes, profileRes, notifRes] = await Promise.all([
      fetch("/api/volunteer/slots"),
      fetch("/api/volunteer/signups"),
      fetch("/api/volunteer/profile"),
      fetch("/api/volunteer/notif-prefs"),
    ]);
    if (slotsRes.ok) setBrowseSlots(await slotsRes.json());
    if (signupsRes.ok) setMySignups(await signupsRes.json());
    if (profileRes.ok) {
      const p = await profileRes.json();
      setProfile(p);
      setProfileForm({ languages: p.languages ?? [] });
    }
    if (notifRes.ok) setNotifPrefs(await notifRes.json());
    setLoading(false);
  }, []);

  const fetchBrowse = useCallback(async () => {
    const params = langFilter !== "ALL" ? `?language=${langFilter}` : "";
    const res = await fetch(`/api/volunteer/slots${params}`);
    if (res.ok) setBrowseSlots(await res.json());
  }, [langFilter]);

  useEffect(() => {
    const role = session?.user?.role;
    if (role === "VOLUNTEER" || role === "ADMIN" || role === "SUPER_ADMIN") fetchAll();
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

  const doCancel = async (id: string) => {
    setActionLoading(id);
    const res = await fetch(`/api/volunteer/signups/${id}`, { method: "DELETE" });
    if (res.ok) await fetchAll();
    setActionLoading(null);
  };

  const cancelSignup = (id: string, slotDate: string, subBlockHour: number) => {
    const shiftStart = new Date(slotDate.slice(0, 10) + "T" + String(subBlockHour).padStart(2, "0") + ":00:00");
    const hoursUntil = (shiftStart.getTime() - Date.now()) / (1000 * 60 * 60);
    const isWithin24h = hoursUntil >= 0 && hoursUntil <= 24;
    if (isWithin24h) {
      setSpamModal({
        onProceed: () => {
          setSpamModal(null);
          void doCancel(id);
        },
      });
      return;
    }
    void doCancel(id);
  };

  const saveProfile = async () => {
    setActionLoading("profile");
    const res = await fetch("/api/volunteer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languages: profileForm.languages }),
    });
    if (res.ok) setProfile(await res.json());
    setActionLoading(null);
  };

  const saveNotifPrefs = async (updated: VolunteerNotifPrefs) => {
    await fetch("/api/volunteer/notif-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setNotifPrefs(updated);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  const toggleNotif = (key: keyof VolunteerNotifPrefs) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    saveNotifPrefs(updated);
  };

  const toggleLanguage = (lang: string) => {
    const langs = profileForm.languages.includes(lang)
      ? profileForm.languages.filter((l) => l !== lang)
      : [...profileForm.languages, lang];
    setProfileForm({ languages: langs });
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
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
              <p className="text-xs text-stone-400">Volunteer Dashboard</p>
            </div>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              className="text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2 transition-colors"
            >
              Contact Us
            </a>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{session?.user?.email}</span>
            {isAdmin && (
              <button
                onClick={() => router.push("/dashboard/admin")}
                className="text-sm px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-md transition-colors"
              >
                Admin Dashboard
              </button>
            )}
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
        {tab === "browse" && (() => {
          const now = new Date();

          // A slot is past when its end time has passed (using local/browser time which matches ET for GMI)
          const slotEnd = (s: BrowseSlot) =>
            new Date(s.date.slice(0, 10) + "T" + String(s.endTime).padStart(2, "0") + ":00:00");

          const hasAvailability = (slot: BrowseSlot) =>
            Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i)
              .some((h) => slot.signups.filter((s) => s.subBlockHour === h).length < slot.interpreterCount);

          const uniqueClinics = Array.from(new Set(browseSlots.map((s) => s.clinic.name))).sort();

          const filtered = browseSlots.filter((s) => {
            if (availableOnly && !hasAvailability(s)) return false;
            if (clinicFilter !== "ALL" && s.clinic.name !== clinicFilter) return false;
            if (dateFrom && new Date(s.date.slice(0, 10) + "T12:00:00") < new Date(dateFrom + "T00:00:00")) return false;
            if (dateTo && new Date(s.date.slice(0, 10) + "T12:00:00") > new Date(dateTo + "T23:59:59")) return false;
            return true;
          });

          const upcoming = filtered.filter((s) => slotEnd(s) > now);
          const past = filtered.filter((s) => slotEnd(s) <= now)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          const renderSlot = (slot: BrowseSlot, isPast: boolean) => {
            const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
            return (
              <div key={slot.id} className={`bg-white rounded-xl border border-stone-200 p-5 ${isPast ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${LANG_COLORS[slot.language]}`}>
                      {LANG_LABELS[slot.language]}
                    </span>
                    <span className="text-sm font-medium text-stone-800">{formatDate(slot.date)}</span>
                    <span className="text-sm text-stone-500">
                      {formatHour(slot.startTime)} – {formatHour(slot.endTime)}
                    </span>
                    {isPast && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-400">Past</span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-stone-800">{slot.clinic.name}</p>
                    {slot.clinic.address && <p className="text-xs text-stone-400">{slot.clinic.address}</p>}
                  </div>
                </div>
                {slot.notes && <p className="text-xs text-stone-400 italic mb-3">{slot.notes}</p>}
                <div className="space-y-2">
                  {subBlocks.map((hour) => {
                    const hourSignups = slot.signups.filter((s) => s.subBlockHour === hour);
                    const filled = hourSignups.length;
                    const mySignupEntry = profile
                      ? mySignups.find((s) => s.slot.id === slot.id && s.subBlockHour === hour)
                      : undefined;
                    const isMine = !!mySignupEntry;
                    const isFull = filled >= slot.interpreterCount;
                    const key = `${slot.id}-${hour}`;
                    const signedUpNames = hourSignups.map((s) => s.volunteer.user.name ?? "Unknown");
                    return (
                      <div key={hour} className="flex items-center justify-between px-3 py-2 rounded-md bg-stone-50">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-stone-600 w-28">
                            {formatHour(hour)} – {formatHour(hour + 1)}
                          </span>
                          <div>
                            <span className="text-xs text-stone-400">{filled}/{slot.interpreterCount} filled</span>
                            {signedUpNames.length > 0 && (
                              <p className="text-xs text-stone-500">{signedUpNames.join(", ")}</p>
                            )}
                          </div>
                        </div>
                        {isPast ? (
                          <span className="text-xs px-2 py-1 bg-stone-100 text-stone-400 rounded-md">Past</span>
                        ) : isMine ? (
                          <button
                            disabled={actionLoading === mySignupEntry.id}
                            onClick={() => cancelSignup(mySignupEntry.id, slot.date, hour)}
                            className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600 border border-emerald-200 hover:border-red-200 rounded-md font-medium transition-colors disabled:opacity-50"
                            title="Click to cancel"
                          >
                            {actionLoading === mySignupEntry.id ? "..." : "Signed Up ✓"}
                          </button>
                        ) : isFull ? (
                          <span className="text-xs px-2 py-1 bg-stone-100 text-stone-400 rounded-md">Full</span>
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
          };

          return (
            <div>
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                {/* Language */}
                {["ALL", "ES", "ZH", "KO"].map((lang) => (
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

                <div className="w-px bg-stone-200 mx-1 self-stretch" />

                {/* Clinic */}
                <select
                  value={clinicFilter}
                  onChange={(e) => setClinicFilter(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-stone-200 rounded-md bg-white text-stone-600 focus:outline-none"
                >
                  <option value="ALL">All Clinics</option>
                  {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <div className="w-px bg-stone-200 mx-1 self-stretch" />

                {/* Date range */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-stone-400">From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-stone-200 rounded-md bg-white text-stone-600 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-stone-400">To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-stone-200 rounded-md bg-white text-stone-600 focus:outline-none"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-xs text-stone-400 hover:text-stone-600"
                  >
                    Clear
                  </button>
                )}

                <div className="w-px bg-stone-200 mx-1 self-stretch" />

                {/* Availability */}
                <button
                  onClick={() => setAvailableOnly(!availableOnly)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    availableOnly
                      ? "bg-emerald-700 text-white"
                      : "bg-white border border-stone-200 text-stone-500 hover:border-stone-300"
                  }`}
                >
                  Available Only
                </button>
              </div>

              {/* Upcoming */}
              {upcoming.length === 0 && past.length === 0 ? (
                <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                  <p className="text-stone-400">No slots match your filters.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcoming.map((slot) => renderSlot(slot, false))}

                  {past.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider pt-2">Past Slots</p>
                      {past.map((slot) => renderSlot(slot, true))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
                                onClick={() => cancelSignup(sig.id, sig.slot.date, sig.subBlockHour)}
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
            <div className="bg-white rounded-xl border border-stone-200 p-5 text-center w-48">
              <p className="text-2xl font-semibold text-stone-800">{profile.hoursVolunteered}</p>
              <p className="text-xs text-stone-400 mt-1">Hours Volunteered</p>
            </div>

            {/* Languages */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h3 className="text-sm font-medium text-stone-700 mb-1">Languages</h3>
              <p className="text-xs text-stone-400 mb-4">Click to select languages you can interpret. Filled = you speak it, white = you don&apos;t.</p>
              <div className="flex gap-3 flex-wrap mb-4">
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

              <button
                disabled={actionLoading === "profile"}
                onClick={saveProfile}
                className="mt-4 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
              >
                {actionLoading === "profile" ? "Saving..." : "Save Profile"}
              </button>
            </div>

            {/* Notification Preferences */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-stone-700">Email Notifications</h3>
                {notifSaved && <span className="text-xs text-emerald-600">Saved ✓</span>}
              </div>
              <p className="text-xs text-stone-400 mb-5">Toggles save instantly. We&apos;ll never send you more than you want.</p>

              <div className="space-y-1">
                {/* Recommended */}
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Recommended</p>

                {([
                  { key: "signupReceipt" as const, label: "Signup confirmation", desc: "Sent after you sign up (2 min delay so quick toggles don't flood your inbox)" },
                  { key: "cancellationReceipt" as const, label: "Cancellation receipt", desc: "Confirms when you cancel a shift" },
                  { key: "reminder24h" as const, label: "24-hour reminder", desc: "Email the day before your shift" },
                ] as const).map(({ key, label, desc }) => (
                  <label key={key} className="flex items-start gap-3 py-2.5 cursor-pointer group">
                    <button
                      role="switch"
                      aria-checked={notifPrefs[key]}
                      onClick={() => toggleNotif(key)}
                      className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                        notifPrefs[key] ? "bg-stone-800" : "bg-stone-200"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notifPrefs[key] ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                    <div>
                      <p className="text-sm text-stone-700">{label}</p>
                      <p className="text-xs text-stone-400">{desc}</p>
                    </div>
                  </label>
                ))}

                <div className="pt-3 border-t border-stone-100 mt-2">
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Optional</p>
                  <label className="flex items-start gap-3 py-2.5 cursor-pointer">
                    <button
                      role="switch"
                      aria-checked={notifPrefs.unfilledSlotAlert}
                      onClick={() => toggleNotif("unfilledSlotAlert")}
                      className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                        notifPrefs.unfilledSlotAlert ? "bg-stone-800" : "bg-stone-200"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notifPrefs.unfilledSlotAlert ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                    <div>
                      <p className="text-sm text-stone-700">Urgent: unfilled slot alerts</p>
                      <p className="text-xs text-stone-400">Notified immediately when a qualifying slot within 24 hrs has a last-minute opening due to a cancellation</p>
                    </div>
                  </label>
                </div>

                <div className="pt-3 border-t border-stone-100 mt-2">
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Always On</p>
                  <div className="space-y-1 text-xs text-stone-400 pl-1">
                    <p>• Removed from a shift by an admin</p>
                    <p>• Slot cancelled by a clinic</p>
                    <p>• Slot edited and your signup was dropped</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* 24h cancellation warning */}
      {spamModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <h3 className="text-sm font-semibold text-stone-800 mb-2">Heads up</h3>
            <p className="text-xs text-stone-500 mb-4">
              This shift is within 24 hours. Cancelling will send an urgent alert to the clinic. Please be considerate of their time.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSpamModal(null)}
                className="flex-1 px-4 py-2 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50"
              >
                Keep Signup
              </button>
              <button
                onClick={spamModal.onProceed}
                className="flex-1 px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
