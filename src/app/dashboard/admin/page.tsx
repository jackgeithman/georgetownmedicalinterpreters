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
const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-blue-50 text-blue-700",
};

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
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  // --- Slots tab helpers ---
  const now = new Date();

  // A slot is past when its end time has passed (local/browser time matches ET for GMI)
  const slotEnd = (s: AdminSlot) =>
    new Date(s.date.slice(0, 10) + "T" + String(s.endTime).padStart(2, "0") + ":00:00");

  const filteredSlots = adminSlots.filter((s) => {
    if (langFilter !== "ALL" && s.language !== langFilter) return false;
    if (clinicFilter !== "ALL" && s.clinic.name !== clinicFilter) return false;
    if (dateFrom) {
      if (new Date(s.date.slice(0, 10) + "T12:00:00") < new Date(dateFrom + "T00:00:00")) return false;
    }
    if (dateTo) {
      if (new Date(s.date.slice(0, 10) + "T12:00:00") > new Date(dateTo + "T23:59:59")) return false;
    }
    if (availableOnly) {
      const hasOpen = Array.from({ length: s.endTime - s.startTime }, (_, i) => s.startTime + i)
        .some((h) => s.signups.filter((sg) => sg.subBlockHour === h).length < s.interpreterCount);
      if (!hasOpen) return false;
    }
    return true;
  });

  const uniqueClinics = Array.from(new Set(adminSlots.map((s) => s.clinic.name))).sort();

  const upcomingSlots = filteredSlots.filter((s) => slotEnd(s) > now);
  const pastSlots = filteredSlots
    .filter((s) => slotEnd(s) <= now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const selectedSlots = upcomingSlots.filter((s) => adminSelectedSlotIds.has(s.id));
  const deleteConfirmText = selectedSlots.length === 1
    ? `${selectedSlots[0].clinic.name} ${selectedSlots[0].date.slice(0, 10)}`
    : "DELETE";
  const deleteInputValid = adminDeleteInput.trim() === deleteConfirmText;

  const renderSlot = (slot: AdminSlot, isPast: boolean) => {
    const subBlocks = Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i);
    const canSignUp = adminProfile?.languages.includes(slot.language) ?? false;

    return (
      <div key={slot.id} className={`bg-white rounded-xl border border-stone-200 p-5 ${isPast ? "opacity-50" : ""}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            {!isPast && (
              <input
                type="checkbox"
                checked={adminSelectedSlotIds.has(slot.id)}
                onChange={() => toggleSelectAdminSlot(slot.id)}
                className="w-4 h-4 accent-stone-700 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${LANG_COLORS[slot.language]}`}>
              {LANG_LABELS[slot.language]}
            </span>
            <span className="text-sm font-medium text-stone-800">{formatDate(slot.date)}</span>
            <span className="text-sm text-stone-500">{formatHour(slot.startTime)} – {formatHour(slot.endTime)}</span>
            {isPast && <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-400">Past</span>}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-stone-800">{slot.clinic.name}</p>
            {slot.clinic.address && <p className="text-xs text-stone-400">{slot.clinic.address}</p>}
          </div>
        </div>
        {slot.notes && <p className="text-xs text-stone-400 italic mb-3">{slot.notes}</p>}
        <div className="space-y-2">
          {subBlocks.map((hour) => {
            const hoursSignups = slot.signups.filter((s) => s.subBlockHour === hour);
            const mySignup = adminProfile ? hoursSignups.find((s) => s.volunteer.id === adminProfile.id) : null;
            const filled = hoursSignups.length;
            const isFull = filled >= slot.interpreterCount;
            const signupKey = `signup-${slot.id}-${hour}`;

            return (
              <div key={hour} className="rounded-md bg-stone-50 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-600 w-28">{formatHour(hour)} – {formatHour(hour + 1)}</span>
                    <span className="text-xs text-stone-400">{filled}/{slot.interpreterCount} filled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isPast && (
                      <button
                        onClick={() => {
                          setVolunteerAssignTarget({ slotId: slot.id, hour, language: slot.language, date: slot.date, clinicName: slot.clinic.name });
                          setAssignSearch("");
                          setAssignSelected(null);
                          setAssignError("");
                        }}
                        className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
                      >
                        Assign
                      </button>
                    )}
                    {isPast ? (
                      <span className="text-xs px-2 py-1 bg-stone-100 text-stone-400 rounded-md">Past</span>
                    ) : mySignup ? (
                      <button
                        disabled={actionLoading === mySignup.id}
                        onClick={() => cancelMySignup(mySignup.id)}
                        className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600 border border-emerald-200 hover:border-red-200 rounded-md font-medium transition-colors disabled:opacity-50"
                        title="Click to cancel"
                      >
                        {actionLoading === mySignup.id ? "..." : "Signed Up ✓"}
                      </button>
                    ) : isFull ? (
                      <span className="text-xs px-2 py-1 bg-stone-100 text-stone-400 rounded-md">Full</span>
                    ) : (
                      <button
                        disabled={actionLoading === signupKey || !canSignUp}
                        onClick={() => signUp(slot.id, hour)}
                        title={!canSignUp ? "Add this language to your volunteer profile first" : undefined}
                        className="text-xs px-3 py-1 bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-40"
                      >
                        {actionLoading === signupKey ? "..." : "Sign Up"}
                      </button>
                    )}
                  </div>
                </div>
                {/* Other volunteers signed up this hour */}
                {hoursSignups
                  .filter((s) => s.volunteer.id !== adminProfile?.id)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between pl-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">{s.volunteer.user.name ?? s.volunteer.user.email}</span>
                        <span className="text-xs text-stone-300">{s.volunteer.user.email}</span>
                      </div>
                      {!isPast && (
                        <button
                          disabled={actionLoading === s.id}
                          onClick={() => removeVolunteer(s.id)}
                          className="text-xs px-2 py-0.5 bg-red-50 text-red-500 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
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
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
            <p className="text-xs text-stone-400">Admin Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{session?.user?.email}</span>
            {session?.user?.role === "SUPER_ADMIN" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                Super Admin
              </span>
            )}
            <button
              onClick={() => router.push("/dashboard/volunteer")}
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Volunteer View
            </button>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Contact Us
            </a>
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
            { key: "slots" as Tab, label: "Browse Slots", count: 0 },
            { key: "pending" as Tab, label: "Pending", count: pendingUsers.length },
            { key: "users" as Tab, label: "All Users", count: users.length },
            { key: "clinics" as Tab, label: "Clinics", count: clinics.length },
            { key: "profile" as Tab, label: "My Profile", count: 0 },
            ...(session?.user?.role === "SUPER_ADMIN"
              ? [{ key: "access" as Tab, label: "Access Control", count: 0 }]
              : []),
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
                <span
                  className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    t.key === "pending" && t.count > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
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
        {tab === "slots" && (
          <div>
            {adminSelectedSlotIds.size > 0 && (
              <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm text-red-700 font-medium">{adminSelectedSlotIds.size} slot{adminSelectedSlotIds.size !== 1 ? "s" : ""} selected</span>
                <button
                  onClick={openAdminDeleteModal}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors"
                >
                  Delete Selected
                </button>
                <button
                  onClick={() => setAdminSelectedSlotIds(new Set())}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Clear selection
                </button>
              </div>
            )}
            {!adminProfile?.languages.length && (
              <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                To sign up for slots, add your languages in{" "}
                <button
                  onClick={() => setTab("profile")}
                  className="underline font-medium"
                >
                  My Profile
                </button>
                .
              </div>
            )}

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

              {/* Available only */}
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

            {upcomingSlots.length === 0 && pastSlots.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No slots match your filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingSlots.map((slot) => renderSlot(slot, false))}
                {pastSlots.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-stone-400 uppercase tracking-wider pt-2">Past Slots</p>
                    {pastSlots.map((slot) => renderSlot(slot, true))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pending Approvals */}
        {tab === "pending" && (
          <div>
            {pendingUsers.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div key={user.id} className="bg-white rounded-xl border border-stone-200 p-5 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-800">{user.name}</p>
                      <p className="text-sm text-stone-500">{user.email}</p>
                      <p className="text-xs text-stone-400 mt-1">
                        Applied {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={actionLoading === user.id}
                        onClick={() => updateUser(user.id, { status: "ACTIVE", role: "VOLUNTEER" })}
                        className="px-4 py-2 text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={actionLoading === user.id}
                        onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                        className="px-4 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Users */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Clinic</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Volunteer Stats</th>
                  <th className="text-right text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-stone-50 last:border-0">
                    <td className="px-5 py-3.5 text-sm text-stone-800">{user.name}</td>
                    <td className="px-5 py-3.5 text-sm text-stone-500">{user.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        user.role === "SUPER_ADMIN" ? "bg-violet-100 text-violet-800" :
                        user.role === "ADMIN" ? "bg-violet-50 text-violet-700" :
                        user.role === "CLINIC" ? "bg-blue-50 text-blue-700" :
                        user.role === "VOLUNTEER" ? "bg-emerald-50 text-emerald-700" :
                        "bg-stone-100 text-stone-500"
                      }`}>
                        {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        user.status === "ACTIVE" ? "bg-green-50 text-green-700" :
                        user.status === "SUSPENDED" ? "bg-red-50 text-red-600" :
                        "bg-amber-50 text-amber-700"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-stone-500">{user.clinic?.name || "—"}</td>
                    <td className="px-5 py-3.5">
                      {user.volunteer ? (
                        <div className="flex gap-3 text-xs text-stone-500">
                          <span title="Hours volunteered">⏱ {user.volunteer.hoursVolunteered}h</span>
                          <span title="No-shows" className={user.volunteer.noShows > 0 ? "text-red-500" : ""}>
                            NS {user.volunteer.noShows}
                          </span>
                          <span title="Cancellations within 24 hours" className={user.volunteer.cancellationsWithin24h > 0 ? "text-amber-600" : ""}>
                            24h {user.volunteer.cancellationsWithin24h}
                          </span>
                          <span title="Cancellations within 2 hours" className={user.volunteer.cancellationsWithin2h > 0 ? "text-red-500" : ""}>
                            2h {user.volunteer.cancellationsWithin2h}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-stone-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex gap-1 justify-end">
                        {user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || session?.user?.role === "SUPER_ADMIN") && (
                          <>
                            <select
                              className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600"
                              value={user.role}
                              onChange={(e) => updateUser(user.id, { role: e.target.value })}
                            >
                              <option value="VOLUNTEER">Volunteer</option>
                              <option value="CLINIC">Clinic</option>
                              {session?.user?.role === "SUPER_ADMIN" && (
                                <option value="ADMIN">Admin</option>
                              )}
                            </select>
                            {user.role === "CLINIC" && (
                              <button
                                onClick={() => setAssignModal({ userId: user.id, userName: user.name })}
                                className="text-xs px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                              >
                                Assign Clinic
                              </button>
                            )}
                            {user.status === "ACTIVE" ? (
                              <button
                                onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                                className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => updateUser(user.id, { status: "ACTIVE" })}
                                className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded transition-colors"
                              >
                                Activate
                              </button>
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

        {/* Clinics */}
        {tab === "clinics" && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowClinicForm(!showClinicForm)}
                className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors"
              >
                {showClinicForm ? "Cancel" : "+ Add Clinic"}
              </button>
            </div>

            {showClinicForm && (
              <div className="bg-white rounded-xl border border-stone-200 p-6 mb-4">
                <h3 className="text-sm font-medium text-stone-700 mb-4">New Clinic</h3>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    placeholder="Clinic Name"
                    value={clinicForm.name}
                    onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    placeholder="Address"
                    value={clinicForm.address}
                    onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    placeholder="Contact Name"
                    value={clinicForm.contactName}
                    onChange={(e) => setClinicForm({ ...clinicForm, contactName: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    placeholder="Contact Email"
                    value={clinicForm.contactEmail}
                    onChange={(e) => setClinicForm({ ...clinicForm, contactEmail: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                {clinicFormError && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {clinicFormError}
                  </p>
                )}
                <button
                  disabled={actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail}
                  onClick={createClinic}
                  className="mt-4 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {actionLoading === "clinic-form" ? "Creating..." : "Create Clinic"}
                </button>
              </div>
            )}

            {clinics.length === 0 && !showClinicForm ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No clinics yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clinics.map((clinic) => (
                  <div key={clinic.id} className="bg-white rounded-xl border border-stone-200 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-stone-800">{clinic.name}</h3>
                        <p className="text-sm text-stone-500 mt-0.5">{clinic.address}</p>
                        <p className="text-xs text-stone-400 mt-1">{clinic.contactName} · {clinic.contactEmail}</p>
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-md px-2 py-1">
                            <span className="text-xs text-stone-400">PIN</span>
                            <span className="text-xs font-mono font-semibold text-stone-400 tracking-widest">••••••</span>
                          </div>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/clinic-login/${clinic.loginToken}`;
                              navigator.clipboard.writeText(url);
                            }}
                            className="text-xs px-2 py-1 bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-600 rounded-md transition-colors"
                          >
                            Copy Login URL
                          </button>
                          <button
                            disabled={actionLoading === `pin-${clinic.id}`}
                            onClick={() => regeneratePin(clinic.id, clinic.name)}
                            className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 rounded-md transition-colors disabled:opacity-50"
                          >
                            Regenerate PIN
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-stone-400">{clinic._count?.slots || 0} slots</span>
                        <button
                          disabled={actionLoading === `delete-clinic-${clinic.id}`}
                          onClick={() => deleteClinic(clinic.id, clinic.name)}
                          className="text-xs px-2 py-1 bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 rounded-md transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Profile */}
        {tab === "profile" && (
          <div className="max-w-lg space-y-5">
            {/* Hours stat */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-semibold text-stone-800">{adminProfile?.hoursVolunteered ?? 0}</p>
                <p className="text-xs text-stone-400 mt-1">Hours Volunteered</p>
              </div>
            </div>

            {/* Language selection */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h3 className="text-sm font-medium text-stone-700 mb-1">Languages</h3>
              <p className="text-xs text-stone-400 mb-4">Click to toggle. Filled black = you speak it, white = you don&apos;t. Only matching slots will let you sign up.</p>
              <div className="flex gap-3 flex-wrap mb-6">
                {Object.entries(LANG_LABELS).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => toggleLanguage(code)}
                    className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                      profileForm.languages.includes(code)
                        ? "border-stone-800 bg-stone-800 text-white"
                        : "border-stone-200 text-stone-600 hover:border-stone-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  disabled={actionLoading === "profile"}
                  onClick={saveProfile}
                  className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {actionLoading === "profile" ? "Saving..." : "Save Profile"}
                </button>
                {profileSaved && (
                  <span className="text-sm text-emerald-600">Saved!</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Access Control — SUPER_ADMIN only */}
        {tab === "access" && session?.user?.role === "SUPER_ADMIN" && (
          <div className="max-w-lg space-y-5">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h3 className="text-sm font-medium text-stone-700 mb-1">Add Email Rule</h3>
              <p className="text-xs text-stone-400 mb-4">
                <strong>Allow</strong> lets a non-Georgetown email sign in. <strong>Block</strong> prevents any email from signing in, including Georgetown addresses.
              </p>
              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={ruleEmail}
                  onChange={(e) => setRuleEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
                <div className="flex gap-3">
                  {(["ALLOW", "BLOCK"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRuleType(t)}
                      className={`flex-1 py-2 text-sm rounded-md border transition-colors ${
                        ruleType === t
                          ? t === "ALLOW"
                            ? "bg-emerald-700 text-white border-emerald-700"
                            : "bg-red-600 text-white border-red-600"
                          : "border-stone-200 text-stone-600 hover:border-stone-400"
                      }`}
                    >
                      {t === "ALLOW" ? "Allow" : "Block"}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Note (optional)"
                  value={ruleNote}
                  onChange={(e) => setRuleNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
                <button
                  disabled={!ruleEmail.trim() || actionLoading === "email-rule"}
                  onClick={addEmailRule}
                  className="w-full py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {actionLoading === "email-rule" ? "Saving..." : "Add Rule"}
                </button>
              </div>
            </div>

            {emailRules.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
                {emailRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        rule.type === "ALLOW" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                      }`}>
                        {rule.type}
                      </span>
                      <span className="text-sm text-stone-800 truncate">{rule.email}</span>
                      {rule.note && <span className="text-xs text-stone-400 truncate">{rule.note}</span>}
                    </div>
                    <button
                      disabled={actionLoading === `rule-${rule.id}`}
                      onClick={() => removeEmailRule(rule.id)}
                      className="shrink-0 text-xs px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-500 rounded transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {emailRules.length === 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
                <p className="text-stone-400 text-sm">No rules yet. All Georgetown emails can sign in by default.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Delete Slots Modal */}
      {adminDeleteModal && (() => {
        const selectedSlotsList = upcomingSlots.filter((s) => adminSelectedSlotIds.has(s.id));
        const isSingle = selectedSlotsList.length === 1;
        const confirmText = isSingle
          ? `${selectedSlotsList[0].clinic.name} ${selectedSlotsList[0].date.slice(0, 10)}`
          : "DELETE";

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-stone-100">
                <h3 className="text-sm font-semibold text-stone-800">Delete {selectedSlotsList.length} Slot{selectedSlotsList.length !== 1 ? "s" : ""}</h3>
                <p className="text-xs text-stone-400 mt-0.5">This will cancel the slot and notify any signed-up volunteers.</p>
              </div>
              <div className="px-6 py-4">
                <div className="max-h-40 overflow-y-auto space-y-1 mb-4">
                  {selectedSlotsList.map((s) => (
                    <div key={s.id} className="text-xs text-stone-600 py-1 border-b border-stone-50 last:border-0">
                      <span className="font-medium">{s.clinic.name}</span> · {formatDate(s.date)} · {formatHour(s.startTime)}–{formatHour(s.endTime)} · {LANG_LABELS[s.language]}
                      {s.signups.length > 0 && (
                        <span className="ml-1 text-amber-600">({s.signups.length} volunteer{s.signups.length !== 1 ? "s" : ""} affected)</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                  <p className="text-xs text-amber-800">
                    {isSingle
                      ? <>To confirm, type the clinic name and date: <strong>{confirmText}</strong></>
                      : <>To confirm, type: <strong>DELETE</strong></>}
                  </p>
                </div>
                <input
                  autoFocus
                  type="text"
                  placeholder={confirmText}
                  value={adminDeleteInput}
                  onChange={(e) => setAdminDeleteInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAdminDeleteModal(false); setAdminDeleteInput(""); }}
                    className="flex-1 px-4 py-2 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={adminDeleteInput.trim() !== confirmText || actionLoading === "admin-batch-delete"}
                    onClick={confirmAdminDeleteSlots}
                    className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "admin-batch-delete" ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Assign Volunteer to Shift Modal */}
      {volunteerAssignTarget && (() => {
        const activeVolunteers = users.filter(
          (u) =>
            (u.role === "VOLUNTEER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN") &&
            u.status === "ACTIVE"
        );
        const searchLower = assignSearch.toLowerCase();
        const filtered = activeVolunteers.filter(
          (u) =>
            (u.name?.toLowerCase().includes(searchLower) ?? false) ||
            u.email.toLowerCase().includes(searchLower)
        );
        const targetSlot = adminSlots.find((s) => s.id === volunteerAssignTarget.slotId);

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
              {/* Header */}
              <div className="px-6 py-4 border-b border-stone-100">
                <h3 className="text-sm font-semibold text-stone-800">Assign a Volunteer</h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  {LANG_LABELS[volunteerAssignTarget.language]} &middot; {formatDate(volunteerAssignTarget.date)} &middot; {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)} &middot; {volunteerAssignTarget.clinicName}
                </p>
              </div>

              {!assignSelected ? (
                /* Step 1: search and select */
                <div className="px-6 py-4">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search by name or email..."
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 mb-3"
                  />
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {filtered.length === 0 && (
                      <p className="text-xs text-stone-400 text-center py-6">No volunteers found.</p>
                    )}
                    {filtered.map((u) => {
                      const alreadySigned = targetSlot?.signups.some(
                        (sg) =>
                          sg.subBlockHour === volunteerAssignTarget.hour &&
                          sg.volunteer.user.email === u.email
                      );
                      return (
                        <button
                          key={u.id}
                          disabled={!!alreadySigned}
                          onClick={() =>
                            setAssignSelected({ userId: u.id, name: u.name ?? u.email, email: u.email })
                          }
                          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-transparent hover:border-stone-200"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-stone-800 truncate">{u.name ?? "—"}</p>
                              <p className="text-xs text-stone-400 truncate">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {alreadySigned && (
                                <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full">Signed up</span>
                              )}
                              {u.volunteer?.languages?.map((l) => (
                                <span key={l} className={`text-xs px-1.5 py-0.5 rounded-full ${LANG_COLORS[l] ?? "bg-stone-100 text-stone-500"}`}>
                                  {LANG_LABELS[l] ?? l}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={closeAssignModal}
                    className="mt-4 text-xs text-stone-400 hover:text-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                /* Step 2: confirm */
                <div className="px-6 py-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                    <p className="text-xs font-semibold text-amber-800 mb-2">Confirm Assignment</p>
                    <p className="text-sm text-amber-900">
                      Assign <strong>{assignSelected.name}</strong> to this shift?
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">{assignSelected.email}</p>
                    <div className="mt-2 pt-2 border-t border-amber-200 text-xs text-amber-700 space-y-0.5">
                      <p>{LANG_LABELS[volunteerAssignTarget.language]} · {volunteerAssignTarget.clinicName}</p>
                      <p>{formatDate(volunteerAssignTarget.date)} · {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)}</p>
                      <p className="mt-1 text-amber-600">They will receive a calendar invite.</p>
                    </div>
                  </div>
                  {assignError && (
                    <p className="text-xs text-red-600 mb-3">{assignError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAssignSelected(null); setAssignError(""); }}
                      className="flex-1 px-4 py-2 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      disabled={assignLoading}
                      onClick={assignVolunteer}
                      className="flex-1 px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                    >
                      {assignLoading ? "Assigning..." : "Confirm Assignment"}
                    </button>
                  </div>
                  <button
                    onClick={closeAssignModal}
                    className="mt-3 text-xs text-stone-400 hover:text-stone-600 w-full text-center"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* PIN Reveal Modal */}
      {pinReveal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-semibold text-stone-800 mb-1">New PIN for {pinReveal.clinicName}</h3>
            <p className="text-xs text-stone-400 mb-4">
              Copy this PIN now — it cannot be shown again. Share it with the clinic directly.
            </p>
            <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 mb-4">
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-stone-800">{pinReveal.pin}</span>
              <button
                onClick={() => navigator.clipboard.writeText(pinReveal.pin)}
                className="ml-auto text-xs px-2 py-1 bg-stone-200 hover:bg-stone-300 text-stone-600 rounded transition-colors"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setPinReveal(null)}
              className="w-full px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Assign Clinic Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-medium text-stone-700 mb-3">
              Assign {assignModal.userName} to a clinic
            </h3>
            <div className="space-y-2">
              {clinics.map((clinic) => (
                <button
                  key={clinic.id}
                  onClick={async () => {
                    await updateUser(assignModal.userId, { clinicId: clinic.id });
                    setAssignModal(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
                >
                  {clinic.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAssignModal(null)}
              className="mt-4 text-xs text-stone-400 hover:text-stone-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
