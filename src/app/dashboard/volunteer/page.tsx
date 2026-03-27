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

function formatDateLong(s: string): string {
  const d = new Date(s.slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ── Shared layout components ──────────────────────────────────────────────────

function Topbar({ email, isAdmin, onAdmin }: { email?: string | null; isAdmin: boolean; onAdmin: () => void }) {
  return (
    <header style={{
      background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "9px",
          background: "linear-gradient(135deg,#2563EB,#60A5FA)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, color: "#fff", fontSize: "1rem",
        }}>G</div>
        <div>
          <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
          <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>Volunteer Dashboard</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {isAdmin && (
          <button
            onClick={onAdmin}
            style={{
              color: "#CBD5E1", fontSize: "0.8rem", textDecoration: "none",
              padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.15)",
              background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
            }}
          >
            Admin
          </button>
        )}
        <a
          href="mailto:georgetownmedicalinterpreters@gmail.com"
          style={{
            color: "#CBD5E1", fontSize: "0.8rem", textDecoration: "none",
            padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.15)",
            transition: "all .15s",
          }}
        >
          Contact Us
        </a>
        <span style={{ color: "#CBD5E1", fontSize: "0.82rem" }}>{email}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500,
            padding: "7px 16px", borderRadius: "8px", cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}

function Tabs({ active, onSelect, signupCount }: { active: Tab; onSelect: (t: Tab) => void; signupCount: number }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "browse", label: "Browse Slots" },
    { key: "signups", label: "My Signups" },
    { key: "profile", label: "Profile" },
  ];
  return (
    <div style={{
      display: "flex", gap: "4px", marginBottom: "28px",
      background: "var(--card-bg)", padding: "5px", borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,.08)", width: "fit-content",
      border: "1px solid var(--card-border)",
    }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          style={{
            padding: "9px 20px", borderRadius: "9px", fontSize: "0.9rem", fontWeight: 500,
            cursor: "pointer", border: "none", fontFamily: "inherit", transition: "all .15s",
            background: active === t.key ? "var(--blue)" : "none",
            color: active === t.key ? "#fff" : "var(--gray-600)",
            whiteSpace: "nowrap",
          }}
        >
          {t.label}
          {t.key === "signups" && signupCount > 0 && (
            <span style={{
              background: "#DC2626", color: "#fff", fontSize: "0.7rem", fontWeight: 700,
              padding: "1px 7px", borderRadius: "99px", marginLeft: "5px",
            }}>{signupCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Card / slot UI helpers ────────────────────────────────────────────────────

function SlotCard({ slot, mySignups, profile, isPast, actionLoading, onSignUp, onCancel }: {
  slot: BrowseSlot;
  mySignups: MySignup[];
  profile: VolunteerProfile | null;
  isPast: boolean;
  actionLoading: string | null;
  onSignUp: (slotId: string, hour: number) => void;
  onCancel: (id: string, slotHourKey: string) => void;
}) {
  const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
  const openCount = subBlocks.filter((h) => {
    const filled = slot.signups.filter((s) => s.subBlockHour === h).length;
    return filled < slot.interpreterCount;
  }).length;

  return (
    <div style={{
      background: "var(--card-bg)", borderRadius: "14px",
      border: "1.5px solid var(--card-border)", overflow: "hidden",
      marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)",
      opacity: isPast ? 0.45 : 1,
      pointerEvents: isPast ? "none" : "auto",
    }}>
      {/* Card header */}
      <div style={{
        padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)",
        display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
          <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-600)", marginTop: "3px" }}>{LANG_LABELS[slot.language]}</div>
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
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{slot.clinic.address}</span>
              </div>
            )}
          </div>
        </div>
        {isPast ? (
          <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase" }}>Past</span>
        ) : (
          <div style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.9rem", fontWeight: 700, padding: "9px 18px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.2 }}>
            {openCount} open
            <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, marginTop: "2px", opacity: 0.8 }}>slots</span>
          </div>
        )}
      </div>

      {/* Sub-block rows */}
      {subBlocks.map((hour, i) => {
        const hourSignups = slot.signups.filter((s) => s.subBlockHour === hour);
        const filled = hourSignups.length;
        const mySignupEntry = profile ? mySignups.find((s) => s.slot.id === slot.id && s.subBlockHour === hour) : undefined;
        const isMine = !!mySignupEntry;
        const isFull = filled >= slot.interpreterCount;
        const key = `${slot.id}-${hour}`;
        const isLast = i === subBlocks.length - 1;

        return (
          <div key={hour} style={{
            display: "flex", alignItems: "center", padding: "13px 22px",
            borderBottom: isLast ? "none" : "1px solid var(--card-border)", gap: "16px",
          }}>
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: isPast ? "var(--gray-400)" : "var(--green)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", minWidth: "145px" }}>
              {formatHour(hour)} – {formatHour(hour + 1)}
            </span>
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)", flex: 1 }}>
              {filled}/{slot.interpreterCount} filled
              {hourSignups.length > 0 && (
                <span style={{ color: "var(--gray-600)", marginLeft: "8px", fontStyle: "italic", fontSize: "0.82rem" }}>
                  {hourSignups.map((s) => s.volunteer.user.name ?? "Unknown").join(", ")}
                </span>
              )}
            </span>
            {!isPast && (
              isMine ? (
                <button
                  disabled={actionLoading === mySignupEntry.id}
                  onClick={() => onCancel(mySignupEntry.id, key)}
                  style={{
                    background: "var(--green-light)", color: "var(--green)",
                    border: "1px solid #86EFAC", borderRadius: "8px",
                    padding: "7px 18px", fontFamily: "inherit", fontSize: "0.875rem",
                    fontWeight: 600, cursor: "pointer", transition: "all .18s", whiteSpace: "nowrap",
                    opacity: actionLoading === mySignupEntry.id ? 0.5 : 1,
                  }}
                  title="Click to cancel"
                >
                  {actionLoading === mySignupEntry.id ? "…" : "Signed Up ✓"}
                </button>
              ) : isFull ? (
                <span style={{ fontSize: "0.82rem", color: "var(--gray-400)", padding: "7px 18px" }}>Full</span>
              ) : (
                <button
                  disabled={actionLoading === key}
                  onClick={() => onSignUp(slot.id, hour)}
                  style={{
                    background: "var(--blue)", color: "#fff", border: "none",
                    borderRadius: "8px", padding: "9px 22px", fontFamily: "inherit",
                    fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                    transition: "all .18s", whiteSpace: "nowrap",
                    opacity: actionLoading === key ? 0.5 : 1,
                  }}
                >
                  {actionLoading === key ? "…" : "Sign Up"}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [cancelCounts, setCancelCounts] = useState<Record<string, number>>({});
  const [spamModal, setSpamModal] = useState<{ onProceed: (() => void) | null; isBlocked: boolean } | null>(null);
  const [easterBg, setEasterBg] = useState("transparent");
  const [easterOpen, setEasterOpen] = useState(false);
  const [easterCount, setEasterCount] = useState(0);

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

  const doCancel = async (id: string, slotHourKey: string) => {
    setActionLoading(id);
    const res = await fetch(`/api/volunteer/signups/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCancelCounts((prev) => ({ ...prev, [slotHourKey]: (prev[slotHourKey] ?? 0) + 1 }));
      await fetchAll();
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading…</p>
      </div>
    );
  }

  // Group browse slots by date
  const now = new Date();
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
  const past = filtered.filter((s) => slotEnd(s) <= now).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group upcoming by date label
  const upcomingByDate: Record<string, BrowseSlot[]> = {};
  for (const s of upcoming) {
    const label = formatDateLong(s.date);
    if (!upcomingByDate[label]) upcomingByDate[label] = [];
    upcomingByDate[label].push(s);
  }

  // Group my signups by slot
  const signupsBySlot: Record<string, MySignup[]> = {};
  for (const s of mySignups) {
    if (!signupsBySlot[s.slot.id]) signupsBySlot[s.slot.id] = [];
    signupsBySlot[s.slot.id].push(s);
  }

  const slotProps = { mySignups, profile, actionLoading, onSignUp: signUp, onCancel: cancelSignup };

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)" }}>
      <Topbar email={session?.user?.email} isAdmin={isAdmin} onAdmin={() => router.push("/dashboard/admin")} />

      <main style={{ maxWidth: "920px", margin: "0 auto", padding: "36px 24px" }}>
        <Tabs active={tab} onSelect={setTab} signupCount={mySignups.length} />

        {/* ── Browse Slots ── */}
        {tab === "browse" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
              <select
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                style={{
                  padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500,
                  border: "1.5px solid var(--card-border)", background: "var(--card-bg)",
                  color: "var(--gray-900)", fontFamily: "inherit", cursor: "pointer", outline: "none",
                }}
              >
                <option value="ALL">All Languages</option>
                {Object.entries(LANG_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>

              <select
                value={clinicFilter}
                onChange={(e) => setClinicFilter(e.target.value)}
                style={{
                  padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500,
                  border: "1.5px solid var(--card-border)", background: "var(--card-bg)",
                  color: "var(--gray-900)", fontFamily: "inherit", cursor: "pointer", outline: "none",
                }}
              >
                <option value="ALL">All Clinics</option>
                {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "inherit", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }}
                />
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "inherit", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }}
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    style={{ background: "none", border: "none", color: "var(--gray-400)", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)", cursor: "pointer" }}>
                <div
                  onClick={() => setAvailableOnly(!availableOnly)}
                  style={{
                    width: "38px", height: "22px", borderRadius: "99px",
                    background: availableOnly ? "var(--blue)" : "var(--gray-200)",
                    position: "relative", cursor: "pointer", transition: "background .15s",
                  }}
                >
                  <div style={{
                    width: "16px", height: "16px", background: "#fff", borderRadius: "50%",
                    position: "absolute", top: "3px",
                    left: availableOnly ? "19px" : "3px", transition: "left .15s",
                  }} />
                </div>
                Available Only
              </label>
            </div>

            {/* Slot list */}
            {upcoming.length === 0 && past.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No slots match your filters.</p>
              </div>
            ) : (
              <>
                {Object.entries(upcomingByDate).map(([dateLabel, slots]) => (
                  <div key={dateLabel}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gray-600)", margin: "28px 0 12px" }}>{dateLabel}</div>
                    {slots.map((slot) => <SlotCard key={slot.id} slot={slot} isPast={false} {...slotProps} />)}
                  </div>
                ))}
                {past.length > 0 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "32px 0 16px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--gray-400)" }}>
                      <span style={{ flex: 1, height: "1px", background: "var(--card-border)" }} />
                      Past Slots
                      <span style={{ flex: 1, height: "1px", background: "var(--card-border)" }} />
                    </div>
                    {past.map((slot) => <SlotCard key={slot.id} slot={slot} isPast={true} {...slotProps} />)}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── My Signups ── */}
        {tab === "signups" && (
          <div>
            {mySignups.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No active signups. Browse available slots to sign up.</p>
              </div>
            ) : (
              Object.entries(signupsBySlot).map(([slotId, sigs]) => {
                const slot = sigs[0].slot;
                return (
                  <div key={slotId} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)" }}>
                      <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
                      <div style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginTop: "3px", fontWeight: 500 }}>{LANG_LABELS[slot.language]}</div>
                      <div style={{ display: "flex", gap: "24px", marginTop: "10px", flexWrap: "wrap" }}>
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
                            <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{slot.clinic.address}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {sigs.sort((a, b) => a.subBlockHour - b.subBlockHour).map((sig, i, arr) => (
                      <div key={sig.id} style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--card-border)", gap: "16px" }}>
                        <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", flex: 1 }}>
                          {formatHour(sig.subBlockHour)} – {formatHour(sig.subBlockHour + 1)}
                        </span>
                        <span style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.75rem", fontWeight: 700, padding: "4px 12px", borderRadius: "99px", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: "8px" }}>Upcoming</span>
                        <button
                          disabled={actionLoading === sig.id}
                          onClick={() => cancelSignup(sig.id, `${sig.slot.id}-${sig.subBlockHour}`)}
                          style={{ background: "transparent", border: "none", color: "var(--gray-400)", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer", padding: "4px 10px", borderRadius: "6px", transition: "all .15s" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Profile ── */}
        {tab === "profile" && profile && (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>
            {/* Left sidebar card */}
            <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
              <div style={{ background: "var(--navy)", padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#60A5FA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>
                  {(session?.user?.name ?? session?.user?.email ?? "?")[0].toUpperCase()}
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>{session?.user?.name ?? "Volunteer"}</div>
                <div style={{ color: "#CBD5E1", fontSize: "0.8rem", marginTop: "4px" }}>{session?.user?.email}</div>
              </div>
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--gray-600)" }}>Hours volunteered</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>{profile.hoursVolunteered}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--gray-600)" }}>Upcoming signups</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>{mySignups.length}</span>
                </div>
                <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-600)", marginBottom: "8px" }}>Languages</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {profile.languages.length === 0 ? (
                      <span style={{ fontSize: "0.82rem", color: "var(--gray-400)" }}>None set</span>
                    ) : profile.languages.map((l) => (
                      <span key={l} style={{ fontSize: "0.78rem", fontWeight: 600, padding: "4px 12px", borderRadius: "99px", background: "var(--gray-200)", color: "var(--gray-900)", border: "1px solid var(--card-border)" }}>
                        {LANG_LABELS[l] ?? l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right panels */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Languages panel */}
              <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                <div style={{ padding: "18px 24px", borderBottom: "1.5px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>Languages</h2>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "16px" }}>Select the languages you can interpret.</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
                    {Object.entries(LANG_LABELS).map(([code, label]) => (
                      <label key={code} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem", color: "var(--gray-900)" }}>
                        <input
                          type="checkbox"
                          checked={profileForm.languages.includes(code)}
                          onChange={() => toggleLanguage(code)}
                          style={{ accentColor: "var(--blue)", width: "16px", height: "16px", cursor: "pointer" }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      disabled={actionLoading === "profile"}
                      onClick={saveProfile}
                      style={{
                        background: "var(--blue)", color: "#fff", border: "none",
                        borderRadius: "9px", padding: "10px 28px", fontFamily: "inherit",
                        fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
                        opacity: actionLoading === "profile" ? 0.5 : 1,
                      }}
                    >
                      {actionLoading === "profile" ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Upcoming Signups panel */}
              <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                <div style={{ padding: "18px 24px", borderBottom: "1.5px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>Upcoming Signups</h2>
                  <span style={{ fontSize: "0.875rem", color: "var(--gray-600)", fontWeight: 500 }}>{mySignups.length} sessions</span>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  {mySignups.length === 0 ? (
                    <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>No upcoming signups.</p>
                  ) : (
                    mySignups.sort((a, b) => a.subBlockHour - b.subBlockHour).map((sig, i, arr) => (
                      <div key={sig.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--card-border)" }}>
                        <div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{sig.slot.clinic.name} · {LANG_LABELS[sig.slot.language]}</div>
                          <div style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginTop: "3px", fontWeight: 500 }}>
                            {formatDate(sig.slot.date)} · {formatHour(sig.subBlockHour)} – {formatHour(sig.subBlockHour + 1)}
                            {sig.slot.clinic.address && ` · ${sig.slot.clinic.address}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.75rem", fontWeight: 700, padding: "4px 12px", borderRadius: "99px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Upcoming</span>
                          <button
                            disabled={actionLoading === sig.id}
                            onClick={() => cancelSignup(sig.id, `${sig.slot.id}-${sig.subBlockHour}`)}
                            style={{ background: "transparent", border: "none", color: "var(--gray-400)", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer", padding: "4px 10px", borderRadius: "6px" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Notification Preferences */}
              <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                <div style={{ padding: "18px 24px", borderBottom: "1.5px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>Email Notifications</h2>
                  {notifSaved && <span style={{ fontSize: "0.8rem", color: "var(--green)" }}>Saved ✓</span>}
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "16px" }}>Toggles save instantly.</p>
                  {([
                    { key: "signupReceipt" as const, label: "Signup confirmation", desc: "Sent after you sign up" },
                    { key: "cancellationReceipt" as const, label: "Cancellation receipt", desc: "Confirms when you cancel a shift" },
                    { key: "reminder24h" as const, label: "24-hour reminder", desc: "Email the day before your shift" },
                    { key: "unfilledSlotAlert" as const, label: "Urgent: unfilled slot alerts", desc: "Notified when a slot within 24 hrs has a last-minute opening" },
                  ] as const).map(({ key, label, desc }) => (
                    <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: "12px", paddingBottom: "14px", marginBottom: "14px", borderBottom: "1px solid var(--card-border)", cursor: "pointer" }}>
                      <button
                        role="switch"
                        aria-checked={notifPrefs[key]}
                        onClick={() => toggleNotif(key)}
                        style={{
                          marginTop: "2px", position: "relative", display: "inline-flex",
                          height: "22px", width: "38px", flexShrink: 0, borderRadius: "99px",
                          border: "none", cursor: "pointer",
                          background: notifPrefs[key] ? "var(--blue)" : "var(--gray-200)",
                          transition: "background .15s",
                        }}
                      >
                        <span style={{
                          display: "inline-block", width: "16px", height: "16px",
                          borderRadius: "50%", background: "#fff",
                          position: "absolute", top: "3px",
                          left: notifPrefs[key] ? "19px" : "3px",
                          transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)",
                        }} />
                      </button>
                      <div>
                        <p style={{ fontSize: "0.9rem", color: "var(--gray-900)", fontWeight: 500 }}>{label}</p>
                        <p style={{ fontSize: "0.8rem", color: "var(--gray-600)", marginTop: "2px" }}>{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Easter egg */}
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={() => setEasterOpen(!easterOpen)}
                  style={{ background: "none", border: "none", color: "var(--card-border)", cursor: "pointer", fontSize: "0.9rem" }}
                  title="✨"
                >✦</button>
              </div>
              {easterOpen && (
                <div style={{ borderRadius: "14px", padding: "24px", textAlign: "center", background: easterBg === "transparent" ? "var(--card-bg)" : easterBg, border: "1.5px solid var(--card-border)", transition: "all .5s" }}>
                  <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "12px" }}>
                    {easterCount === 0 ? "You found it 🎉" : easterCount < 5 ? "Keep going…" : easterCount < 10 ? "Ooh pretty 🌈" : easterCount < 20 ? "Still going? Respect." : "You absolute legend 🏆"}
                  </p>
                  <button
                    onClick={() => {
                      const colors = ["#fde68a","#bbf7d0","#bfdbfe","#fbcfe8","#ddd6fe","#fed7aa","#99f6e4","#fca5a5","#c4b5fd","#6ee7b7","#f9a8d4","#93c5fd"];
                      setEasterBg(colors[Math.floor(Math.random() * colors.length)]);
                      setEasterCount((n) => n + 1);
                    }}
                    style={{ width: "80px", height: "80px", borderRadius: "50%", border: "4px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,.15)", cursor: "pointer", background: easterBg === "transparent" ? "#e7e5e4" : easterBg, transition: "all .3s" }}
                    title="Click me!"
                  />
                  <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "12px" }}>clicks: {easterCount}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Anti-spam modal */}
      {spamModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", width: "100%", maxWidth: "360px", padding: "28px 24px", textAlign: "center" }}>
            {spamModal.isBlocked ? (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🎨</div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--navy)", marginBottom: "8px" }}>Looks like you enjoy clicking!</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "20px" }}>You&apos;ve cancelled this shift too many times. We made something for you to click instead.</p>
                <button onClick={() => { setSpamModal(null); setTab("profile"); setEasterOpen(true); }} style={{ width: "100%", padding: "12px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", marginBottom: "8px" }}>
                  Take me there →
                </button>
                <button onClick={() => setSpamModal(null)} style={{ background: "none", border: "none", color: "var(--gray-400)", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer" }}>Dismiss</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--navy)", marginBottom: "8px" }}>Heads up</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "20px" }}>Cancelling within 24 hours sends an urgent alert to the clinic. Are you sure?</p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setSpamModal(null)} style={{ flex: 1, padding: "10px", background: "none", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "inherit", fontSize: "0.875rem", color: "var(--gray-600)", cursor: "pointer" }}>
                    Keep Signup
                  </button>
                  <button onClick={spamModal.onProceed ?? (() => setSpamModal(null))} style={{ flex: 1, padding: "10px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                    Yes, Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
