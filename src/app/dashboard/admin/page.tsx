"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";

type VolunteerStats = {
  languages: string[];
  hoursVolunteered: number;
  cancellationsWithin24h: number;
  cancellationsWithin2h: number;
  noShows: number;
  isCleared: boolean;
  clearedAt: string | null;
  clearanceLogs: { isCleared: boolean; clearedBy: { name: string | null; email: string }; createdAt: string }[];
};

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
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
  loginPin: string;
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
type LanguageConfig = { id: string; code: string; name: string; isActive: boolean; createdAt: string; volunteerCount?: number };
type TrainingMaterial = { id: string; title: string; description: string | null; type: string; url: string; fileName: string | null; languageCode: string | null; category: string; uploadedBy: { name: string | null; email: string }; createdAt: string };
type Metrics = { totalHours: number; hoursByLanguage: { code: string; name: string; hours: number }[]; hoursByClinic: { clinicId: string; clinicName: string; hours: number }[]; volunteerCount: number; activeSlotCount: number; feedbackCount?: number; avgVolunteerRating?: number | null; avgClinicRating?: number | null };
type FeatureFlag = { id: string; key: string; label: string; description: string | null; enabled: boolean };
type Tab = "slots" | "users" | "clinics" | "profile" | "access" | "languages" | "metrics" | "training" | "flags" | "suggestions";

type AdminFeedback = {
  id: string;
  authorRole: string;
  rating: number | null;
  note: string;
  createdAt: string;
  signup: {
    slot: { date: string; language: string; clinic: { name: string } };
    volunteer: { user: { name: string | null; email: string } };
  };
};

type Suggestion = {
  id: string;
  type: string;
  subject: string;
  message: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  submittedBy: { name: string | null; email: string } | null;
};

const LANG_LABELS: Record<string, string> = { ES: "Spanish", ZH: "Chinese", KO: "Korean" };
const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-[#EBF3FC] text-[#041E42]",
};

function MapsLinks({ address }: { address: string }) {
  const q = encodeURIComponent(address);
  return (
    <span style={{ display: "inline-flex", gap: "6px", marginLeft: "6px", alignItems: "center" }}>
      <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.72rem", color: "var(--blue)", textDecoration: "underline" }} title="Google Maps">G Maps</a>
      <span style={{ color: "#CBD5E1" }}>·</span>
      <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.72rem", color: "var(--blue)", textDecoration: "underline" }} title="Apple Maps">Apple Maps</a>
    </span>
  );
}

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
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [langForm, setLangForm] = useState({ code: "", name: "" });
  const [langFormError, setLangFormError] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [trainingForm, setTrainingForm] = useState({ title: "", description: "", type: "LINK" as "LINK" | "FILE", url: "", languageCode: "", category: "General" });
  const [trainingFile, setTrainingFile] = useState<File | null>(null);
  const [trainingFormError, setTrainingFormError] = useState("");
  const [trainingSubmitting, setTrainingSubmitting] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [allFeedback, setAllFeedback] = useState<AdminFeedback[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailStatus, setTestEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [langDeactivateConflict, setLangDeactivateConflict] = useState<{ langId: string; langName: string; conflicts: { id: string; clinicName: string; date: string; language: string }[] } | null>(null);
  const [langDeactivateLoading, setLangDeactivateLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState<Set<string>>(new Set());
  const [addRoleTarget, setAddRoleTarget] = useState<string | null>(null);
  const [addRoleDropdownPos, setAddRoleDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [volunteerRemoveWarning, setVolunteerRemoveWarning] = useState<{ userId: string; userName: string; upcomingCount: number } | null>(null);
  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);
  const [pinVisible, setPinVisible] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!addRoleTarget) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-role-add-dropdown]") && !t.closest("[data-role-add-btn]")) {
        setAddRoleTarget(null);
        setAddRoleDropdownPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addRoleTarget]);

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
      fetch("/api/admin/languages"),
      fetch("/api/admin/metrics"),
      fetch("/api/training"),
      fetch("/api/admin/feedback"),
      fetch("/api/suggestions"),
    ];
    if (isSuperAdmin) {
      fetches.push(fetch("/api/admin/email-rules"));
      fetches.push(fetch("/api/admin/feature-flags"));
    }

    const [usersRes, clinicsRes, slotsRes, profileRes, langsRes, metricsRes, trainingRes, feedbackRes, suggestionsRes, rulesRes, flagsRes] = await Promise.all(fetches);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (clinicsRes.ok) setClinics(await clinicsRes.json());
    if (slotsRes.ok) setAdminSlots(await slotsRes.json());
    if (profileRes.ok) {
      const p = await profileRes.json();
      setAdminProfile(p);
      setProfileForm({ languages: p.languages ?? [] });
    }
    if (langsRes?.ok) setLanguages(await langsRes.json());
    if (metricsRes?.ok) setMetrics(await metricsRes.json());
    if (trainingRes?.ok) setTrainingMaterials(await trainingRes.json());
    if (feedbackRes?.ok) setAllFeedback(await feedbackRes.json());
    if (suggestionsRes?.ok) setSuggestions(await suggestionsRes.json());
    if (rulesRes?.ok) setEmailRules(await rulesRes.json());
    if (flagsRes?.ok) setFeatureFlags(await flagsRes.json());
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

  const setClearance = async (userId: string, isCleared: boolean) => {
    setActionLoading(`clearance-${userId}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isCleared }),
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

  const createLanguage = async () => {
    setLangFormError("");
    const res = await fetch("/api/admin/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: langForm.name.trim() }),
    });
    if (res.ok) {
      const lang = await res.json();
      setLanguages((prev) => [...prev, lang].sort((a, b) => a.name.localeCompare(b.name)));
      setLangForm({ code: "", name: "" });
    } else {
      const data = await res.json().catch(() => ({}));
      setLangFormError(data.error ?? "Could not add language.");
    }
  };

  const toggleLanguageActive = async (id: string, newIsActive: boolean, langName: string) => {
    if (!newIsActive) {
      // Deactivating - check for conflicts first
      const res = await fetch(`/api/admin/languages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setLangDeactivateConflict({ langId: id, langName, conflicts: data.conflicts });
        return;
      }
      if (res.ok) {
        const updated = await res.json();
        setLanguages((prev) => prev.map((l) => (l.id === id ? updated : l)));
      }
    } else {
      // Activating - straightforward
      const res = await fetch(`/api/admin/languages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLanguages((prev) => prev.map((l) => (l.id === id ? updated : l)));
      }
    }
  };

  const forceDeactivateLanguage = async () => {
    if (!langDeactivateConflict) return;
    setLangDeactivateLoading(true);
    const res = await fetch(`/api/admin/languages/${langDeactivateConflict.langId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false, force: true }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLanguages((prev) => prev.map((l) => (l.id === langDeactivateConflict.langId ? updated : l)));
      setLangDeactivateConflict(null);
    }
    setLangDeactivateLoading(false);
  };

  const submitTraining = async () => {
    setTrainingFormError("");
    setTrainingSubmitting(true);
    try {
      let url = trainingForm.url;
      let fileName: string | null = null;

      if (trainingForm.type === "FILE") {
        if (!trainingFile) {
          setTrainingFormError("Please select a file.");
          setTrainingSubmitting(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", trainingFile);
        const uploadRes = await fetch("/api/training/upload", { method: "POST", body: fd });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          setTrainingFormError(err.error ?? "File upload failed.");
          setTrainingSubmitting(false);
          return;
        }
        const uploadData = await uploadRes.json();
        url = uploadData.url;
        fileName = uploadData.fileName;
      }

      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trainingForm.title,
          description: trainingForm.description || null,
          type: trainingForm.type,
          url,
          fileName,
          languageCode: trainingForm.languageCode || null,
          category: trainingForm.category || "General",
        }),
      });
      if (res.ok) {
        const material = await res.json();
        setTrainingMaterials((prev) => [material, ...prev]);
        setTrainingForm({ title: "", description: "", type: "LINK", url: "", languageCode: "", category: "General" });
        setTrainingFile(null);
        setShowTrainingForm(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setTrainingFormError(err.error ?? "Could not add material.");
      }
    } finally {
      setTrainingSubmitting(false);
    }
  };

  const deleteTraining = async (id: string) => {
    if (!confirm("Delete this training material?")) return;
    const res = await fetch(`/api/training/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTrainingMaterials((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    const res = await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFeatureFlags((prev) => prev.map((f) => (f.key === key ? updated : f)));
    }
  };

  const sendTestEmailFn = async () => {
    if (!testEmailTo.trim()) return;
    setTestEmailStatus("sending");
    const res = await fetch("/api/admin/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testEmailTo.trim() }),
    });
    if (res.ok) {
      setTestEmailStatus("sent");
      setTimeout(() => setTestEmailStatus("idle"), 3000);
    } else {
      setTestEmailStatus("error");
      setTimeout(() => setTestEmailStatus("idle"), 3000);
    }
  };

  const updateSuggestionStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    }
  };

  const updateSuggestionNote = async (id: string, adminNote: string) => {
    const res = await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNote }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    }
  };

  const pendingUsers = users.filter((u) => u.status === "PENDING_APPROVAL");

  // ── Role chip helpers ────────────────────────────────────────────
  const ROLE_CHIPS = [
    { key: "SUPER_ADMIN", label: "Super Admin", bg: "#EDE9FE", color: "#5B21B6", border: "#DDD6FE" },
    { key: "ADMIN",       label: "Admin",       bg: "#F5F3FF", color: "#6D28D9", border: "#EDE9FE" },
    { key: "VOLUNTEER",   label: "Volunteer",   bg: "#DCFCE7", color: "#15803D", border: "#BBF7D0" },
    { key: "INSTRUCTOR",  label: "Instructor",  bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
    { key: "PENDING",     label: "Unassigned",  bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" },
  ] as const;

  const LANG_LABELS_MAP: Record<string, string> = {
    ES: "Spanish", ZH: "Mandarin", KO: "Korean", AR: "Arabic", FR: "French",
    HI: "Hindi", PT: "Portuguese", RU: "Russian", DE: "German", JA: "Japanese",
    VI: "Vietnamese", IT: "Italian", PL: "Polish", TR: "Turkish", UK: "Ukrainian",
    FA: "Persian", UR: "Urdu", BN: "Bengali", SW: "Swahili", TL: "Filipino",
  };

  function getLangLabel(code: string) {
    return LANG_LABELS_MAP[code] ?? code;
  }

  function parseUserRoles(roles: string[]) {
    const roleChips: string[] = [];
    const langMap: Record<string, boolean> = {};
    for (const r of roles) {
      if (r.startsWith("LANG_")) {
        const cleared = r.endsWith("_CLEARED");
        const code = cleared ? r.slice(5, -8) : r.slice(5);
        langMap[code] = cleared;
      } else {
        roleChips.push(r);
      }
    }
    const langChips = Object.entries(langMap).map(([code, cleared]) => ({ code, cleared }));
    return { roleChips, langChips };
  }

  const handleAddRole = async (userId: string, role: string) => {
    setRoleActionLoading(`add-${userId}-${role}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, addRole: role }),
    });
    if (res.ok) await fetchData();
    setAddRoleTarget(null);
    setRoleActionLoading(null);
  };

  const handleRemoveRole = async (userId: string, role: string, confirm?: boolean) => {
    setRoleActionLoading(`remove-${userId}-${role}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, removeRole: role, confirmRemoveVolunteer: confirm }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.needsConfirm) {
        const u = users.find((x) => x.id === userId);
        setVolunteerRemoveWarning({ userId, userName: u?.name ?? userId, upcomingCount: data.upcomingCount });
        setRoleActionLoading(null);
        return;
      }
      await fetchData();
    }
    setRoleActionLoading(null);
  };

  const handleToggleLangClearance = async (userId: string, langCode: string) => {
    setRoleActionLoading(`lang-${userId}-${langCode}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, toggleLanguageClearance: langCode }),
    });
    if (res.ok) await fetchData();
    setRoleActionLoading(null);
  };
  // ─────────────────────────────────────────────────────────────────

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading...</p>
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
    const openCount = subBlocks.filter((h) => slot.signups.filter((s) => s.subBlockHour === h).length < slot.interpreterCount).length;

    return (
      <div key={slot.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.5 : 1 }}>
        {/* Card header */}
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
            <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-600)", marginTop: "3px" }}>
              {LANG_LABELS[slot.language] ?? slot.language}
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
              {openCount} open
              <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, marginTop: "2px", opacity: 0.8 }}>slots</span>
            </div>
          )}
        </div>
        {slot.notes && (
          <div style={{ padding: "8px 22px", fontSize: "0.82rem", color: "var(--gray-600)", fontStyle: "italic", borderBottom: "1px solid var(--card-border)" }}>
            {slot.notes}
          </div>
        )}
        {/* Hour rows */}
        {subBlocks.map((hour) => {
          const hoursSignups = slot.signups.filter((s) => s.subBlockHour === hour);
          const mySignup = adminProfile ? hoursSignups.find((s) => s.volunteer.id === adminProfile.id) : null;
          const otherSignups = hoursSignups.filter((s) => s.volunteer.id !== adminProfile?.id);
          const filled = hoursSignups.length;
          const isFull = filled >= slot.interpreterCount;
          const signupKey = `signup-${slot.id}-${hour}`;
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
                  ) : (
                    <button
                      disabled={actionLoading === signupKey || !canSignUp}
                      onClick={() => signUp(slot.id, hour)}
                      title={!canSignUp ? "Add this language to your volunteer profile first" : undefined}
                      style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", opacity: (actionLoading === signupKey || !canSignUp) ? 0.4 : 1, whiteSpace: "nowrap" }}
                    >
                      {actionLoading === signupKey ? "..." : "Sign Up"}
                    </button>
                  )}
                </div>
              </div>
              {otherSignups.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 22px 8px 48px", borderBottom: "1px solid var(--card-border)", background: "rgba(0,0,0,.02)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--gray-600)" }}>{s.volunteer.user.name ?? s.volunteer.user.email}</span>
                    <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>{s.volunteer.user.email}</span>
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
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--gray-900)" }}>
      {/* Header */}
      <header style={{ background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "linear-gradient(135deg,#2563EB,#60A5FA)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: "1rem", flexShrink: 0 }}>
            G
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
            <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>Admin Dashboard</div>
          </div>
          <button
            onClick={() => setTab("suggestions")}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer" }}
          >
            Contact Us
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ color: "#CBD5E1", fontSize: "0.82rem" }}>{session?.user?.email}</span>
          {session?.user?.role === "SUPER_ADMIN" && (
            <span style={{ fontSize: "0.72rem", padding: "2px 10px", borderRadius: "99px", background: "rgba(167,139,250,.2)", color: "#ddd6fe", fontWeight: 600 }}>
              Super Admin
            </span>
          )}
          <button
            onClick={() => router.push("/dashboard/volunteer")}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: "14px", height: "14px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Volunteer View
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 32px 0" }}>
        <div style={{ display: "flex", gap: "4px", marginBottom: "28px", background: "var(--card-bg)", padding: "5px", borderRadius: "12px", width: "fit-content", border: "1px solid var(--card-border)", flexWrap: "wrap" }}>
          {[
            { key: "slots" as Tab, label: "Browse Slots", count: 0 },
            { key: "users" as Tab, label: "All Users", count: users.length, pendingCount: pendingUsers.length },
            { key: "clinics" as Tab, label: "Clinics", count: clinics.length },
            { key: "profile" as Tab, label: "My Profile", count: 0 },
            { key: "languages" as Tab, label: "Languages", count: 0 },
            { key: "metrics" as Tab, label: "Metrics", count: 0 },
            { key: "training" as Tab, label: "Training", count: 0 },
            { key: "suggestions" as Tab, label: "Messages", count: suggestions.filter((s) => s.status === "OPEN").length },
            ...(session?.user?.role === "SUPER_ADMIN"
              ? [
                  { key: "access" as Tab, label: "Access Control", count: 0 },
                  { key: "flags" as Tab, label: "Feature Flags", count: 0 },
                ]
              : []),
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "9px 20px",
                borderRadius: "9px",
                fontSize: "0.9rem",
                fontWeight: tab === t.key ? 600 : 500,
                cursor: "pointer",
                border: "none",
                background: tab === t.key ? "var(--blue)" : "none",
                color: tab === t.key ? "#fff" : "var(--gray-600)",
                whiteSpace: "nowrap",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {t.label}
              {("pendingCount" in t) && (t as { pendingCount: number }).pendingCount > 0 ? (
                <span style={{ background: "#DC2626", color: "#fff", fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px", borderRadius: "99px", marginLeft: "5px" }}>
                  {(t as { pendingCount: number }).pendingCount}
                </span>
              ) : t.count > 0 ? (
                <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "1px 7px", borderRadius: "99px", marginLeft: "5px" }}>
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 32px 36px" }}>

        {/* Browse Slots */}
        {tab === "slots" && (
          <div>
            {adminSelectedSlotIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px" }}>
                <span style={{ fontSize: "0.875rem", color: "#B91C1C", fontWeight: 600 }}>{adminSelectedSlotIds.size} slot{adminSelectedSlotIds.size !== 1 ? "s" : ""} selected</span>
                <button
                  onClick={openAdminDeleteModal}
                  style={{ padding: "6px 14px", fontSize: "0.75rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Delete Selected
                </button>
                <button
                  onClick={() => setAdminSelectedSlotIds(new Set())}
                  style={{ fontSize: "0.75rem", color: "#EF4444", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Clear selection
                </button>
              </div>
            )}
            {!adminProfile?.languages.length && (
              <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", fontSize: "0.875rem", color: "#92400E" }}>
                To sign up for slots, add your languages in{" "}
                <button
                  onClick={() => setTab("profile")}
                  style={{ textDecoration: "underline", fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: "#92400E", fontFamily: "'DM Sans', sans-serif" }}
                >
                  My Profile
                </button>
                .
              </div>
            )}

            {/* Filters */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
              {["ALL", ...languages.filter((l) => l.isActive).map((l) => l.code)].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLangFilter(lang)}
                  style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: langFilter === lang ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", background: langFilter === lang ? "var(--blue)" : "var(--card-bg)", color: langFilter === lang ? "#fff" : "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                >
                  {lang === "ALL" ? "All Languages" : (languages.find((l) => l.code === lang)?.name ?? LANG_LABELS[lang] ?? lang)}
                </button>
              ))}

              <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />

              <select
                value={clinicFilter}
                onChange={(e) => setClinicFilter(e.target.value)}
                style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", outline: "none" }}
              >
                <option value="ALL">All Clinics</option>
                {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />

              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ padding: "9px 12px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "var(--card-bg)" }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  style={{ fontSize: "0.8rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >Clear</button>
              )}

              <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />

              <button
                onClick={() => setAvailableOnly(!availableOnly)}
                style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: availableOnly ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)", background: availableOnly ? "var(--green)" : "var(--card-bg)", color: availableOnly ? "#fff" : "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
              >
                Available Only
              </button>
            </div>

            {upcomingSlots.length === 0 && pastSlots.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No slots match your filters.</p>
              </div>
            ) : (
              <div>
                {upcomingSlots.map((slot) => renderSlot(slot, false))}
                {pastSlots.length > 0 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "32px 0 16px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--gray-400)" }}>
                      <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                      Past Slots
                      <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                    </div>
                    {pastSlots.map((slot) => renderSlot(slot, true))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* All Users */}
        {tab === "users" && (
          <div>
            {/* Filter bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setRoleFilterOpen(!roleFilterOpen)}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "0.82rem", fontWeight: 500, border: roleFilter.length > 0 ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", borderRadius: "9px", background: roleFilter.length > 0 ? "#EFF6FF" : "var(--card-bg)", color: roleFilter.length > 0 ? "var(--blue)" : "var(--gray-900)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filter{roleFilter.length > 0 && ` (${roleFilter.length})`}
                </button>
                {roleFilterOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "12px", padding: "12px", minWidth: "220px", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-400)", marginBottom: "8px" }}>Roles</p>
                    {(["SUPER_ADMIN","ADMIN","VOLUNTEER","INSTRUCTOR","PENDING","SUSPENDED"] as const).map(r => (
                      <label key={r} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 4px", cursor: "pointer", fontSize: "0.82rem", color: "var(--gray-900)" }}>
                        <input type="checkbox" checked={roleFilter.includes(r)} onChange={() => setRoleFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} style={{ accentColor: "var(--blue)", width: "14px", height: "14px" }} />
                        {r === "SUPER_ADMIN" ? "Super Admin" : r === "PENDING" ? "Unassigned" : r.charAt(0) + r.slice(1).toLowerCase()}
                      </label>
                    ))}
                    <div style={{ borderTop: "1px solid var(--card-border)", marginTop: "8px", paddingTop: "8px" }}>
                      <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-400)", marginBottom: "8px" }}>Languages</p>
                      {["ES","ZH","KO","AR","FR","HI","PT","RU","DE","JA","VI"].map(code => (
                        <label key={code} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 4px", cursor: "pointer", fontSize: "0.82rem", color: "var(--gray-900)" }}>
                          <input type="checkbox" checked={roleFilter.includes(`LANG_${code}`)} onChange={() => setRoleFilter(prev => prev.includes(`LANG_${code}`) ? prev.filter(x => x !== `LANG_${code}`) : [...prev, `LANG_${code}`])} style={{ accentColor: "var(--blue)", width: "14px", height: "14px" }} />
                          {getLangLabel(code)}
                        </label>
                      ))}
                    </div>
                    {roleFilter.length > 0 && (
                      <button onClick={() => setRoleFilter([])} style={{ marginTop: "8px", width: "100%", padding: "6px", fontSize: "0.78rem", color: "var(--gray-500)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear all</button>
                    )}
                  </div>
                )}
              </div>
              {roleFilter.map(f => (
                <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600, background: "#EFF6FF", color: "var(--blue)", borderRadius: "6px", border: "1px solid #BFDBFE" }}>
                  {f.startsWith("LANG_") ? getLangLabel(f.slice(5)) : f === "SUPER_ADMIN" ? "Super Admin" : f === "PENDING" ? "Unassigned" : f.charAt(0) + f.slice(1).toLowerCase()}
                  <button onClick={() => setRoleFilter(prev => prev.filter(x => x !== f))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--blue)", fontSize: "0.85rem", lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>

            {/* Language clearance legend */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px", padding: "8px 14px", background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", fontSize: "0.75rem", color: "var(--gray-500)", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "var(--gray-600)" }}>Language Clearance:</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
                Green dot = cleared to interpret
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#94A3B8", flexShrink: 0 }} />
                Gray dot = awaiting clearance
              </span>
              <span style={{ color: "var(--gray-400)" }}>Click a language chip to toggle clearance.</span>
            </div>

            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--card-border)" }}>
                    <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Name</th>
                    <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Email</th>
                    <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Roles</th>
                    <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Languages</th>
                    <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Stats</th>
                    <th style={{ textAlign: "right", fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sorted = [...users].sort((a, b) => {
                      if (a.status === "PENDING_APPROVAL" && b.status !== "PENDING_APPROVAL") return -1;
                      if (a.status !== "PENDING_APPROVAL" && b.status === "PENDING_APPROVAL") return 1;
                      return 0;
                    });
                    if (roleFilter.length === 0) return sorted;
                    return sorted.filter(u =>
                      roleFilter.every(f => {
                        if (f === "SUSPENDED") return u.status === "SUSPENDED";
                        if (f.startsWith("LANG_")) {
                          const code = f.slice(5);
                          return (u.roles ?? []).some(r => r === `LANG_${code}` || r === `LANG_${code}_CLEARED`);
                        }
                        return (u.roles ?? []).includes(f);
                      })
                    );
                  })().map((user) => {
                    const { roleChips, langChips } = parseUserRoles(user.roles ?? []);
                    const isSuperAdmin = user.role === "SUPER_ADMIN";
                    const canModify = !isSuperAdmin && (session?.user?.role === "SUPER_ADMIN" || user.role !== "ADMIN");
                    const emailFull = user.email ?? "";
                    const isExpanded = emailExpanded.has(user.id);
                    const addableRoles = ROLE_CHIPS.filter(r => {
                      if (roleChips.includes(r.key)) return false;
                      if ((r.key === "SUPER_ADMIN" || r.key === "ADMIN") && session?.user?.role !== "SUPER_ADMIN") return false;
                      if (isSuperAdmin) return false;
                      return true;
                    });
                    return (
                      <tr key={user.id} style={{ borderBottom: "1px solid var(--card-border)", background: user.status === "PENDING_APPROVAL" ? "rgba(251,191,36,.06)" : "transparent" }}>

                        {/* Name */}
                        <td style={{ padding: "14px 20px", fontSize: "0.875rem", color: "var(--gray-900)", fontWeight: 500, whiteSpace: "nowrap" }}>{user.name}</td>

                        {/* Email — truncated, click to expand */}
                        <td style={{ padding: "14px 20px" }}>
                          <button
                            onClick={() => setEmailExpanded(prev => { const n = new Set(prev); isExpanded ? n.delete(user.id) : n.add(user.id); return n; })}
                            title={emailFull}
                            style={{ fontSize: "0.82rem", color: "var(--gray-600)", background: "none", border: "none", cursor: emailFull.length > 18 ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", padding: 0, textAlign: "left" }}
                          >
                            {isExpanded ? emailFull : emailFull.length > 18 ? `${emailFull.slice(0, 18)}…` : emailFull}
                          </button>
                        </td>

                        {/* Roles — Discord chips */}
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                            {user.status === "SUSPENDED" && (
                              <span style={{ display: "inline-flex", alignItems: "center", fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                                Suspended
                              </span>
                            )}
                            {roleChips.map(r => {
                              const chip = ROLE_CHIPS.find(c => c.key === r);
                              const label  = chip?.label  ?? (r === "PENDING" ? "Unassigned" : r.charAt(0) + r.slice(1).toLowerCase());
                              const bg     = chip?.bg     ?? "#F1F5F9";
                              const color  = chip?.color  ?? "#475569";
                              const border = chip?.border ?? "#CBD5E1";
                              const isLoading = roleActionLoading === `remove-${user.id}-${r}`;
                              return (
                                <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.72rem", padding: "2px 6px 2px 8px", borderRadius: "99px", fontWeight: 600, background: bg, color, border: `1px solid ${border}` }}>
                                  {label}
                                  {canModify && r !== "PENDING" && (
                                    <button
                                      onClick={() => handleRemoveRole(user.id, r)}
                                      disabled={!!isLoading}
                                      title={`Remove ${label}`}
                                      style={{ background: "none", border: "none", cursor: "pointer", color, opacity: isLoading ? 0.4 : 0.55, fontSize: "0.9rem", lineHeight: 1, padding: "0 1px", fontFamily: "'DM Sans', sans-serif" }}
                                    >×</button>
                                  )}
                                </span>
                              );
                            })}
                            {/* + Add role */}
                            {canModify && addableRoles.length > 0 && (
                              <button
                                data-role-add-btn="true"
                                onClick={(e) => {
                                  if (addRoleTarget === user.id) {
                                    setAddRoleTarget(null);
                                    setAddRoleDropdownPos(null);
                                  } else {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setAddRoleTarget(user.id);
                                    setAddRoleDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
                                  }
                                }}
                                title="Add role"
                                style={{ width: "20px", height: "20px", borderRadius: "99px", border: "1.5px dashed var(--gray-300)", background: "none", cursor: "pointer", color: "var(--gray-400)", fontSize: "1rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}
                              >+</button>
                            )}
                          </div>
                        </td>

                        {/* Languages */}
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {langChips.map(({ code, cleared }) => {
                              const isLoading = roleActionLoading === `lang-${user.id}-${code}`;
                              return (
                                <button
                                  key={code}
                                  onClick={() => handleToggleLangClearance(user.id, code)}
                                  disabled={isLoading}
                                  title={cleared ? `${getLangLabel(code)} — Cleared. Click to revoke.` : `${getLangLabel(code)} — Not cleared. Click to clear.`}
                                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, cursor: "pointer", opacity: isLoading ? 0.5 : 1, background: cleared ? "#F0FDFA" : "#FAFAFA", color: cleared ? "#0F766E" : "#64748B", border: cleared ? "1px solid #99F6E4" : "1px solid #CBD5E1", fontFamily: "'DM Sans', sans-serif" }}
                                >
                                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: cleared ? "#10B981" : "#94A3B8", flexShrink: 0 }} />
                                  {getLangLabel(code)}
                                </button>
                              );
                            })}
                            {langChips.length === 0 && <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>—</span>}
                          </div>
                        </td>

                        {/* Stats */}
                        <td style={{ padding: "14px 20px" }}>
                          {user.volunteer ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.75rem" }}>
                              <span style={{ color: "var(--gray-600)" }}>⏱ {user.volunteer.hoursVolunteered}h</span>
                              {user.volunteer.noShows > 0 && <span style={{ color: "#EF4444" }}>NS {user.volunteer.noShows}</span>}
                              {(user.volunteer.cancellationsWithin24h > 0 || user.volunteer.cancellationsWithin2h > 0) && (
                                <span style={{ color: "#D97706" }}>
                                  {user.volunteer.cancellationsWithin24h > 0 && `24h ${user.volunteer.cancellationsWithin24h}`}
                                  {user.volunteer.cancellationsWithin24h > 0 && user.volunteer.cancellationsWithin2h > 0 && " · "}
                                  {user.volunteer.cancellationsWithin2h > 0 && `2h ${user.volunteer.cancellationsWithin2h}`}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          {user.status === "PENDING_APPROVAL" ? (
                            <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                              <button
                                disabled={actionLoading === user.id}
                                onClick={() => updateUser(user.id, { status: "ACTIVE", role: "VOLUNTEER" })}
                                style={{ padding: "6px 12px", fontSize: "0.75rem", background: "#DCFCE7", color: "#15803D", border: "none", borderRadius: "6px", cursor: "pointer", opacity: actionLoading === user.id ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                              >Approve</button>
                              <button
                                disabled={actionLoading === user.id}
                                onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                                style={{ padding: "6px 12px", fontSize: "0.75rem", background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: "6px", cursor: "pointer", opacity: actionLoading === user.id ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                              >Reject</button>
                            </div>
                          ) : !isSuperAdmin && (
                            <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                              {user.status === "ACTIVE" ? (
                                <button
                                  onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                                  style={{ padding: "5px 10px", fontSize: "0.75rem", background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                                >Suspend</button>
                              ) : user.status === "SUSPENDED" ? (
                                <button
                                  onClick={() => updateUser(user.id, { status: "ACTIVE" })}
                                  style={{ padding: "5px 10px", fontSize: "0.75rem", background: "#DCFCE7", color: "#15803D", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                                >Activate</button>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Volunteer-remove warning modal */}
            {volunteerRemoveWarning && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "28px", maxWidth: "420px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--gray-900)", marginBottom: "10px" }}>Remove Volunteer Role?</h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginBottom: "20px", lineHeight: 1.5 }}>
                    <strong>{volunteerRemoveWarning.userName}</strong> has <strong>{volunteerRemoveWarning.upcomingCount} upcoming shift{volunteerRemoveWarning.upcomingCount !== 1 ? "s" : ""}</strong>. Removing their Volunteer role will cancel all of them.
                  </p>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setVolunteerRemoveWarning(null)}
                      style={{ padding: "8px 16px", fontSize: "0.875rem", background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)" }}
                    >Cancel</button>
                    <button
                      onClick={async () => {
                        const { userId } = volunteerRemoveWarning;
                        setVolunteerRemoveWarning(null);
                        await handleRemoveRole(userId, "VOLUNTEER", true);
                      }}
                      style={{ padding: "8px 16px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
                    >Remove &amp; Cancel Shifts</button>
                  </div>
                </div>
              </div>
            )}

            {/* Portal: add-role dropdown — rendered at document.body to escape overflow:hidden */}
            {mounted && addRoleTarget && addRoleDropdownPos && (() => {
              const targetUser = users.find(u => u.id === addRoleTarget);
              if (!targetUser) return null;
              const { roleChips: tRoleChips } = parseUserRoles(targetUser.roles ?? []);
              const tIsSuperAdmin = targetUser.role === "SUPER_ADMIN";
              const tAddableRoles = ROLE_CHIPS.filter(r => {
                if (tRoleChips.includes(r.key)) return false;
                if ((r.key === "SUPER_ADMIN" || r.key === "ADMIN") && session?.user?.role !== "SUPER_ADMIN") return false;
                if (tIsSuperAdmin) return false;
                return true;
              });
              return ReactDOM.createPortal(
                <div
                  data-role-add-dropdown="true"
                  style={{ position: "absolute", top: addRoleDropdownPos.top, left: addRoleDropdownPos.left, zIndex: 9999, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "6px", minWidth: "140px", maxHeight: "200px", overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.15)" }}
                >
                  {tAddableRoles.map(r => (
                    <button
                      key={r.key}
                      onClick={() => handleAddRole(targetUser.id, r.key)}
                      disabled={roleActionLoading === `add-${targetUser.id}-${r.key}`}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", fontSize: "0.78rem", fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: r.color, borderRadius: "6px", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {roleActionLoading === `add-${targetUser.id}-${r.key}` ? "…" : r.label}
                    </button>
                  ))}
                </div>,
                document.body
              );
            })()}
          </div>
        )}

        {/* Clinics */}
        {tab === "clinics" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button
                onClick={() => setShowClinicForm(!showClinicForm)}
                style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
              >
                {showClinicForm ? "Cancel" : "+ Add Clinic"}
              </button>
            </div>

            {showClinicForm && (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "16px" }}>New Clinic</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <input
                    placeholder="Clinic Name"
                    value={clinicForm.name}
                    onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })}
                    style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                  />
                  <input
                    placeholder="Address"
                    value={clinicForm.address}
                    onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })}
                    style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                  />
                  <input
                    placeholder="Contact Name"
                    value={clinicForm.contactName}
                    onChange={(e) => setClinicForm({ ...clinicForm, contactName: e.target.value })}
                    style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                  />
                  <input
                    placeholder="Contact Email"
                    value={clinicForm.contactEmail}
                    onChange={(e) => setClinicForm({ ...clinicForm, contactEmail: e.target.value })}
                    style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                  />
                </div>
                {clinicFormError && (
                  <p style={{ marginTop: "12px", fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>
                    {clinicFormError}
                  </p>
                )}
                <button
                  disabled={actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail}
                  onClick={createClinic}
                  style={{ marginTop: "16px", padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail) ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                >
                  {actionLoading === "clinic-form" ? "Creating..." : "Create Clinic"}
                </button>
              </div>
            )}

            {clinics.length === 0 && !showClinicForm ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No clinics yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {clinics.map((clinic) => (
                  <div key={clinic.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <h3 style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--navy)" }}>{clinic.name}</h3>
                        <p style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginTop: "2px" }}>
                          {clinic.address}
                          {clinic.address && <MapsLinks address={clinic.address} />}
                        </p>
                        <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "4px" }}>{clinic.contactName} · {clinic.contactEmail}</p>
                        <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,.04)", border: "1.5px solid var(--card-border)", borderRadius: "8px", padding: "4px 10px" }}>
                            <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>PIN</span>
                            <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 700, color: "var(--gray-600)", letterSpacing: "0.2em" }}>
                              {pinVisible.has(clinic.id) ? clinic.loginPin : "••••••••"}
                            </span>
                            <button
                              onClick={() => setPinVisible(prev => { const n = new Set(prev); n.has(clinic.id) ? n.delete(clinic.id) : n.add(clinic.id); return n; })}
                              title={pinVisible.has(clinic.id) ? "Hide PIN" : "Show PIN"}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", lineHeight: 1, padding: "0 2px", display: "flex", alignItems: "center" }}
                            >
                              {pinVisible.has(clinic.id) ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              )}
                            </button>
                          </div>
                          <button
                            disabled={actionLoading === `pin-${clinic.id}`}
                            onClick={() => regeneratePin(clinic.id, clinic.name)}
                            style={{ fontSize: "0.75rem", padding: "4px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", color: "#B45309", borderRadius: "8px", cursor: "pointer", opacity: actionLoading === `pin-${clinic.id}` ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                          >
                            Regenerate PIN
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>{clinic._count?.slots || 0} slots</span>
                        <button
                          disabled={actionLoading === `delete-clinic-${clinic.id}`}
                          onClick={() => deleteClinic(clinic.id, clinic.name)}
                          style={{ fontSize: "0.75rem", padding: "4px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: "8px", cursor: "pointer", opacity: actionLoading === `delete-clinic-${clinic.id}` ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
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
          <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--gray-900)" }}>{adminProfile?.hoursVolunteered ?? 0}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "4px" }}>Hours Volunteered</p>
              </div>
            </div>

            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "4px" }}>Languages</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginBottom: "16px" }}>Click to toggle. Filled = you speak it. Only matching slots will let you sign up.</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
                {Object.entries(LANG_LABELS).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => toggleLanguage(code)}
                    style={{ padding: "9px 20px", fontSize: "0.875rem", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: profileForm.languages.includes(code) ? "var(--blue)" : "none", color: profileForm.languages.includes(code) ? "#fff" : "var(--gray-600)", border: profileForm.languages.includes(code) ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  disabled={actionLoading === "profile"}
                  onClick={saveProfile}
                  style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: actionLoading === "profile" ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                >
                  {actionLoading === "profile" ? "Saving..." : "Save Profile"}
                </button>
                {profileSaved && (
                  <span style={{ fontSize: "0.875rem", color: "#16A34A" }}>Saved!</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Languages */}
        {tab === "languages" && (
          <div style={{ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "4px" }}>Add Language</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginBottom: "16px" }}>Inactive languages are hidden from dropdowns but shown here.</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  placeholder="Name (e.g. French)"
                  value={langForm.name}
                  onChange={(e) => setLangForm({ ...langForm, name: e.target.value })}
                  style={{ flex: 1, padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                />
                <button
                  disabled={!langForm.name}
                  onClick={createLanguage}
                  style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: !langForm.name ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                >
                  Add
                </button>
              </div>
              {langFormError && (
                <p style={{ marginTop: "8px", fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{langFormError}</p>
              )}
            </div>

            {languages.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No languages configured yet.</p>
              </div>
            ) : (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
                {languages.map((lang, idx) => (
                  <div key={lang.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", gap: "12px", borderBottom: idx < languages.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "0.875rem", color: "var(--gray-900)", fontWeight: 500 }}>{lang.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>{lang.volunteerCount ?? 0} volunteer{(lang.volunteerCount ?? 0) !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.75rem", padding: "2px 10px", borderRadius: "99px", background: lang.isActive ? "#DCFCE7" : "var(--gray-200)", color: lang.isActive ? "#15803D" : "var(--gray-400)" }}>
                        {lang.isActive ? "Active" : "Inactive"}
                      </span>
                      <button
                        onClick={() => toggleLanguageActive(lang.id, !lang.isActive, lang.name)}
                        style={{ fontSize: "0.75rem", padding: "4px 12px", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: lang.isActive ? "var(--gray-200)" : "#DCFCE7", color: lang.isActive ? "var(--gray-600)" : "#15803D", border: "none" }}
                      >
                        {lang.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metrics */}
        {tab === "metrics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {!metrics ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>Loading metrics...</p>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                  {[
                    { value: metrics.totalHours, label: "Total Hours" },
                    { value: metrics.volunteerCount, label: "Active Volunteers" },
                    { value: metrics.activeSlotCount, label: "Active Slots" },
                  ].map((stat) => (
                    <div key={stat.label} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", textAlign: "center" }}>
                      <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--gray-900)" }}>{stat.value}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "4px" }}>{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "12px" }}>Hours by Language</h3>
                    {metrics.hoursByLanguage.length === 0 ? (
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>No data yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {metrics.hoursByLanguage.map((item) => (
                          <div key={item.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 700, padding: "2px 6px", background: "var(--gray-200)", color: "var(--gray-600)", borderRadius: "4px" }}>{item.code}</span>
                              <span style={{ fontSize: "0.875rem", color: "var(--gray-600)" }}>{item.name}</span>
                            </div>
                            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)" }}>{item.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "12px" }}>Hours by Clinic</h3>
                    {metrics.hoursByClinic.length === 0 ? (
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>No data yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {metrics.hoursByClinic.map((item) => (
                          <div key={item.clinicId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.875rem", color: "var(--gray-600)" }}>{item.clinicName}</span>
                            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)" }}>{item.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", textAlign: "center" }}>Graphs coming soon</p>

                <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "12px" }}>Feedback Overview</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                    {[
                      { value: metrics.feedbackCount ?? 0, label: "Total Feedback" },
                      { value: metrics.avgVolunteerRating != null ? `${metrics.avgVolunteerRating}★` : "—", label: "Avg Volunteer Rating" },
                      { value: metrics.avgClinicRating != null ? `${metrics.avgClinicRating}★` : "—", label: "Avg Clinic Rating" },
                    ].map((stat) => (
                      <div key={stat.label} style={{ textAlign: "center" }}>
                        <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--gray-900)" }}>{stat.value}</p>
                        <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "4px" }}>{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  {allFeedback.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "4px" }}>Recent Feedback</p>
                      {allFeedback.slice(0, 10).map((fb) => (
                        <div key={fb.id} style={{ border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, background: fb.authorRole === "CLINIC" ? "#EBF3FC" : "#DCFCE7", color: fb.authorRole === "CLINIC" ? "#0D1F3C" : "#15803D" }}>
                                {fb.authorRole}
                              </span>
                              {fb.rating != null && (
                                <span style={{ fontSize: "0.75rem", color: "#F59E0B" }}>
                                  {"★".repeat(fb.rating)}{"☆".repeat(5 - fb.rating)}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>{new Date(fb.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p style={{ fontSize: "0.78rem", color: "var(--gray-600)", marginBottom: "4px" }}>{fb.note}</p>
                          <p style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>
                            {fb.signup.slot.clinic.name} · {fb.signup.volunteer.user.name ?? fb.signup.volunteer.user.email}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {allFeedback.length === 0 && (
                    <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", textAlign: "center", padding: "16px 0" }}>No feedback yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Training */}
        {tab === "training" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowTrainingForm(!showTrainingForm)}
                style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
              >
                {showTrainingForm ? "Cancel" : "+ Add Material"}
              </button>
            </div>

            {showTrainingForm && (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)" }}>New Training Material</h3>
                <input
                  placeholder="Title"
                  value={trainingForm.title}
                  onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={trainingForm.description}
                  onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })}
                  rows={2}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", resize: "none", boxSizing: "border-box" }}
                />
                <input
                  placeholder="URL (https://docs.google.com/... or any link)"
                  value={trainingForm.url}
                  onChange={(e) => setTrainingForm({ ...trainingForm, url: e.target.value, type: "LINK" })}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "4px", display: "block" }}>Language</label>
                    <select
                      value={trainingForm.languageCode}
                      onChange={(e) => setTrainingForm({ ...trainingForm, languageCode: e.target.value })}
                      style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      <option value="">All Languages</option>
                      {languages.filter((l) => l.isActive).map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "4px", display: "block" }}>Category</label>
                    <input
                      placeholder="General"
                      value={trainingForm.category}
                      list="training-categories"
                      onChange={(e) => setTrainingForm({ ...trainingForm, category: e.target.value })}
                      style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                    />
                    <datalist id="training-categories">
                      {["General", "Medical Terminology", "Ethics", "Language-Specific", "Administrative"].map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                {trainingFormError && (
                  <p style={{ fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{trainingFormError}</p>
                )}
                <button
                  disabled={trainingSubmitting || !trainingForm.title || (trainingForm.type === "LINK" && !trainingForm.url)}
                  onClick={submitTraining}
                  style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (trainingSubmitting || !trainingForm.title || (trainingForm.type === "LINK" && !trainingForm.url)) ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif", alignSelf: "flex-start" }}
                >
                  {trainingSubmitting ? "Saving..." : "Add Material"}
                </button>
              </div>
            )}

            {trainingMaterials.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No training materials yet.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {trainingMaterials.map((m) => (
                  <div key={m.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: "0.875rem" }}>{m.title}</span>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", background: "var(--gray-200)", color: "var(--gray-600)" }}>{m.category}</span>
                          {m.languageCode && (
                            <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", background: "#EBF3FC", color: "#0D1F3C" }}>{m.languageCode}</span>
                          )}
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", background: m.type === "FILE" ? "#FFFBEB" : "#DCFCE7", color: m.type === "FILE" ? "#B45309" : "#15803D" }}>
                            {m.type}
                          </span>
                        </div>
                        {m.description && <p style={{ fontSize: "0.78rem", color: "var(--gray-600)", marginBottom: "6px" }}>{m.description}</p>}
                        {m.type === "FILE" ? (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.78rem", color: "var(--gray-600)", textDecoration: "underline" }}>
                            {m.fileName ?? "Download"}
                          </a>
                        ) : (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.78rem", color: "var(--blue)", textDecoration: "underline", wordBreak: "break-all" }}>
                            {m.url}
                          </a>
                        )}
                        <p style={{ fontSize: "0.72rem", color: "var(--gray-400)", marginTop: "8px" }}>
                          by {m.uploadedBy.name ?? m.uploadedBy.email} · {new Date(m.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteTraining(m.id)}
                        style={{ flexShrink: 0, fontSize: "0.75rem", padding: "4px 12px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Access Control — SUPER_ADMIN only */}
        {tab === "access" && session?.user?.role === "SUPER_ADMIN" && (
          <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "4px" }}>Add Email Rule</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginBottom: "16px" }}>
                <strong>Allow</strong> lets a non-Georgetown email sign in. <strong>Block</strong> prevents any email from signing in.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={ruleEmail}
                  onChange={(e) => setRuleEmail(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  {(["ALLOW", "BLOCK"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRuleType(t)}
                      style={{ flex: 1, padding: "9px", fontSize: "0.875rem", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, border: "1.5px solid", background: ruleType === t ? (t === "ALLOW" ? "#15803D" : "#DC2626") : "none", color: ruleType === t ? "#fff" : "var(--gray-600)", borderColor: ruleType === t ? (t === "ALLOW" ? "#15803D" : "#DC2626") : "var(--card-border)" }}
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
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                />
                <button
                  disabled={!ruleEmail.trim() || actionLoading === "email-rule"}
                  onClick={addEmailRule}
                  style={{ width: "100%", padding: "9px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (!ruleEmail.trim() || actionLoading === "email-rule") ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                >
                  {actionLoading === "email-rule" ? "Saving..." : "Add Rule"}
                </button>
              </div>
            </div>

            {emailRules.length > 0 && (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
                {emailRules.map((rule, idx) => (
                  <div key={rule.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", gap: "12px", borderBottom: idx < emailRules.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <span style={{ flexShrink: 0, fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, background: rule.type === "ALLOW" ? "#DCFCE7" : "#FEF2F2", color: rule.type === "ALLOW" ? "#15803D" : "#DC2626" }}>
                        {rule.type}
                      </span>
                      <span style={{ fontSize: "0.875rem", color: "var(--gray-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.email}</span>
                      {rule.note && <span style={{ fontSize: "0.75rem", color: "var(--gray-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.note}</span>}
                    </div>
                    <button
                      disabled={actionLoading === `rule-${rule.id}`}
                      onClick={() => removeEmailRule(rule.id)}
                      style={{ flexShrink: 0, fontSize: "0.75rem", padding: "4px 12px", background: "var(--gray-200)", color: "var(--gray-600)", border: "none", borderRadius: "8px", cursor: "pointer", opacity: actionLoading === `rule-${rule.id}` ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {emailRules.length === 0 && (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "32px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>No rules yet. All Georgetown emails can sign in by default.</p>
              </div>
            )}
          </div>
        )}

        {/* Feature Flags — SUPER_ADMIN only */}
        {tab === "flags" && session?.user?.role === "SUPER_ADMIN" && (
          <div style={{ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ fontSize: "0.75rem", color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", padding: "8px 16px" }}>
              Disabled features are hidden from all non-admin users.
            </p>
            {featureFlags.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "32px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>Loading...</p>
              </div>
            ) : (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
                {featureFlags.map((flag, idx) => (
                  <div key={flag.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", gap: "16px", borderBottom: idx < featureFlags.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)" }}>{flag.label}</p>
                      <p style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "var(--gray-400)" }}>{flag.key}</p>
                      {flag.description && <p style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginTop: "2px" }}>{flag.description}</p>}
                    </div>
                    <button
                      role="switch"
                      aria-checked={flag.enabled}
                      onClick={() => toggleFlag(flag.key, !flag.enabled)}
                      style={{ position: "relative", display: "inline-flex", height: "20px", width: "36px", flexShrink: 0, borderRadius: "99px", border: "2px solid transparent", background: flag.enabled ? "var(--blue)" : "var(--gray-200)", cursor: "pointer", outline: "none" }}
                    >
                      <span style={{ display: "inline-block", height: "16px", width: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transform: flag.enabled ? "translateX(16px)" : "translateX(0)", transition: "transform 0.15s" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "4px" }}>Test Email</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginBottom: "16px" }}>Send a test email to verify email delivery is working.</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="email"
                  placeholder="recipient@example.com"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                />
                <button
                  disabled={!testEmailTo.trim() || testEmailStatus === "sending"}
                  onClick={sendTestEmailFn}
                  style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (!testEmailTo.trim() || testEmailStatus === "sending") ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                >
                  {testEmailStatus === "sending" ? "Sending..." : "Send Test Email"}
                </button>
              </div>
              {testEmailStatus === "sent" && <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "#16A34A" }}>Test email sent!</p>}
              {testEmailStatus === "error" && <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "#EF4444" }}>Failed to send test email.</p>}
            </div>
          </div>
        )}

        {/* Messages — admin/super_admin */}
        {tab === "suggestions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {suggestions.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No messages yet.</p>
              </div>
            ) : (
              suggestions.map((s) => (
                <div key={s.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                        <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600,
                          background: s.type === "BUG" ? "#FEF2F2" : s.type === "FEATURE" ? "#EBF3FC" : s.type === "CONTACT" ? "#F0FDFA" : "var(--gray-200)",
                          color: s.type === "BUG" ? "#B91C1C" : s.type === "FEATURE" ? "#0D1F3C" : s.type === "CONTACT" ? "#0F766E" : "var(--gray-600)"
                        }}>
                          {s.type === "BUG" ? "Bug" : s.type === "FEATURE" ? "Feature" : s.type === "CONTACT" ? "Contact" : "General"}
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: "0.875rem" }}>{s.subject}</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>{new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginBottom: "8px" }}>{s.message}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>
                        {s.submittedBy ? (s.submittedBy.name ?? s.submittedBy.email) : "Anonymous"}
                      </p>
                      <input
                        type="text"
                        placeholder="Admin note..."
                        defaultValue={s.adminNote ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (s.adminNote ?? "")) {
                            void updateSuggestionNote(s.id, e.target.value);
                          }
                        }}
                        style={{ marginTop: "8px", width: "100%", padding: "6px 10px", fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", outline: "none", color: "var(--gray-600)", background: "rgba(0,0,0,.02)", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                      <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600,
                        background: s.status === "OPEN" ? "#FFFBEB" : s.status === "NOTED" ? "#EBF3FC" : "var(--gray-200)",
                        color: s.status === "OPEN" ? "#B45309" : s.status === "NOTED" ? "#0D1F3C" : "var(--gray-600)"
                      }}>
                        {s.status}
                      </span>
                      <select
                        value={s.status}
                        onChange={(e) => void updateSuggestionStatus(s.id, e.target.value)}
                        style={{ fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", padding: "4px 8px", color: "var(--gray-600)", background: "var(--card-bg)", outline: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="NOTED">NOTED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                      {s.status === "CLOSED" && (
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/suggestions/${s.id}`, { method: "DELETE" });
                            if (res.ok) setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                          }}
                          style={{ fontSize: "0.75rem", padding: "4px 12px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "440px" }}>
              <div style={{ padding: "16px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>Delete {selectedSlotsList.length} Slot{selectedSlotsList.length !== 1 ? "s" : ""}</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "2px" }}>This will cancel the slot and notify any signed-up volunteers.</p>
              </div>
              <div style={{ padding: "16px 24px" }}>
                <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "16px" }}>
                  {selectedSlotsList.map((s) => (
                    <div key={s.id} style={{ fontSize: "0.78rem", color: "var(--gray-600)", padding: "4px 0", borderBottom: "1px solid var(--card-border)" }}>
                      <span style={{ fontWeight: 600 }}>{s.clinic.name}</span> · {formatDate(s.date)} · {formatHour(s.startTime)}–{formatHour(s.endTime)} · {LANG_LABELS[s.language]}
                      {s.signups.length > 0 && (
                        <span style={{ marginLeft: "4px", color: "#D97706" }}>({s.signups.length} volunteer{s.signups.length !== 1 ? "s" : ""} affected)</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
                  <p style={{ fontSize: "0.78rem", color: "#92400E" }}>
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
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: "16px", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => { setAdminDeleteModal(false); setAdminDeleteInput(""); }}
                    style={{ flex: 1, padding: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "var(--gray-600)", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={adminDeleteInput.trim() !== confirmText || actionLoading === "admin-batch-delete"}
                    onClick={confirmAdminDeleteSlots}
                    style={{ flex: 1, padding: "9px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", opacity: (adminDeleteInput.trim() !== confirmText || actionLoading === "admin-batch-delete") ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "440px" }}>
              <div style={{ padding: "16px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>Assign a Volunteer</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "2px" }}>
                  {LANG_LABELS[volunteerAssignTarget.language]} &middot; {formatDate(volunteerAssignTarget.date)} &middot; {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)} &middot; {volunteerAssignTarget.clinicName}
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
                          style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "9px", border: "1.5px solid transparent", background: "none", cursor: alreadySigned ? "not-allowed" : "pointer", opacity: alreadySigned ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name ?? "—"}</p>
                              <p style={{ fontSize: "0.72rem", color: "var(--gray-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                              {alreadySigned && (
                                <span style={{ fontSize: "0.72rem", padding: "2px 8px", background: "#DCFCE7", color: "#15803D", borderRadius: "99px" }}>Signed up</span>
                              )}
                              {u.volunteer?.languages?.map((l) => (
                                <span key={l} className={`text-xs px-1.5 py-0.5 rounded-full ${LANG_COLORS[l] ?? "bg-gray-100 text-gray-500"}`}>
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
                    style={{ marginTop: "16px", fontSize: "0.75rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ padding: "16px 24px" }}>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
                    <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#92400E", marginBottom: "6px" }}>Confirm Assignment</p>
                    <p style={{ fontSize: "0.875rem", color: "#78350F" }}>
                      Assign <strong>{assignSelected.name}</strong> to this shift?
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#92400E", marginTop: "2px" }}>{assignSelected.email}</p>
                    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #FDE68A", fontSize: "0.75rem", color: "#92400E", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <p>{LANG_LABELS[volunteerAssignTarget.language]} · {volunteerAssignTarget.clinicName}</p>
                      <p>{formatDate(volunteerAssignTarget.date)} · {formatHour(volunteerAssignTarget.hour)}–{formatHour(volunteerAssignTarget.hour + 1)}</p>
                      <p style={{ marginTop: "4px", color: "#D97706" }}>They will receive a calendar invite.</p>
                    </div>
                  </div>
                  {assignError && (
                    <p style={{ fontSize: "0.75rem", color: "#DC2626", marginBottom: "12px" }}>{assignError}</p>
                  )}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => { setAssignSelected(null); setAssignError(""); }}
                      style={{ flex: 1, padding: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "var(--gray-600)", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      ← Back
                    </button>
                    <button
                      disabled={assignLoading}
                      onClick={assignVolunteer}
                      style={{ flex: 1, padding: "9px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, opacity: assignLoading ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {assignLoading ? "Assigning..." : "Confirm Assignment"}
                    </button>
                  </div>
                  <button
                    onClick={closeAssignModal}
                    style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "380px", boxShadow: "0 8px 32px rgba(0,0,0,.18)" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)", marginBottom: "4px" }}>New PIN for {pinReveal.clinicName}</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginBottom: "16px" }}>
              Copy this PIN now — it cannot be shown again. Share it with the clinic directly.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(0,0,0,.04)", border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
              <span style={{ fontSize: "1.5rem", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.25em", color: "var(--gray-900)" }}>{pinReveal.pin}</span>
              <button
                onClick={() => navigator.clipboard.writeText(pinReveal.pin)}
                style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "4px 12px", background: "var(--gray-200)", color: "var(--gray-600)", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setPinReveal(null)}
              style={{ width: "100%", padding: "9px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Language Deactivate Conflict Modal */}
      {langDeactivateConflict && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "440px" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1.5px solid var(--card-border)" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--gray-900)" }}>Deactivate {langDeactivateConflict.langName}?</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "2px" }}>This will affect upcoming clinic postings.</p>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--gray-600)", marginBottom: "12px" }}>
                The following upcoming slots use <strong>{langDeactivateConflict.langName}</strong> and will be <strong>deleted</strong> if you proceed. Clinics will be notified.
              </p>
              <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "16px" }}>
                {langDeactivateConflict.conflicts.map((c) => (
                  <div key={c.id} style={{ fontSize: "0.78rem", color: "var(--gray-600)", padding: "4px 0", borderBottom: "1px solid var(--card-border)" }}>
                    <span style={{ fontWeight: 600 }}>{c.clinicName}</span> · {new Date(c.date.slice(0,10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setLangDeactivateConflict(null)}
                  style={{ flex: 1, padding: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "var(--gray-600)", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Cancel
                </button>
                <button
                  disabled={langDeactivateLoading}
                  onClick={forceDeactivateLanguage}
                  style={{ flex: 1, padding: "9px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, opacity: langDeactivateLoading ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                >
                  {langDeactivateLoading ? "Deactivating..." : "Deactivate & Delete Slots"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Clinic Modal */}
      {assignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "380px", boxShadow: "0 8px 32px rgba(0,0,0,.18)" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-600)", marginBottom: "12px" }}>
              Assign {assignModal.userName} to a clinic
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {clinics.map((clinic) => (
                <button
                  key={clinic.id}
                  onClick={async () => {
                    await updateUser(assignModal.userId, { clinicId: clinic.id });
                    setAssignModal(null);
                  }}
                  style={{ width: "100%", textAlign: "left", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "none", cursor: "pointer", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif" }}
                >
                  {clinic.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAssignModal(null)}
              style={{ marginTop: "16px", fontSize: "0.75rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
