"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { langName } from "@/lib/languages";

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
  slot: { id: string; language: string; date: string; startTime: number; endTime: number; clinic: { name: string; address: string } };
};

type AdminSlot = {
  id: string;
  language: string;
  date: string;
  startTime: number;
  endTime: number;
  interpreterCount: number;
  notes: string | null;
  clinic: { name: string; address: string };
  signups: {
    id: string;
    subBlockHour: number;
    volunteer: { id: string; user: { name: string | null; email: string } };
  }[];
};

type VolunteerProfile = {
  id: string;
  languages: string[];
};

type AdminProfile = {
  id: string;
  languages: string[];
};

type LanguageConfig = { id: string; code: string; name: string; isActive: boolean };


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

export default function BrowsePage() {
  const { data: session } = useSession();
  const [browseSlots, setBrowseSlots] = useState<BrowseSlot[]>([]);
  const [adminSlots, setAdminSlots] = useState<AdminSlot[]>([]);
  const [mySignups, setMySignups] = useState<MySignup[]>([]);
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<string>("ALL");
  const [clinicFilter, setClinicFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; name: string }[]>([]);
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  // Admin-only: slot selection for deletion
  const [adminSelectedSlotIds, setAdminSelectedSlotIds] = useState<Set<string>>(new Set());
  const [adminDeleteModal, setAdminDeleteModal] = useState<boolean>(false);
  const [adminDeleteInput, setAdminDeleteInput] = useState("");
  // Admin-only: assign volunteer
  const [volunteerAssignTarget, setVolunteerAssignTarget] = useState<{
    slotId: string; hour: number; language: string; date: string; clinicName: string;
  } | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSelected, setAssignSelected] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: string; status: string; roles: string[]; volunteer?: { languages: string[] } | null }[]>([]);
  // Language "Other" dropdown open state + click-away refs
  const [otherDropdownOpen, setOtherDropdownOpen] = useState(false);
  const [adminOtherDropdownOpen, setAdminOtherDropdownOpen] = useState(false);
  const otherDropdownRef = useRef<HTMLDivElement>(null);
  const adminOtherDropdownRef = useRef<HTMLDivElement>(null);
  // Anti-spam cancel tracking
  const [cancelCounts, setCancelCounts] = useState<Record<string, number>>({});
  const [spamModal, setSpamModal] = useState<{ onProceed: (() => void) | null; isBlocked: boolean } | null>(null);
  const [removeVolunteerConfirm, setRemoveVolunteerConfirm] = useState<{ signupId: string } | null>(null);
  const [removeVolunteerError, setRemoveVolunteerError] = useState<string | null>(null);

  const role = session?.user?.role;
  const roles = session?.user?.roles ?? [];
  const isAdmin = role === "ADMIN";
  const isDev = roles.includes("DEV");
  const isAdminView = isAdmin || isDev;

  const fetchBrowseData = useCallback(async () => {
    if (isAdminView) {
      const [slotsRes, profileRes, usersRes, langsRes] = await Promise.all([
        fetch("/api/admin/slots"),
        fetch("/api/volunteer/profile"),
        fetch("/api/admin/users"),
        fetch("/api/admin/languages"),
      ]);
      if (slotsRes.ok) setAdminSlots(await slotsRes.json());
      if (profileRes.ok) {
        const p = await profileRes.json();
        setAdminProfile(p);
      }
      if (usersRes.ok) setUsers(await usersRes.json());
      if (langsRes.ok) setLanguages(await langsRes.json());
    } else {
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
      }
      fetch("/api/languages")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAvailableLanguages(data); })
        .catch(() => {});
    }
    setLoading(false);
  }, [isAdminView]);

  useEffect(() => {
    if (role) {
      fetchBrowseData();
    }
  }, [role, fetchBrowseData]);

  const fetchBrowseFilter = useCallback(async () => {
    if (!isAdminView) {
      const params = langFilter !== "ALL" ? `?language=${langFilter}` : "";
      const res = await fetch(`/api/volunteer/slots${params}`);
      if (res.ok) setBrowseSlots(await res.json());
    }
  }, [langFilter, isAdminView]);

  useEffect(() => {
    if (profile) fetchBrowseFilter();
  }, [langFilter, fetchBrowseFilter, profile]);

  // Close "Other languages" dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (otherDropdownRef.current && !otherDropdownRef.current.contains(e.target as Node)) {
        setOtherDropdownOpen(false);
      }
      if (adminOtherDropdownRef.current && !adminOtherDropdownRef.current.contains(e.target as Node)) {
        setAdminOtherDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Volunteer sign up
  const signUp = async (slotId: string, subBlockHour: number) => {
    const key = `${slotId}-${subBlockHour}`;
    setActionLoading(key);
    const res = await fetch("/api/volunteer/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, subBlockHour }),
    });
    if (res.ok) {
      await fetchBrowseData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Could not sign up.");
    }
    setActionLoading(null);
  };

  const doCancel = async (id: string, slotHourKey: string) => {
    setActionLoading(id);
    const res = await fetch(`/api/volunteer/signups/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCancelCounts((prev) => ({ ...prev, [slotHourKey]: (prev[slotHourKey] ?? 0) + 1 }));
      await fetchBrowseData();
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

  // Admin: cancel my own signup
  const cancelMySignup = async (signupId: string) => {
    setActionLoading(signupId);
    const res = await fetch(`/api/volunteer/signups/${signupId}`, { method: "DELETE" });
    if (res.ok) await fetchBrowseData();
    setActionLoading(null);
  };

  // Admin: remove volunteer from slot
  const removeVolunteer = (signupId: string) => {
    setRemoveVolunteerConfirm({ signupId });
  };

  const confirmRemoveVolunteer = async (signupId: string) => {
    setRemoveVolunteerConfirm(null);
    setRemoveVolunteerError(null);
    setActionLoading(signupId);
    try {
      const res = await fetch(`/api/admin/signups/${signupId}`, { method: "DELETE" });
      if (res.ok) {
        // Optimistically remove signup from local state immediately, then refresh
        setAdminSlots((prev) => prev.map((slot) => ({
          ...slot,
          signups: slot.signups.filter((s) => s.id !== signupId),
        })));
        void fetchBrowseData();
      } else {
        const data = await res.json().catch(() => ({}));
        setRemoveVolunteerError((data as { error?: string }).error ?? `Failed to remove volunteer (${res.status}). Please try again.`);
      }
    } catch {
      setRemoveVolunteerError("Network error — please check your connection and try again.");
    } finally {
      setActionLoading(null);
    }
  };

  // Admin: assign volunteer
  const assignVolunteer = async () => {
    if (!volunteerAssignTarget || !assignSelected) return;
    setAssignLoading(true);
    setAssignError("");
    const res = await fetch("/api/admin/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: volunteerAssignTarget.slotId,
        subBlockHour: volunteerAssignTarget.hour,
        userId: assignSelected.userId,
      }),
    });
    if (res.ok) {
      await fetchBrowseData();
      setVolunteerAssignTarget(null);
      setAssignSelected(null);
      setAssignSearch("");
      setAssignError("");
    } else {
      const err = await res.json().catch(() => ({}));
      setAssignError(err.error ?? "Could not assign volunteer.");
    }
    setAssignLoading(false);
  };

  const closeAssignModal = () => {
    setVolunteerAssignTarget(null);
    setAssignSelected(null);
    setAssignSearch("");
    setAssignError("");
  };

  const toggleSelectAdminSlot = (slotId: string) => {
    setAdminSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const confirmAdminDeleteSlots = async () => {
    setActionLoading("admin-batch-delete");
    const now = new Date();
    const slotEndFn = (s: AdminSlot) =>
      new Date(s.date.slice(0, 10) + "T" + String(s.endTime).padStart(2, "0") + ":00:00");
    const selectedSlots = adminSlots.filter((s) => adminSelectedSlotIds.has(s.id) && slotEndFn(s) > now);
    for (const slot of selectedSlots) {
      await fetch(`/api/admin/slots/${slot.id}`, { method: "DELETE" });
    }
    setAdminSelectedSlotIds(new Set());
    setAdminDeleteModal(false);
    setAdminDeleteInput("");
    await fetchBrowseData();
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading...</p>
      </div>
    );
  }

  const now = new Date();

  // ——— Admin view ———
  if (isAdminView) {
    const slotEnd = (s: AdminSlot) =>
      new Date(s.date.slice(0, 10) + "T" + String(s.endTime).padStart(2, "0") + ":00:00");

    const filteredAdminSlots = adminSlots.filter((s) => {
      if (langFilter !== "ALL" && s.language !== langFilter) return false;
      if (clinicFilter !== "ALL" && s.clinic.name !== clinicFilter) return false;
      if (dateFrom && new Date(s.date.slice(0, 10) + "T12:00:00") < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && new Date(s.date.slice(0, 10) + "T12:00:00") > new Date(dateTo + "T23:59:59")) return false;
      if (availableOnly) {
        const hasOpen = Array.from({ length: s.endTime - s.startTime }, (_, i) => s.startTime + i)
          .some((h) => s.signups.filter((sg) => sg.subBlockHour === h).length < s.interpreterCount);
        if (!hasOpen) return false;
      }
      return true;
    });

    const uniqueClinics = Array.from(new Set(adminSlots.map((s) => s.clinic.name))).sort();
    const upcomingAdminSlots = filteredAdminSlots.filter((s) => slotEnd(s) > now);
    const pastAdminSlots = filteredAdminSlots.filter((s) => slotEnd(s) <= now)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute fill stats from upcoming admin slots (before any language filter)
    const adminLangStats: Record<string, { filled: number; total: number }> = {};
    for (const s of adminSlots.filter((s) => slotEnd(s) > now)) {
      const key = s.language;
      adminLangStats[key] = {
        filled: (adminLangStats[key]?.filled ?? 0) + s.signups.length,
        total: (adminLangStats[key]?.total ?? 0) + (s.endTime - s.startTime) * s.interpreterCount,
      };
    }
    const adminStatLabel = (code: string) => {
      const st = adminLangStats[code];
      if (!st || st.total === 0) return " · No slots posted";
      const open = st.total - st.filled;
      if (open <= 0) return ` · Full — ${st.total} posted`;
      return ` · ${open} of ${st.total} open`;
    };
    const adminSpanishLang = languages.find((l) => l.isActive && /\bspanish\b/i.test(l.name));
    const adminMandarinLang = languages.find((l) => l.isActive && /\b(mandarin|chinese)\b/i.test(l.name));
    const adminFixedLangs: { code: string; label: string }[] = [
      { code: "ALL", label: "All Languages" },
      ...(adminSpanishLang ? [{ code: adminSpanishLang.code, label: `Spanish${adminStatLabel(adminSpanishLang.code)}` }] : []),
      ...(adminMandarinLang ? [{ code: adminMandarinLang.code, label: `Mandarin${adminStatLabel(adminMandarinLang.code)}` }] : []),
    ];
    const adminFixedCodes = adminFixedLangs.map((l) => l.code);
    const adminOtherLangs = languages
      .filter((l) => l.isActive && !adminFixedCodes.includes(l.code))
      .sort((a, b) => a.name.localeCompare(b.name));
    const adminOtherSelected = langFilter !== "ALL" && !adminFixedCodes.includes(langFilter);

    const selectedSlots = upcomingAdminSlots.filter((s) => adminSelectedSlotIds.has(s.id));
    const deleteConfirmText = selectedSlots.length === 1
      ? `${selectedSlots[0].clinic.name} ${selectedSlots[0].date.slice(0, 10)}`
      : "DELETE";
    const deleteInputValid = adminDeleteInput.trim() === deleteConfirmText;
    const canSignUp = (lang: string) => adminProfile?.languages.includes(lang) ?? false;

    const renderAdminSlot = (slot: AdminSlot, isPast: boolean) => {
      const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
      const openCount = subBlocks.filter((h) => slot.signups.filter((s) => s.subBlockHour === h).length < slot.interpreterCount).length;

      return (
        <div key={slot.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.5 : 1 }}>
          <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {!isPast && (
                  <input
                    type="checkbox"
                    checked={adminSelectedSlotIds.has(slot.id)}
                    onChange={() => toggleSelectAdminSlot(slot.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--navy)", flexShrink: 0 }}
                  />
                )}
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111827", marginTop: "3px" }}>{langName(slot.language)}</div>
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
            {isPast ? (
              <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase" }}>Past</span>
            ) : (
              <div style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.9rem", fontWeight: 700, padding: "9px 18px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.2 }}>
                {openCount} open
                <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, marginTop: "2px", opacity: 0.8 }}>slots</span>
              </div>
            )}
          </div>
          {slot.notes && (
            <div style={{ padding: "8px 22px", fontSize: "0.82rem", color: "#111827", fontStyle: "italic", borderBottom: "1px solid var(--card-border)" }}>
              {slot.notes}
            </div>
          )}
          {subBlocks.map((hour) => {
            const hoursSignups = slot.signups.filter((s) => s.subBlockHour === hour);
            const mySignup = adminProfile ? hoursSignups.find((s) => s.volunteer.id === adminProfile.id) : null;
            const otherSignups = hoursSignups.filter((s) => s.volunteer.id !== adminProfile?.id);
            const filled = hoursSignups.length;
            const isFull = filled >= slot.interpreterCount;
            const signupKey = `signup-${slot.id}-${hour}`;
            const langCanSignUp = canSignUp(slot.language);
            return (
              <div key={hour}>
                <div style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: "1px solid var(--card-border)", gap: "16px" }}>
                  <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: isPast ? "var(--gray-400)" : "var(--green)", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", minWidth: "145px" }}>
                    {formatHour(hour)} – {formatHour(hour + 1)}
                  </span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)", flex: 1 }}>
                    {filled}/{slot.interpreterCount} filled
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {!isPast && (
                      <button
                        onClick={() => {
                          setVolunteerAssignTarget({ slotId: slot.id, hour, language: slot.language, date: slot.date, clinicName: slot.clinic.name });
                          setAssignSearch("");
                          setAssignSelected(null);
                          setAssignError("");
                        }}
                        style={{ fontSize: "0.75rem", padding: "4px 10px", background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                      >Assign</button>
                    )}
                    {isPast ? (
                      <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--gray-200)", color: "var(--gray-600)", borderRadius: "6px" }}>Past</span>
                    ) : mySignup ? (
                      <button
                        disabled={actionLoading === mySignup.id}
                        onClick={() => cancelMySignup(mySignup.id)}
                        style={{ fontSize: "0.75rem", padding: "6px 14px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: actionLoading === mySignup.id ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                        title="Click to cancel"
                      >
                        {actionLoading === mySignup.id ? "..." : "Signed Up ✓"}
                      </button>
                    ) : isFull ? (
                      <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--gray-200)", color: "var(--gray-400)", borderRadius: "6px" }}>Full</span>
                    ) : !langCanSignUp ? (
                      <button
                        disabled
                        title="You are not cleared for this language"
                        style={{ background: "#fff", color: "#9CA3AF", border: "1.5px solid #D1D5DB", borderRadius: "8px", padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "not-allowed", whiteSpace: "nowrap" }}
                      >
                        Not Cleared
                      </button>
                    ) : (
                      <button
                        disabled={actionLoading === signupKey}
                        onClick={() => signUp(slot.id, hour)}
                        style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", opacity: actionLoading === signupKey ? 0.4 : 1, whiteSpace: "nowrap" }}
                      >
                        {actionLoading === signupKey ? "..." : "Sign Up"}
                      </button>
                    )}
                  </div>
                </div>
                {otherSignups.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 22px 8px 48px", borderBottom: "1px solid var(--card-border)", background: "rgba(0,0,0,.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.78rem", color: "#111827" }}>{s.volunteer.user.name ?? s.volunteer.user.email}</span>
                      <span style={{ fontSize: "0.78rem", color: "#111827" }}>{s.volunteer.user.email}</span>
                    </div>
                    {!isPast && (
                      <button
                        disabled={actionLoading === s.id}
                        onClick={() => removeVolunteer(s.id)}
                        style={{ fontSize: "0.72rem", padding: "2px 8px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: "4px", cursor: "pointer", opacity: actionLoading === s.id ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                      >Remove</button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div>
        {adminSelectedSlotIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px" }}>
            <span style={{ fontSize: "0.875rem", color: "#B91C1C", fontWeight: 600 }}>{adminSelectedSlotIds.size} slot{adminSelectedSlotIds.size !== 1 ? "s" : ""} selected</span>
            <button
              onClick={() => { setAdminDeleteInput(""); setAdminDeleteModal(true); }}
              style={{ padding: "6px 14px", fontSize: "0.75rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >Delete Selected</button>
            <button
              onClick={() => setAdminSelectedSlotIds(new Set())}
              style={{ fontSize: "0.75rem", color: "#EF4444", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >Clear selection</button>
          </div>
        )}
        {!adminProfile?.languages.length && (
          <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", fontSize: "0.875rem", color: "#92400E" }}>
            To sign up for slots, add your languages in <a href="/dashboard/profile" style={{ textDecoration: "underline", fontWeight: 600, color: "#92400E" }}>My Profile</a>.
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
          {adminFixedLangs.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { setLangFilter(langFilter === lang.code && lang.code !== "ALL" ? "ALL" : lang.code); setAdminOtherDropdownOpen(false); }}
              style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: langFilter === lang.code ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", background: langFilter === lang.code ? "var(--blue)" : "var(--card-bg)", color: langFilter === lang.code ? "#fff" : "#111827" }}
            >{lang.label}</button>
          ))}
          {adminOtherLangs.length > 0 && (
            <div ref={adminOtherDropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setAdminOtherDropdownOpen((o) => !o)}
                style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: adminOtherSelected ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", background: adminOtherSelected ? "var(--blue)" : "var(--card-bg)", color: adminOtherSelected ? "#fff" : "#111827", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {adminOtherSelected ? (languages.find((l) => l.code === langFilter)?.name ?? langFilter) : "Other languages…"}
                <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>{adminOtherDropdownOpen ? "▲" : "▼"}</span>
              </button>
              {adminOtherDropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,.10)", minWidth: "200px", maxHeight: "260px", overflowY: "auto" }}>
                  {adminOtherSelected && (
                    <button
                      onClick={() => { setLangFilter("ALL"); setAdminOtherDropdownOpen(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "0.875rem", background: "none", border: "none", borderBottom: "1px solid var(--card-border)", cursor: "pointer", color: "#111827", fontFamily: "'DM Sans', sans-serif" }}
                    >Clear filter</button>
                  )}
                  {adminOtherLangs.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLangFilter(l.code); setAdminOtherDropdownOpen(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "0.875rem", background: langFilter === l.code ? "var(--blue)" : "none", color: langFilter === l.code ? "#fff" : "#111827", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >{l.name}{adminStatLabel(l.code)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />
          <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", outline: "none" }}>
            <option value="ALL">All Clinics</option>
            {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ fontSize: "0.8rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear</button>
          )}
          <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />
          <button
            onClick={() => setAvailableOnly(!availableOnly)}
            style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: availableOnly ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)", background: availableOnly ? "var(--green)" : "var(--card-bg)", color: availableOnly ? "#fff" : "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >Available Only</button>
        </div>

        {upcomingAdminSlots.length === 0 && pastAdminSlots.length === 0 ? (
          <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
            <p style={{ color: "var(--gray-400)" }}>No slots match your filters.</p>
          </div>
        ) : (
          <div>
            {upcomingAdminSlots.map((slot) => renderAdminSlot(slot, false))}
            {pastAdminSlots.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "32px 0 16px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--gray-400)" }}>
                  <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                  Past Slots
                  <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                </div>
                {pastAdminSlots.map((slot) => renderAdminSlot(slot, true))}
              </>
            )}
          </div>
        )}

        {/* Admin Delete Modal */}
        {adminDeleteModal && (() => {
          const selectedSlotsList = upcomingAdminSlots.filter((s) => adminSelectedSlotIds.has(s.id));
          const isSingle = selectedSlotsList.length === 1;
          const confirmText = isSingle
            ? `${selectedSlotsList[0].clinic.name} ${selectedSlotsList[0].date.slice(0, 10)}`
            : "DELETE";
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
              <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "440px" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>Delete {selectedSlotsList.length} Slot{selectedSlotsList.length !== 1 ? "s" : ""}</h3>
                  <p style={{ fontSize: "0.75rem", color: "#111827", marginTop: "2px" }}>This will cancel the slot and notify any signed-up volunteers.</p>
                </div>
                <div style={{ padding: "16px 24px" }}>
                  <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "16px" }}>
                    {selectedSlotsList.map((s) => (
                      <div key={s.id} style={{ fontSize: "0.78rem", color: "#111827", padding: "4px 0", borderBottom: "1px solid var(--card-border)" }}>
                        <span style={{ fontWeight: 600 }}>{s.clinic.name}</span> · {formatDate(s.date)} · {formatHour(s.startTime)}–{formatHour(s.endTime)} · {langName(s.language)}
                        {s.signups.length > 0 && (
                          <span style={{ marginLeft: "4px", color: "#D97706" }}>({s.signups.length} volunteer{s.signups.length !== 1 ? "s" : ""} affected)</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
                    <p style={{ fontSize: "0.78rem", color: "#92400E" }}>
                      {isSingle ? <>To confirm, type the clinic name and date: <strong>{confirmText}</strong></> : <>To confirm, type: <strong>DELETE</strong></>}
                    </p>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    placeholder={confirmText}
                    value={adminDeleteInput}
                    onChange={(e) => setAdminDeleteInput(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: "16px", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => { setAdminDeleteModal(false); setAdminDeleteInput(""); }}
                      style={{ flex: 1, padding: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >Cancel</button>
                    <button
                      disabled={!deleteInputValid || actionLoading === "admin-batch-delete"}
                      onClick={confirmAdminDeleteSlots}
                      style={{ flex: 1, padding: "9px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", opacity: (!deleteInputValid || actionLoading === "admin-batch-delete") ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
                    >
                      {actionLoading === "admin-batch-delete" ? "Deleting..." : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Assign Volunteer Modal */}
        {volunteerAssignTarget && (() => {
          const reqLang = volunteerAssignTarget.language;
          const activeVolunteers = users.filter(
            (u) =>
              (u.role === "VOLUNTEER" || u.role === "ADMIN") &&
              u.status === "ACTIVE" &&
              (u.roles ?? []).some((r) => r === `LANG_${reqLang}` || r === `LANG_${reqLang}_CLEARED`)
          );
          const searchLower = assignSearch.toLowerCase();
          const filtered = activeVolunteers.filter(
            (u) =>
              (u.name?.toLowerCase().includes(searchLower) ?? false) ||
              u.email.toLowerCase().includes(searchLower)
          );
          const targetSlot = adminSlots.find((s) => s.id === volunteerAssignTarget.slotId);
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
              <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "440px" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>Assign a Volunteer</h3>
                  <p style={{ fontSize: "0.75rem", color: "#111827", marginTop: "2px" }}>
                    {langName(volunteerAssignTarget.language)} &middot; {formatDate(volunteerAssignTarget.date)} &middot; {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)} &middot; {volunteerAssignTarget.clinicName}
                  </p>
                </div>
                {!assignSelected ? (
                  <div style={{ padding: "16px 24px" }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search by name or email..."
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: "10px", boxSizing: "border-box" }}
                    />
                    <div style={{ maxHeight: "256px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {filtered.length === 0 && (
                        <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", textAlign: "center", padding: "24px 0" }}>No volunteers found.</p>
                      )}
                      {filtered.map((u) => {
                        const alreadySigned = targetSlot?.signups.some(
                          (sg) => sg.subBlockHour === volunteerAssignTarget.hour && sg.volunteer.user.email === u.email
                        );
                        return (
                          <button
                            key={u.id}
                            disabled={!!alreadySigned}
                            onClick={() => setAssignSelected({ userId: u.id, name: u.name ?? u.email, email: u.email })}
                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "9px", border: "1.5px solid transparent", background: "none", cursor: alreadySigned ? "not-allowed" : "pointer", opacity: alreadySigned ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name ?? "—"}</p>
                                <p style={{ fontSize: "0.72rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                              </div>
                              {alreadySigned && <span style={{ fontSize: "0.72rem", padding: "2px 8px", background: "#DCFCE7", color: "#15803D", borderRadius: "99px" }}>Signed up</span>}
                              {u.volunteer?.languages?.map((l) => (
                                <span key={l} className={`text-xs px-1.5 py-0.5 rounded-full ${LANG_COLORS[l] ?? "bg-gray-100 text-gray-500"}`}>
                                  {langName(l)}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={closeAssignModal} style={{ marginTop: "16px", fontSize: "0.75rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ padding: "16px 24px" }}>
                    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
                      <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#92400E", marginBottom: "6px" }}>Confirm Assignment</p>
                      <p style={{ fontSize: "0.875rem", color: "#78350F" }}>Assign <strong>{assignSelected.name}</strong> to this shift?</p>
                      <p style={{ fontSize: "0.75rem", color: "#92400E", marginTop: "2px" }}>{assignSelected.email}</p>
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #FDE68A", fontSize: "0.75rem", color: "#92400E", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <p>{langName(volunteerAssignTarget.language)} · {volunteerAssignTarget.clinicName}</p>
                        <p>{formatDate(volunteerAssignTarget.date)} · {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)}</p>
                        <p style={{ marginTop: "4px", color: "#D97706" }}>They will receive a calendar invite.</p>
                      </div>
                    </div>
                    {assignError && <p style={{ fontSize: "0.75rem", color: "#DC2626", marginBottom: "12px" }}>{assignError}</p>}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => { setAssignSelected(null); setAssignError(""); }} style={{ flex: 1, padding: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
                      <button disabled={assignLoading} onClick={assignVolunteer} style={{ flex: 1, padding: "9px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, opacity: assignLoading ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}>
                        {assignLoading ? "Assigning..." : "Confirm Assignment"}
                      </button>
                    </div>
                    <button onClick={closeAssignModal} style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ——— Volunteer view ———
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

  // Compute fill stats from upcoming slots only (before any language filter)
  const langStats: Record<string, { filled: number; total: number }> = {};
  for (const s of browseSlots.filter((s) => slotEnd(s) > now)) {
    const key = s.language;
    langStats[key] = {
      filled: (langStats[key]?.filled ?? 0) + s.signups.length,
      total: (langStats[key]?.total ?? 0) + (s.endTime - s.startTime) * s.interpreterCount,
    };
  }
  const statLabel = (code: string) => {
    const s = langStats[code];
    if (!s || s.total === 0) return " · No slots posted";
    const open = s.total - s.filled;
    if (open <= 0) return ` · Full — ${s.total} posted`;
    return ` · ${open} of ${s.total} open`;
  };

  // Dynamically resolve Spanish and Mandarin by name so the code works regardless
  // of whatever short code was auto-generated in the database
  const spanishLang = availableLanguages.find((l) => /\bspanish\b/i.test(l.name));
  const mandarinLang = availableLanguages.find((l) => /\b(mandarin|chinese)\b/i.test(l.name));
  const fixedLangs: { code: string; label: string }[] = [
    { code: "ALL", label: "All Languages" },
    ...(spanishLang ? [{ code: spanishLang.code, label: `Spanish${statLabel(spanishLang.code)}` }] : []),
    ...(mandarinLang ? [{ code: mandarinLang.code, label: `Mandarin${statLabel(mandarinLang.code)}` }] : []),
  ];
  const fixedCodes = fixedLangs.map((l) => l.code);
  // Other languages: all active languages not in the fixed set, sorted alphabetically
  const otherLangs = availableLanguages
    .filter((l) => !fixedCodes.includes(l.code))
    .sort((a, b) => a.name.localeCompare(b.name));
  const otherSelected = langFilter !== "ALL" && !fixedCodes.includes(langFilter);

  const renderVolunteerSlot = (slot: BrowseSlot, isPast: boolean) => {
    const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
    return (
      <div key={slot.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.5 : 1 }}>
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
          {isPast ? (
            <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase" }}>Past</span>
          ) : (
            <div style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.9rem", fontWeight: 700, padding: "9px 18px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.2 }}>
              {Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i)
                .filter((h) => slot.signups.filter((s) => s.subBlockHour === h).length < slot.interpreterCount).length} open
              <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, marginTop: "2px", opacity: 0.8 }}>slots</span>
            </div>
          )}
        </div>
        {slot.notes && (
          <div style={{ padding: "8px 22px", fontSize: "0.82rem", color: "#111827", fontStyle: "italic", borderBottom: "1px solid var(--card-border)" }}>
            {slot.notes}
          </div>
        )}
        {subBlocks.map((hour) => {
          const hourSignups = slot.signups.filter((s) => s.subBlockHour === hour);
          const filled = hourSignups.length;
          const mySignupEntry = profile
            ? mySignups.find((s) => s.slot.id === slot.id && s.subBlockHour === hour)
            : undefined;
          const isMine = !!mySignupEntry;
          const isFull = filled >= slot.interpreterCount;
          const key = `${slot.id}-${hour}`;
          return (
            <div key={hour} style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: "1px solid var(--card-border)", gap: "16px" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: isPast ? "var(--gray-400)" : "var(--green)", flexShrink: 0 }} />
              <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", minWidth: "145px" }}>
                {formatHour(hour)} – {formatHour(hour + 1)}
              </span>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)", flex: 1 }}>
                {filled}/{slot.interpreterCount} filled
              </span>
              {isPast ? (
                <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--gray-200)", color: "var(--gray-600)", borderRadius: "6px" }}>Past</span>
              ) : isMine ? (
                <button
                  disabled={actionLoading === mySignupEntry.id}
                  onClick={() => cancelSignup(mySignupEntry.id, `${slot.id}-${hour}`)}
                  style={{ fontSize: "0.75rem", padding: "6px 14px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", opacity: actionLoading === mySignupEntry.id ? 0.5 : 1 }}
                  title="Click to cancel"
                >
                  {actionLoading === mySignupEntry.id ? "..." : "Signed Up ✓"}
                </button>
              ) : isFull ? (
                <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--gray-200)", color: "var(--gray-600)", borderRadius: "6px" }}>Full</span>
              ) : (() => {
                const myRoles = session?.user?.roles ?? [];
                const langCode = slot.language;
                if (!myRoles.includes(`LANG_${langCode}_CLEARED`)) {
                  return <button disabled style={{ background: "#fff", color: "#9CA3AF", border: "1.5px solid #D1D5DB", borderRadius: "8px", padding: "8px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "not-allowed", whiteSpace: "nowrap" }}>Not Cleared</button>;
                }
                return (
                  <button
                    disabled={actionLoading === key}
                    onClick={() => signUp(slot.id, hour)}
                    style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", opacity: actionLoading === key ? 0.5 : 1, whiteSpace: "nowrap" }}
                  >
                    {actionLoading === key ? "..." : "Sign Up"}
                  </button>
                );
              })()}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
        {fixedLangs.map((lang) => (
          <button
            key={lang.code}
            onClick={() => { setLangFilter(lang.code); setOtherDropdownOpen(false); }}
            style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: langFilter === lang.code ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", background: langFilter === lang.code ? "var(--blue)" : "var(--card-bg)", color: langFilter === lang.code ? "#fff" : "#111827" }}
          >{lang.label}</button>
        ))}
        {otherLangs.length > 0 && (
          <div ref={otherDropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setOtherDropdownOpen((o) => !o)}
              style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: otherSelected ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", background: otherSelected ? "var(--blue)" : "var(--card-bg)", color: otherSelected ? "#fff" : "#111827", display: "flex", alignItems: "center", gap: "6px" }}
            >
              {otherSelected ? (availableLanguages.find((l) => l.code === langFilter)?.name ?? langFilter) : "Other languages…"}
              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>{otherDropdownOpen ? "▲" : "▼"}</span>
            </button>
            {otherDropdownOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,.10)", minWidth: "200px", maxHeight: "260px", overflowY: "auto" }}>
                {otherSelected && (
                  <button
                    onClick={() => { setLangFilter("ALL"); setOtherDropdownOpen(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "0.875rem", background: "none", border: "none", borderBottom: "1px solid var(--card-border)", cursor: "pointer", color: "#111827", fontFamily: "'DM Sans', sans-serif" }}
                  >Clear filter</button>
                )}
                {otherLangs.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLangFilter(l.code); setOtherDropdownOpen(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "0.875rem", background: langFilter === l.code ? "var(--blue)" : "none", color: langFilter === l.code ? "#fff" : "#111827", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                  >{l.name}{statLabel(l.code)}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />
        <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", outline: "none" }}>
          <option value="ALL">All Clinics</option>
          {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ fontSize: "0.8rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear</button>
        )}
        <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />
        <button
          onClick={() => setAvailableOnly(!availableOnly)}
          style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: availableOnly ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)", background: availableOnly ? "var(--green)" : "var(--card-bg)", color: availableOnly ? "#fff" : "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
        >Available Only</button>
      </div>

      {upcoming.length === 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No slots match your filters.</p>
        </div>
      ) : (
        <div>
          {upcoming.map((slot) => renderVolunteerSlot(slot, false))}
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
                <button onClick={() => setSpamModal(null)} style={{ width: "100%", padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer" }}>Dismiss</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "8px" }}>Heads up</h3>
                <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>Cancelling a shift within 24 hours sends an urgent email alert to the clinic. Please be considerate of their time. Are you sure you want to cancel?</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => setSpamModal(null)} style={{ flex: 1, padding: "9px 20px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "9px", background: "var(--card-bg)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>Keep Signup</button>
                  <button onClick={spamModal.onProceed ?? (() => setSpamModal(null))} style={{ flex: 1, padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer" }}>Yes, Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Remove Volunteer Confirm (A1) */}
      {removeVolunteerConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
          <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "18px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", padding: "24px 24px 20px", width: "100%", maxWidth: "380px" }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "#111827", lineHeight: 1.5, marginBottom: "20px" }}>Remove this volunteer from the slot?</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => { setRemoveVolunteerConfirm(null); setRemoveVolunteerError(null); }} style={{ background: "none", border: "1.5px solid var(--card-border)", color: "#0F172A", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 600, padding: "8px 18px", borderRadius: "99px", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => void confirmRemoveVolunteer(removeVolunteerConfirm.signupId)} style={{ background: "#DC2626", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 600, padding: "8px 18px", borderRadius: "99px", cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
      {/* Remove error toast */}
      {removeVolunteerError && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "12px 20px", zIndex: 300, display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 4px 16px rgba(0,0,0,.12)", maxWidth: "420px" }}>
          <span style={{ fontSize: "0.875rem", color: "#DC2626", fontFamily: "'DM Sans', sans-serif" }}>{removeVolunteerError}</span>
          <button onClick={() => setRemoveVolunteerError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
    </div>
  );
}
