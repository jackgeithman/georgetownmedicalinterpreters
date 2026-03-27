"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type VolunteerStats = {
  languages: string[];
  hoursVolunteered: number;
  cancellationsWithin24h: number;
  cancellationsWithin2h: number;
  noShows: number;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  clinicId: string | null;
  createdAt: string;
  clinic?: { name: string } | null;
  volunteer?: VolunteerStats | null;
};

type Clinic = {
  id: string;
  name: string;
  address: string;
  contactName: string;
  contactEmail: string;
  loginToken: string;
  _count?: { staff: number; slots: number };
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
    volunteer: {
      id: string;
      user: { name: string | null; email: string };
    };
  }[];
};

type AdminProfile = {
  id: string;
  languages: string[];
  backgroundInfo: string | null;
  hoursVolunteered: number;
};

type EmailRule = { id: string; email: string; type: "ALLOW" | "BLOCK"; note: string | null };
type Tab = "slots" | "pending" | "users" | "clinics" | "profile" | "access";

const LANG_LABELS: Record<string, string> = { ES: "Spanish", ZH: "Chinese", KO: "Korean" };

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDate(s: string) {
  return new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function formatDateLong(s: string) {
  return new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "var(--card-bg)", border: "1.5px solid var(--card-border)",
  borderRadius: "14px", overflow: "hidden", marginBottom: "14px",
  boxShadow: "0 2px 6px rgba(0,0,0,.05)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid var(--card-border)",
  borderRadius: "9px", fontFamily: "inherit", fontSize: "0.9rem",
  color: "var(--gray-900)", background: "#fff", outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px",
  padding: "10px 22px", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600,
  cursor: "pointer", transition: "all .18s", whiteSpace: "nowrap" as const,
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("slots");
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [adminSlots, setAdminSlots] = useState<AdminSlot[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showClinicForm, setShowClinicForm] = useState(false);
  const [clinicForm, setClinicForm] = useState({ name: "", address: "", contactName: "", contactEmail: "" });
  const [clinicFormError, setClinicFormError] = useState("");
  const [assignModal, setAssignModal] = useState<{ userId: string; userName: string } | null>(null);
  const [pinReveal, setPinReveal] = useState<{ clinicName: string; pin: string } | null>(null);
  const [volunteerAssignTarget, setVolunteerAssignTarget] = useState<{
    slotId: string; hour: number; language: string; date: string; clinicName: string;
  } | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSelected, setAssignSelected] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [adminSelectedSlotIds, setAdminSelectedSlotIds] = useState<Set<string>>(new Set());
  const [adminDeleteModal, setAdminDeleteModal] = useState<false | "pending" | "confirmed">(false);
  const [adminDeleteInput, setAdminDeleteInput] = useState("");
  const [langFilter, setLangFilter] = useState("ALL");
  const [clinicFilter, setClinicFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [profileForm, setProfileForm] = useState<{ languages: string[] }>({ languages: [] });
  const [profileSaved, setProfileSaved] = useState(false);
  const [emailRules, setEmailRules] = useState<EmailRule[]>([]);
  const [ruleEmail, setRuleEmail] = useState("");
  const [ruleType, setRuleType] = useState<"ALLOW" | "BLOCK">("ALLOW");
  const [ruleNote, setRuleNote] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") router.push("/dashboard");
  }, [status, session, router]);

  const fetchData = useCallback(async (isSuperAdmin?: boolean) => {
    const fetches: Promise<Response>[] = [
      fetch("/api/admin/users"),
      fetch("/api/admin/clinics"),
      fetch("/api/admin/slots"),
      fetch("/api/volunteer/profile"),
    ];
    if (isSuperAdmin) fetches.push(fetch("/api/admin/email-rules"));

    const [usersRes, clinicsRes, slotsRes, profileRes, rulesRes] = await Promise.all(fetches);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (clinicsRes.ok) setClinics(await clinicsRes.json());
    if (slotsRes.ok) setAdminSlots(await slotsRes.json());
    if (profileRes.ok) {
      const p = await profileRes.json();
      setAdminProfile(p);
      setProfileForm({ languages: p.languages ?? [] });
    }
    if (rulesRes?.ok) setEmailRules(await rulesRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
      fetchData(session.user.role === "SUPER_ADMIN");
    }
  }, [session, fetchData]);

  const updateUser = async (userId: string, data: Record<string, string | null>) => {
    setActionLoading(userId);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...data }),
    });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

  const createClinic = async () => {
    setActionLoading("clinic-form");
    setClinicFormError("");
    const res = await fetch("/api/admin/clinics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clinicForm),
    });
    if (res.ok) {
      const data = await res.json();
      await fetchData();
      setClinicForm({ name: "", address: "", contactName: "", contactEmail: "" });
      setClinicFormError("");
      setShowClinicForm(false);
      setPinReveal({ clinicName: data.name, pin: data.plainPin });
    } else {
      const data = await res.json().catch(() => ({}));
      setClinicFormError(data.error ?? `Error ${res.status} — please try again.`);
    }
    setActionLoading(null);
  };

  const removeVolunteer = async (signupId: string) => {
    if (!confirm("Remove this volunteer from the slot?")) return;
    setActionLoading(signupId);
    const res = await fetch(`/api/admin/signups/${signupId}`, { method: "DELETE" });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

  const signUp = async (slotId: string, subBlockHour: number) => {
    const key = `signup-${slotId}-${subBlockHour}`;
    setActionLoading(key);
    const res = await fetch("/api/volunteer/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, subBlockHour }),
    });
    if (res.ok) {
      await fetchData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Could not sign up.");
    }
    setActionLoading(null);
  };

  const cancelMySignup = async (signupId: string) => {
    setActionLoading(signupId);
    const res = await fetch(`/api/volunteer/signups/${signupId}`, { method: "DELETE" });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

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
      await fetchData();
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

  const openAdminDeleteModal = () => {
    setAdminDeleteInput("");
    setAdminDeleteModal("pending");
  };

  const confirmAdminDeleteSlots = async () => {
    setActionLoading("admin-batch-delete");
    const selectedSlots = upcomingSlots.filter((s) => adminSelectedSlotIds.has(s.id));
    for (const slot of selectedSlots) {
      await fetch(`/api/admin/slots/${slot.id}`, { method: "DELETE" });
    }
    setAdminSelectedSlotIds(new Set());
    setAdminDeleteModal(false);
    setAdminDeleteInput("");
    await fetchData();
    setActionLoading(null);
  };

  const deleteClinic = async (clinicId: string, clinicName: string) => {
    if (!confirm(`Delete "${clinicName}"? This cannot be undone.`)) return;
    setActionLoading(`delete-clinic-${clinicId}`);
    const res = await fetch(`/api/admin/clinics/${clinicId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not delete clinic.");
    }
    setActionLoading(null);
  };

  const regeneratePin = async (clinicId: string, clinicName: string) => {
    if (!confirm("Generate a new PIN for this clinic? The old PIN will stop working immediately.")) return;
    setActionLoading(`pin-${clinicId}`);
    const res = await fetch(`/api/admin/clinics/${clinicId}`, { method: "PATCH" });
    if (res.ok) {
      const data = await res.json();
      await fetchData();
      setPinReveal({ clinicName, pin: data.plainPin });
    }
    setActionLoading(null);
  };

  const saveProfile = async () => {
    setActionLoading("profile");
    setProfileSaved(false);
    const res = await fetch("/api/volunteer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languages: profileForm.languages }),
    });
    if (res.ok) {
      const p = await res.json();
      setAdminProfile(p);
      setProfileForm({ languages: p.languages ?? [] });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    }
    setActionLoading(null);
  };

  const toggleLanguage = (lang: string) => {
    const langs = profileForm.languages.includes(lang)
      ? profileForm.languages.filter((l) => l !== lang)
      : [...profileForm.languages, lang];
    setProfileForm({ languages: langs });
  };

  const addEmailRule = async () => {
    if (!ruleEmail.trim()) return;
    setActionLoading("email-rule");
    const res = await fetch("/api/admin/email-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ruleEmail.trim(), type: ruleType, note: ruleNote.trim() || null }),
    });
    if (res.ok) {
      const rule = await res.json();
      setEmailRules((prev) => [rule, ...prev.filter((r) => r.email !== rule.email)]);
      setRuleEmail(""); setRuleNote("");
    }
    setActionLoading(null);
  };

  const removeEmailRule = async (id: string) => {
    setActionLoading(`rule-${id}`);
    const res = await fetch(`/api/admin/email-rules/${id}`, { method: "DELETE" });
    if (res.ok) setEmailRules((prev) => prev.filter((r) => r.id !== id));
    setActionLoading(null);
  };

  const pendingUsers = users.filter((u) => u.status === "PENDING_APPROVAL");

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading…</p>
      </div>
    );
  }

  const now = new Date();
  const slotEnd = (s: AdminSlot) =>
    new Date(s.date.slice(0, 10) + "T" + String(s.endTime).padStart(2, "0") + ":00:00");

  const filteredSlots = adminSlots.filter((s) => {
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
  const upcomingSlots = filteredSlots.filter((s) => slotEnd(s) > now);
  const pastSlots = filteredSlots.filter((s) => slotEnd(s) <= now).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const upcomingByDate: Record<string, AdminSlot[]> = {};
  for (const s of upcomingSlots) {
    const label = formatDateLong(s.date);
    if (!upcomingByDate[label]) upcomingByDate[label] = [];
    upcomingByDate[label].push(s);
  }

  const selectedSlots = upcomingSlots.filter((s) => adminSelectedSlotIds.has(s.id));
  const deleteConfirmText = selectedSlots.length === 1
    ? `${selectedSlots[0].clinic.name} ${selectedSlots[0].date.slice(0, 10)}`
    : "DELETE";

  const renderSlot = (slot: AdminSlot, isPast: boolean) => {
    const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
    const canSignUp = adminProfile?.languages.includes(slot.language) ?? false;
    const openCount = subBlocks.filter((h) => slot.signups.filter((s) => s.subBlockHour === h).length < slot.interpreterCount).length;

    return (
      <div key={slot.id} style={{ ...card, opacity: isPast ? 0.45 : 1, pointerEvents: isPast ? "none" : "auto" }}>
        <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {!isPast && (
                <input
                  type="checkbox"
                  checked={adminSelectedSlotIds.has(slot.id)}
                  onChange={() => toggleSelectAdminSlot(slot.id)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--navy)" }}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
            </div>
            <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-600)", marginTop: "3px" }}>{LANG_LABELS[slot.language]}</div>
            {slot.notes && <div style={{ fontSize: "0.82rem", color: "var(--gray-600)", fontStyle: "italic", marginTop: "4px" }}>{slot.notes}</div>}
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
          {isPast ? (
            <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase" }}>Past</span>
          ) : (
            <div style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.9rem", fontWeight: 700, padding: "9px 18px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.2 }}>
              {openCount} open<span style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, marginTop: "2px", opacity: 0.8 }}>slots</span>
            </div>
          )}
        </div>

        {subBlocks.map((hour, i) => {
          const hoursSignups = slot.signups.filter((s) => s.subBlockHour === hour);
          const mySignup = adminProfile ? hoursSignups.find((s) => s.volunteer.id === adminProfile.id) : null;
          const filled = hoursSignups.length;
          const isFull = filled >= slot.interpreterCount;
          const signupKey = `signup-${slot.id}-${hour}`;
          const isLast = i === subBlocks.length - 1;

          return (
            <div key={hour}>
              <div style={{ display: "flex", alignItems: "center", padding: "12px 22px", borderBottom: "1px solid var(--card-border)", gap: "14px" }}>
                <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: isPast ? "var(--gray-400)" : "var(--green)", flexShrink: 0 }} />
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", minWidth: "145px" }}>{formatHour(hour)} – {formatHour(hour + 1)}</span>
                <span style={{ fontSize: "0.875rem", color: "var(--gray-600)", flex: 1 }}>{filled}/{slot.interpreterCount} filled</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {!isPast && (
                    <button
                      onClick={() => { setVolunteerAssignTarget({ slotId: slot.id, hour, language: slot.language, date: slot.date, clinicName: slot.clinic.name }); setAssignSearch(""); setAssignSelected(null); setAssignError(""); }}
                      style={{ fontSize: "0.78rem", padding: "5px 12px", background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer" }}
                    >
                      Assign
                    </button>
                  )}
                  {isPast ? (
                    <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>Past</span>
                  ) : mySignup ? (
                    <button
                      disabled={actionLoading === mySignup.id}
                      onClick={() => cancelMySignup(mySignup.id)}
                      style={{ fontSize: "0.78rem", padding: "5px 12px", background: "var(--green-light)", color: "var(--green)", border: "1px solid #86EFAC", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === mySignup.id ? 0.5 : 1 }}
                      title="Click to cancel"
                    >
                      {actionLoading === mySignup.id ? "…" : "Signed Up ✓"}
                    </button>
                  ) : isFull ? (
                    <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>Full</span>
                  ) : (
                    <button
                      disabled={actionLoading === signupKey || !canSignUp}
                      onClick={() => signUp(slot.id, hour)}
                      title={!canSignUp ? "Add this language to your volunteer profile first" : undefined}
                      style={{ ...btnPrimary, padding: "5px 14px", fontSize: "0.78rem", opacity: actionLoading === signupKey || !canSignUp ? 0.4 : 1 }}
                    >
                      {actionLoading === signupKey ? "…" : "Sign Up"}
                    </button>
                  )}
                </div>
              </div>
              {hoursSignups.filter((s) => s.volunteer.id !== adminProfile?.id).map((s, si, sarr) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 22px 7px 48px", borderBottom: si === sarr.length - 1 && isLast ? "none" : "1px solid var(--card-border)", background: "#FAFAF9" }}>
                  <div>
                    <span style={{ fontSize: "0.82rem", color: "var(--gray-900)", fontWeight: 500 }}>{s.volunteer.user.name ?? s.volunteer.user.email}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginLeft: "8px" }}>{s.volunteer.user.email}</span>
                  </div>
                  {!isPast && (
                    <button
                      disabled={actionLoading === s.id}
                      onClick={() => removeVolunteer(s.id)}
                      style={{ fontSize: "0.75rem", padding: "3px 10px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === s.id ? 0.5 : 1 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "slots", label: "Browse Slots" },
    { key: "pending", label: "Pending", count: pendingUsers.length },
    { key: "users", label: "All Users", count: users.length },
    { key: "clinics", label: "Clinics", count: clinics.length },
    { key: "profile", label: "My Profile" },
    ...(session?.user?.role === "SUPER_ADMIN" ? [{ key: "access" as Tab, label: "Access Control" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)" }}>
      {/* Topbar */}
      <header style={{ background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "linear-gradient(135deg,#2563EB,#60A5FA)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: "1rem" }}>G</div>
          <div>
            <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
            <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>Admin Dashboard</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {session?.user?.role === "SUPER_ADMIN" && (
            <span style={{ background: "rgba(124,58,237,.25)", color: "#C4B5FD", fontSize: "0.72rem", fontWeight: 600, padding: "3px 10px", borderRadius: "99px", border: "1px solid rgba(124,58,237,.3)" }}>Super Admin</span>
          )}
          <button
            onClick={() => router.push("/dashboard/volunteer")}
            style={{ color: "#CBD5E1", fontSize: "0.8rem", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.15)", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
          >
            Volunteer View
          </button>
          <a
            href="mailto:georgetownmedicalinterpreters@gmail.com"
            style={{ color: "#CBD5E1", fontSize: "0.8rem", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.15)" }}
          >
            Contact Us
          </a>
          <span style={{ color: "#CBD5E1", fontSize: "0.82rem" }}>{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "36px 24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "28px", background: "var(--card-bg)", padding: "5px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,.08)", width: "fit-content", border: "1px solid var(--card-border)" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ padding: "9px 20px", borderRadius: "9px", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer", border: "none", fontFamily: "inherit", transition: "all .15s", background: tab === t.key ? "var(--blue)" : "none", color: tab === t.key ? "#fff" : "var(--gray-600)", whiteSpace: "nowrap" }}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span style={{ background: t.key === "pending" ? "#D97706" : "#DC2626", color: "#fff", fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px", borderRadius: "99px", marginLeft: "5px" }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Browse Slots ── */}
        {tab === "slots" && (
          <div>
            {adminSelectedSlotIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px" }}>
                <span style={{ fontSize: "0.875rem", color: "#B91C1C", fontWeight: 600 }}>{adminSelectedSlotIds.size} slot{adminSelectedSlotIds.size !== 1 ? "s" : ""} selected</span>
                <button onClick={openAdminDeleteModal} style={{ padding: "6px 14px", fontSize: "0.8rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer" }}>Delete Selected</button>
                <button onClick={() => setAdminSelectedSlotIds(new Set())} style={{ background: "none", border: "none", color: "#DC2626", fontFamily: "inherit", fontSize: "0.8rem", cursor: "pointer" }}>Clear</button>
              </div>
            )}
            {!adminProfile?.languages.length && (
              <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", fontSize: "0.875rem", color: "#92400E" }}>
                To sign up for slots, add your languages in{" "}
                <button onClick={() => setTab("profile")} style={{ background: "none", border: "none", color: "#92400E", fontFamily: "inherit", fontSize: "0.875rem", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}>My Profile</button>.
              </div>
            )}

            {/* Filters */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
              <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                <option value="ALL">All Languages</option>
                {Object.entries(LANG_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                <option value="ALL">All Clinics</option>
                {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
                From
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "inherit", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }} />
                To
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "inherit", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }} />
                {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ background: "none", border: "none", color: "var(--gray-400)", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>Clear</button>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)", cursor: "pointer" }}>
                <div onClick={() => setAvailableOnly(!availableOnly)} style={{ width: "38px", height: "22px", borderRadius: "99px", background: availableOnly ? "var(--blue)" : "var(--gray-200)", position: "relative", cursor: "pointer", transition: "background .15s" }}>
                  <div style={{ width: "16px", height: "16px", background: "#fff", borderRadius: "50%", position: "absolute", top: "3px", left: availableOnly ? "19px" : "3px", transition: "left .15s" }} />
                </div>
                Available Only
              </label>
            </div>

            {upcomingSlots.length === 0 && pastSlots.length === 0 ? (
              <div style={{ ...card, padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No slots match your filters.</p>
              </div>
            ) : (
              <>
                {Object.entries(upcomingByDate).map(([dateLabel, slots]) => (
                  <div key={dateLabel}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gray-600)", margin: "28px 0 12px" }}>{dateLabel}</div>
                    {slots.map((slot) => renderSlot(slot, false))}
                  </div>
                ))}
                {pastSlots.length > 0 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "32px 0 16px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--gray-400)" }}>
                      <span style={{ flex: 1, height: "1px", background: "var(--card-border)" }} />
                      Past Slots
                      <span style={{ flex: 1, height: "1px", background: "var(--card-border)" }} />
                    </div>
                    {pastSlots.map((slot) => renderSlot(slot, true))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Pending Approvals ── */}
        {tab === "pending" && (
          <div>
            {pendingUsers.length === 0 ? (
              <div style={{ ...card, padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No pending approvals</p>
              </div>
            ) : (
              pendingUsers.map((user) => (
                <div key={user.id} style={{ ...card, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: "0.95rem" }}>{user.name}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginTop: "2px" }}>{user.email}</p>
                    <p style={{ fontSize: "0.78rem", color: "var(--gray-400)", marginTop: "4px" }}>Applied {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button disabled={actionLoading === user.id} onClick={() => updateUser(user.id, { status: "ACTIVE", role: "VOLUNTEER" })} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "var(--green-light)", color: "var(--green)", border: "1px solid #86EFAC", borderRadius: "8px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === user.id ? 0.5 : 1 }}>Approve</button>
                    <button disabled={actionLoading === user.id} onClick={() => updateUser(user.id, { status: "SUSPENDED" })} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "8px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === user.id ? 0.5 : 1 }}>Reject</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── All Users ── */}
        {tab === "users" && (
          <div style={{ ...card, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--card-border)" }}>
                  {["Name", "Email", "Role", "Status", "Clinic", "Volunteer Stats", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: h === "Actions" ? "right" : "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)", padding: "12px 16px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "12px 16px", color: "var(--gray-900)", fontWeight: 500 }}>{user.name}</td>
                    <td style={{ padding: "12px 16px", color: "var(--gray-600)" }}>{user.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: "0.75rem", padding: "3px 10px", borderRadius: "99px", fontWeight: 600, background: user.role === "SUPER_ADMIN" ? "#EDE9FE" : user.role === "ADMIN" ? "#F5F3FF" : user.role === "CLINIC" ? "#EFF6FF" : user.role === "VOLUNTEER" ? "var(--green-light)" : "var(--gray-200)", color: user.role === "SUPER_ADMIN" ? "#6D28D9" : user.role === "ADMIN" ? "#7C3AED" : user.role === "CLINIC" ? "#1D4ED8" : user.role === "VOLUNTEER" ? "var(--green)" : "var(--gray-600)" }}>
                        {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: "0.75rem", padding: "3px 10px", borderRadius: "99px", background: user.status === "ACTIVE" ? "var(--green-light)" : user.status === "SUSPENDED" ? "#FEF2F2" : "#FFFBEB", color: user.status === "ACTIVE" ? "var(--green)" : user.status === "SUSPENDED" ? "#DC2626" : "#D97706" }}>
                        {user.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--gray-600)" }}>{user.clinic?.name || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {user.volunteer ? (
                        <div style={{ display: "flex", gap: "10px", fontSize: "0.75rem", color: "var(--gray-600)" }}>
                          <span title="Hours volunteered">⏱ {user.volunteer.hoursVolunteered}h</span>
                          <span title="No-shows" style={{ color: user.volunteer.noShows > 0 ? "#DC2626" : "inherit" }}>NS {user.volunteer.noShows}</span>
                          <span title="Cancellations within 24h" style={{ color: user.volunteer.cancellationsWithin24h > 0 ? "#D97706" : "inherit" }}>24h {user.volunteer.cancellationsWithin24h}</span>
                          <span title="Cancellations within 2h" style={{ color: user.volunteer.cancellationsWithin2h > 0 ? "#DC2626" : "inherit" }}>2h {user.volunteer.cancellationsWithin2h}</span>
                        </div>
                      ) : <span style={{ color: "var(--gray-400)", fontSize: "0.75rem" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        {user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || session?.user?.role === "SUPER_ADMIN") && (
                          <>
                            <select style={{ fontSize: "0.78rem", border: "1px solid var(--card-border)", borderRadius: "6px", padding: "4px 8px", color: "var(--gray-900)", fontFamily: "inherit", background: "var(--card-bg)" }} value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value })}>
                              <option value="VOLUNTEER">Volunteer</option>
                              <option value="CLINIC">Clinic</option>
                              {session?.user?.role === "SUPER_ADMIN" && <option value="ADMIN">Admin</option>}
                            </select>
                            {user.role === "CLINIC" && (
                              <button onClick={() => setAssignModal({ userId: user.id, userName: user.name })} style={{ fontSize: "0.78rem", padding: "4px 10px", background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer" }}>Assign Clinic</button>
                            )}
                            {user.status === "ACTIVE" ? (
                              <button onClick={() => updateUser(user.id, { status: "SUSPENDED" })} style={{ fontSize: "0.78rem", padding: "4px 10px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer" }}>Suspend</button>
                            ) : (
                              <button onClick={() => updateUser(user.id, { status: "ACTIVE" })} style={{ fontSize: "0.78rem", padding: "4px 10px", background: "var(--green-light)", color: "var(--green)", border: "1px solid #86EFAC", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer" }}>Activate</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Clinics ── */}
        {tab === "clinics" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowClinicForm(!showClinicForm)} style={{ ...btnPrimary, background: showClinicForm ? "var(--gray-600)" : "var(--blue)" }}>
                {showClinicForm ? "Cancel" : "+ Add Clinic"}
              </button>
            </div>

            {showClinicForm && (
              <div style={{ ...card, padding: "24px", marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>New Clinic</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  {[
                    { placeholder: "Clinic Name", field: "name" },
                    { placeholder: "Address", field: "address" },
                    { placeholder: "Contact Name", field: "contactName" },
                    { placeholder: "Contact Email", field: "contactEmail" },
                  ].map(({ placeholder, field }) => (
                    <input
                      key={field}
                      placeholder={placeholder}
                      value={clinicForm[field as keyof typeof clinicForm]}
                      onChange={(e) => setClinicForm({ ...clinicForm, [field]: e.target.value })}
                      style={inputStyle}
                    />
                  ))}
                </div>
                {clinicFormError && <p style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "9px", fontSize: "0.875rem", color: "#DC2626", marginBottom: "12px" }}>{clinicFormError}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button disabled={actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail} onClick={createClinic} style={{ ...btnPrimary, opacity: actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail ? 0.5 : 1 }}>
                    {actionLoading === "clinic-form" ? "Creating…" : "Create Clinic"}
                  </button>
                </div>
              </div>
            )}

            {clinics.length === 0 && !showClinicForm ? (
              <div style={{ ...card, padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No clinics yet</p>
              </div>
            ) : (
              clinics.map((clinic) => (
                <div key={clinic.id} style={{ ...card, padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>{clinic.name}</h3>
                      <p style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginTop: "2px" }}>{clinic.address}</p>
                      <p style={{ fontSize: "0.78rem", color: "var(--gray-400)", marginTop: "4px" }}>{clinic.contactName} · {clinic.contactEmail}</p>
                      <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--page-bg)", border: "1px solid var(--card-border)", borderRadius: "7px", padding: "5px 10px" }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>PIN</span>
                          <span style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "var(--gray-400)", letterSpacing: "0.2em" }}>••••••</span>
                        </div>
                        <button onClick={() => { const url = `${window.location.origin}/clinic-login/${clinic.loginToken}`; navigator.clipboard.writeText(url); }} style={{ fontSize: "0.78rem", padding: "5px 12px", background: "var(--page-bg)", color: "var(--gray-600)", border: "1px solid var(--card-border)", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer" }}>Copy Login URL</button>
                        <button disabled={actionLoading === `pin-${clinic.id}`} onClick={() => regeneratePin(clinic.id, clinic.name)} style={{ fontSize: "0.78rem", padding: "5px 12px", background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === `pin-${clinic.id}` ? 0.5 : 1 }}>Regenerate PIN</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--gray-400)" }}>{clinic._count?.slots || 0} slots</span>
                      <button disabled={actionLoading === `delete-clinic-${clinic.id}`} onClick={() => deleteClinic(clinic.id, clinic.name)} style={{ fontSize: "0.78rem", padding: "5px 12px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "7px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === `delete-clinic-${clinic.id}` ? 0.5 : 1 }}>Delete</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── My Profile ── */}
        {tab === "profile" && (
          <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ ...card, padding: "24px", display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--navy)" }}>{adminProfile?.hoursVolunteered ?? 0}</p>
                <p style={{ fontSize: "0.78rem", color: "var(--gray-400)", marginTop: "2px" }}>Hours Volunteered</p>
              </div>
            </div>

            <div style={card}>
              <div style={{ padding: "18px 24px", borderBottom: "1.5px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>Languages</h2>
                {profileSaved && <span style={{ fontSize: "0.82rem", color: "var(--green)" }}>Saved ✓</span>}
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "16px" }}>Select the languages you can interpret. Only matching slots will let you sign up.</p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
                  {Object.entries(LANG_LABELS).map(([code, label]) => (
                    <label key={code} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem", color: "var(--gray-900)" }}>
                      <input type="checkbox" checked={profileForm.languages.includes(code)} onChange={() => toggleLanguage(code)} style={{ accentColor: "var(--blue)", width: "16px", height: "16px", cursor: "pointer" }} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button disabled={actionLoading === "profile"} onClick={saveProfile} style={{ ...btnPrimary, opacity: actionLoading === "profile" ? 0.5 : 1 }}>
                    {actionLoading === "profile" ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Access Control ── */}
        {tab === "access" && session?.user?.role === "SUPER_ADMIN" && (
          <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={card}>
              <div style={{ padding: "18px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>Add Email Rule</h2>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "16px" }}>
                  <strong>Allow</strong> lets a non-Georgetown email sign in. <strong>Block</strong> prevents any email from signing in.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input type="email" placeholder="user@example.com" value={ruleEmail} onChange={(e) => setRuleEmail(e.target.value)} style={inputStyle} />
                  <div style={{ display: "flex", gap: "10px" }}>
                    {(["ALLOW", "BLOCK"] as const).map((t) => (
                      <button key={t} onClick={() => setRuleType(t)} style={{ flex: 1, padding: "10px", fontSize: "0.875rem", fontFamily: "inherit", cursor: "pointer", borderRadius: "9px", fontWeight: 600, border: "1.5px solid", background: ruleType === t ? (t === "ALLOW" ? "var(--green)" : "#DC2626") : "transparent", color: ruleType === t ? "#fff" : "var(--gray-600)", borderColor: ruleType === t ? (t === "ALLOW" ? "var(--green)" : "#DC2626") : "var(--card-border)" }}>
                        {t === "ALLOW" ? "Allow" : "Block"}
                      </button>
                    ))}
                  </div>
                  <input type="text" placeholder="Note (optional)" value={ruleNote} onChange={(e) => setRuleNote(e.target.value)} style={inputStyle} />
                  <button disabled={!ruleEmail.trim() || actionLoading === "email-rule"} onClick={addEmailRule} style={{ ...btnPrimary, width: "100%", opacity: !ruleEmail.trim() || actionLoading === "email-rule" ? 0.5 : 1 }}>
                    {actionLoading === "email-rule" ? "Saving…" : "Add Rule"}
                  </button>
                </div>
              </div>
            </div>

            {emailRules.length > 0 ? (
              <div style={card}>
                {emailRules.map((rule, i) => (
                  <div key={rule.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: i === emailRules.length - 1 ? "none" : "1px solid var(--card-border)", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <span style={{ flexShrink: 0, fontSize: "0.75rem", padding: "3px 10px", borderRadius: "99px", fontWeight: 600, background: rule.type === "ALLOW" ? "var(--green-light)" : "#FEF2F2", color: rule.type === "ALLOW" ? "var(--green)" : "#DC2626" }}>{rule.type}</span>
                      <span style={{ fontSize: "0.875rem", color: "var(--gray-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.email}</span>
                      {rule.note && <span style={{ fontSize: "0.78rem", color: "var(--gray-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.note}</span>}
                    </div>
                    <button disabled={actionLoading === `rule-${rule.id}`} onClick={() => removeEmailRule(rule.id)} style={{ flexShrink: 0, fontSize: "0.78rem", padding: "4px 10px", background: "var(--page-bg)", color: "var(--gray-600)", border: "1px solid var(--card-border)", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === `rule-${rule.id}` ? 0.5 : 1 }}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...card, padding: "36px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>No rules yet. All Georgetown emails can sign in by default.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals ── */}

      {/* Delete Slots Modal */}
      {adminDeleteModal && (() => {
        const selectedSlotsList = upcomingSlots.filter((s) => adminSelectedSlotIds.has(s.id));
        const isSingle = selectedSlotsList.length === 1;
        const confirmText = isSingle ? `${selectedSlotsList[0].clinic.name} ${selectedSlotsList[0].date.slice(0, 10)}` : "DELETE";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
            <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", width: "100%", maxWidth: "480px" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy)" }}>Delete {selectedSlotsList.length} Slot{selectedSlotsList.length !== 1 ? "s" : ""}</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginTop: "4px" }}>This will cancel the slot and notify any signed-up volunteers.</p>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <div style={{ maxHeight: "160px", overflowY: "auto", marginBottom: "16px" }}>
                  {selectedSlotsList.map((s) => (
                    <div key={s.id} style={{ fontSize: "0.82rem", color: "var(--gray-600)", padding: "6px 0", borderBottom: "1px solid var(--card-border)" }}>
                      <span style={{ fontWeight: 600 }}>{s.clinic.name}</span> · {formatDate(s.date)} · {formatHour(s.startTime)}–{formatHour(s.endTime)} · {LANG_LABELS[s.language]}
                      {s.signups.length > 0 && <span style={{ color: "#D97706", marginLeft: "6px" }}>({s.signups.length} volunteer{s.signups.length !== 1 ? "s" : ""} affected)</span>}
                    </div>
                  ))}
                </div>
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "9px", padding: "12px 16px", marginBottom: "14px" }}>
                  <p style={{ fontSize: "0.82rem", color: "#92400E" }}>
                    {isSingle ? <>To confirm, type the clinic name and date: <strong>{confirmText}</strong></> : <>To confirm, type: <strong>DELETE</strong></>}
                  </p>
                </div>
                <input autoFocus type="text" placeholder={confirmText} value={adminDeleteInput} onChange={(e) => setAdminDeleteInput(e.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => { setAdminDeleteModal(false); setAdminDeleteInput(""); }} style={{ flex: 1, padding: "10px", background: "none", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "inherit", fontSize: "0.875rem", color: "var(--gray-600)", cursor: "pointer" }}>Cancel</button>
                  <button disabled={adminDeleteInput.trim() !== confirmText || actionLoading === "admin-batch-delete"} onClick={confirmAdminDeleteSlots} style={{ flex: 1, padding: "10px", background: "#DC2626", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", opacity: adminDeleteInput.trim() !== confirmText || actionLoading === "admin-batch-delete" ? 0.4 : 1 }}>
                    {actionLoading === "admin-batch-delete" ? "Deleting…" : "Confirm Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Assign Volunteer Modal */}
      {volunteerAssignTarget && (() => {
        const activeVolunteers = users.filter((u) => (u.role === "VOLUNTEER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN") && u.status === "ACTIVE");
        const searchLower = assignSearch.toLowerCase();
        const filteredVols = activeVolunteers.filter((u) => (u.name?.toLowerCase().includes(searchLower) ?? false) || u.email.toLowerCase().includes(searchLower));
        const targetSlot = adminSlots.find((s) => s.id === volunteerAssignTarget.slotId);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
            <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", width: "100%", maxWidth: "480px" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy)" }}>Assign a Volunteer</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginTop: "4px" }}>
                  {LANG_LABELS[volunteerAssignTarget.language]} · {formatDate(volunteerAssignTarget.date)} · {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)} · {volunteerAssignTarget.clinicName}
                </p>
              </div>
              {!assignSelected ? (
                <div style={{ padding: "20px 24px" }}>
                  <input autoFocus type="text" placeholder="Search by name or email…" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} style={{ ...inputStyle, marginBottom: "12px" }} />
                  <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                    {filteredVols.length === 0 && <p style={{ fontSize: "0.82rem", color: "var(--gray-400)", textAlign: "center", padding: "24px 0" }}>No volunteers found.</p>}
                    {filteredVols.map((u) => {
                      const alreadySigned = targetSlot?.signups.some((sg) => sg.subBlockHour === volunteerAssignTarget.hour && sg.volunteer.user.email === u.email);
                      return (
                        <button key={u.id} disabled={!!alreadySigned} onClick={() => setAssignSelected({ userId: u.id, name: u.name ?? u.email, email: u.email })} style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "9px", border: "1px solid transparent", background: "none", fontFamily: "inherit", cursor: alreadySigned ? "not-allowed" : "pointer", opacity: alreadySigned ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name ?? "—"}</p>
                            <p style={{ fontSize: "0.78rem", color: "var(--gray-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                            {alreadySigned && <span style={{ fontSize: "0.72rem", padding: "2px 8px", background: "var(--green-light)", color: "var(--green)", borderRadius: "99px" }}>Signed up</span>}
                            {u.volunteer?.languages?.map((l) => (
                              <span key={l} style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", background: "var(--gray-200)", color: "var(--gray-600)" }}>{LANG_LABELS[l] ?? l}</span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={closeAssignModal} style={{ marginTop: "12px", background: "none", border: "none", color: "var(--gray-400)", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer" }}>Cancel</button>
                </div>
              ) : (
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
                    <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#92400E", marginBottom: "6px" }}>Confirm Assignment</p>
                    <p style={{ fontSize: "0.875rem", color: "#78350F" }}>Assign <strong>{assignSelected.name}</strong> to this shift?</p>
                    <p style={{ fontSize: "0.78rem", color: "#92400E", marginTop: "2px" }}>{assignSelected.email}</p>
                    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #FDE68A", fontSize: "0.78rem", color: "#92400E" }}>
                      <p>{LANG_LABELS[volunteerAssignTarget.language]} · {volunteerAssignTarget.clinicName}</p>
                      <p>{formatDate(volunteerAssignTarget.date)} · {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)}</p>
                      <p style={{ marginTop: "4px" }}>They will receive a calendar invite.</p>
                    </div>
                  </div>
                  {assignError && <p style={{ fontSize: "0.82rem", color: "#DC2626", marginBottom: "12px" }}>{assignError}</p>}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => { setAssignSelected(null); setAssignError(""); }} style={{ flex: 1, padding: "10px", background: "none", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "inherit", fontSize: "0.875rem", color: "var(--gray-600)", cursor: "pointer" }}>← Back</button>
                    <button disabled={assignLoading} onClick={assignVolunteer} style={{ ...btnPrimary, flex: 1, textAlign: "center", opacity: assignLoading ? 0.5 : 1 }}>
                      {assignLoading ? "Assigning…" : "Confirm Assignment"}
                    </button>
                  </div>
                  <button onClick={closeAssignModal} style={{ marginTop: "12px", background: "none", border: "none", color: "var(--gray-400)", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer", width: "100%", textAlign: "center" }}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* PIN Reveal Modal */}
      {pinReveal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 24px", width: "100%", maxWidth: "360px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>New PIN for {pinReveal.clinicName}</h3>
            <p style={{ fontSize: "0.82rem", color: "var(--gray-600)", marginBottom: "16px" }}>Copy this PIN now — it cannot be shown again.</p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--page-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "14px 18px", marginBottom: "16px" }}>
              <span style={{ fontSize: "1.8rem", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.3em", color: "var(--navy)" }}>{pinReveal.pin}</span>
              <button onClick={() => navigator.clipboard.writeText(pinReveal.pin)} style={{ marginLeft: "auto", fontSize: "0.78rem", padding: "5px 12px", background: "var(--gray-200)", color: "var(--gray-600)", border: "none", borderRadius: "6px", fontFamily: "inherit", cursor: "pointer" }}>Copy</button>
            </div>
            <button onClick={() => setPinReveal(null)} style={{ ...btnPrimary, width: "100%", textAlign: "center" }}>Done</button>
          </div>
        </div>
      )}

      {/* Assign Clinic Modal */}
      {assignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "360px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--navy)", marginBottom: "14px" }}>Assign {assignModal.userName} to a clinic</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
              {clinics.map((clinic) => (
                <button key={clinic.id} onClick={async () => { await updateUser(assignModal.userId, { clinicId: clinic.id }); setAssignModal(null); }} style={{ textAlign: "left", padding: "10px 14px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "inherit", cursor: "pointer" }}>
                  {clinic.name}
                </button>
              ))}
            </div>
            <button onClick={() => setAssignModal(null)} style={{ background: "none", border: "none", color: "var(--gray-400)", fontFamily: "inherit", fontSize: "0.82rem", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
