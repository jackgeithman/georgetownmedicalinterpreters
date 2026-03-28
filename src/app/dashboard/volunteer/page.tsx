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

type Tab = "browse" | "signups" | "profile" | "training" | "clearance" | "suggestions";

type ClearanceVolunteer = {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
};

type FeedbackEntry = { id: string; authorRole: string; rating: number | null; note: string; createdAt: string };

const RATING_OPTIONS = [
  { value: 1, label: "Needs Improvement", active: "bg-red-100 text-red-700 border-red-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-600" },
  { value: 2, label: "Okay",              active: "bg-orange-100 text-orange-700 border-orange-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-orange-200 hover:text-orange-600" },
  { value: 3, label: "Good",              active: "bg-yellow-100 text-yellow-700 border-yellow-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-yellow-200 hover:text-yellow-600" },
  { value: 4, label: "Excellent",         active: "bg-green-100 text-green-700 border-green-300",  idle: "bg-white text-gray-500 border-gray-200 hover:border-green-200 hover:text-green-600" },
  { value: 5, label: "Exceptional", active: "bg-emerald-100 text-emerald-700 border-emerald-300", idle: "bg-white text-gray-500 border-gray-200 hover:border-emerald-200 hover:text-emerald-600" },
];

type TrainingMaterial = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  url: string;
  fileName: string | null;
  languageCode: string | null;
  category: string;
  uploadedBy: { name: string | null; email: string };
  createdAt: string;
};

const LANG_LABELS: Record<string, string> = {
  ES: "Spanish",
  ZH: "Chinese",
  KO: "Korean",
};

const LANG_COLORS: Record<string, string> = {
  ES: "bg-amber-50 text-amber-700",
  ZH: "bg-red-50 text-red-700",
  KO: "bg-[#EBF3FC] text-[#041E42]",
};

// Top 10 most spoken world languages first, then rest alphabetically
const TOP_WORLD_LANGUAGES = [
  { code: "EN", name: "English" },
  { code: "ZH", name: "Mandarin Chinese" },
  { code: "HI", name: "Hindi" },
  { code: "ES", name: "Spanish" },
  { code: "FR", name: "French" },
  { code: "AR", name: "Arabic" },
  { code: "BN", name: "Bengali" },
  { code: "PT", name: "Portuguese" },
  { code: "RU", name: "Russian" },
  { code: "UR", name: "Urdu" },
];

const OTHER_WORLD_LANGUAGES = [
  { code: "AF", name: "Afrikaans" },
  { code: "SQ", name: "Albanian" },
  { code: "AM", name: "Amharic" },
  { code: "HY", name: "Armenian" },
  { code: "AZ", name: "Azerbaijani" },
  { code: "EU", name: "Basque" },
  { code: "BE", name: "Belarusian" },
  { code: "BS", name: "Bosnian" },
  { code: "BG", name: "Bulgarian" },
  { code: "MY", name: "Burmese" },
  { code: "CA", name: "Catalan" },
  { code: "HR", name: "Croatian" },
  { code: "CS", name: "Czech" },
  { code: "DA", name: "Danish" },
  { code: "NL", name: "Dutch" },
  { code: "ET", name: "Estonian" },
  { code: "TL", name: "Filipino/Tagalog" },
  { code: "FI", name: "Finnish" },
  { code: "GL", name: "Galician" },
  { code: "KA", name: "Georgian" },
  { code: "DE", name: "German" },
  { code: "EL", name: "Greek" },
  { code: "GU", name: "Gujarati" },
  { code: "HT", name: "Haitian Creole" },
  { code: "HA", name: "Hausa" },
  { code: "HE", name: "Hebrew" },
  { code: "HU", name: "Hungarian" },
  { code: "IS", name: "Icelandic" },
  { code: "IG", name: "Igbo" },
  { code: "ID", name: "Indonesian" },
  { code: "GA", name: "Irish" },
  { code: "IT", name: "Italian" },
  { code: "JA", name: "Japanese" },
  { code: "JV", name: "Javanese" },
  { code: "KN", name: "Kannada" },
  { code: "KK", name: "Kazakh" },
  { code: "KM", name: "Khmer" },
  { code: "KO", name: "Korean" },
  { code: "KU", name: "Kurdish" },
  { code: "KY", name: "Kyrgyz" },
  { code: "LO", name: "Lao" },
  { code: "LV", name: "Latvian" },
  { code: "LT", name: "Lithuanian" },
  { code: "MK", name: "Macedonian" },
  { code: "MS", name: "Malay" },
  { code: "ML", name: "Malayalam" },
  { code: "MT", name: "Maltese" },
  { code: "MR", name: "Marathi" },
  { code: "MN", name: "Mongolian" },
  { code: "NE", name: "Nepali" },
  { code: "NO", name: "Norwegian" },
  { code: "OR", name: "Odia" },
  { code: "PS", name: "Pashto" },
  { code: "FA", name: "Persian/Farsi" },
  { code: "PL", name: "Polish" },
  { code: "PA", name: "Punjabi" },
  { code: "RO", name: "Romanian" },
  { code: "SR", name: "Serbian" },
  { code: "SD", name: "Sindhi" },
  { code: "SI", name: "Sinhala" },
  { code: "SK", name: "Slovak" },
  { code: "SL", name: "Slovenian" },
  { code: "SO", name: "Somali" },
  { code: "SW", name: "Swahili" },
  { code: "SV", name: "Swedish" },
  { code: "TG", name: "Tajik" },
  { code: "TA", name: "Tamil" },
  { code: "TE", name: "Telugu" },
  { code: "TH", name: "Thai" },
  { code: "TR", name: "Turkish" },
  { code: "TK", name: "Turkmen" },
  { code: "UK", name: "Ukrainian" },
  { code: "UZ", name: "Uzbek" },
  { code: "VI", name: "Vietnamese" },
  { code: "CY", name: "Welsh" },
  { code: "XH", name: "Xhosa" },
  { code: "YO", name: "Yoruba" },
  { code: "ZU", name: "Zulu" },
];

const ALL_WORLD_LANGUAGES = [...TOP_WORLD_LANGUAGES, ...OTHER_WORLD_LANGUAGES];

function MapsLinks({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const q = encodeURIComponent(address);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "6px" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ fontSize: "0.72rem", color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
      >Maps ↗</button>
      {open && (
        <span style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", padding: "6px 0", display: "flex", flexDirection: "column", whiteSpace: "nowrap", minWidth: "120px" }}>
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
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [trainingLoaded, setTrainingLoaded] = useState(false);
  // Anti-spam: track cancel counts per slotId-hour key
  const [cancelCounts, setCancelCounts] = useState<Record<string, number>>({});
  const [spamModal, setSpamModal] = useState<{ onProceed: (() => void) | null; isBlocked: boolean } | null>(null);
  // Easter egg state
  const [easterBg, setEasterBg] = useState("transparent");
  const [easterOpen, setEasterOpen] = useState(false);
  const [easterCount, setEasterCount] = useState(0);

  // Feedback state — inline (no modal)
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set()); // slotIds
  const [feedbackForms, setFeedbackForms] = useState<Record<string, { rating: number; note: string }>>({});
  const [submittingFeedbackFor, setSubmittingFeedbackFor] = useState<string | null>(null);

  const [langSearch, setLangSearch] = useState("");
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; name: string }[]>([]);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [trainingForm, setTrainingForm] = useState({ title: "", description: "", type: "LINK" as "LINK" | "FILE", url: "", languageCode: "", category: "General" });
  const [trainingFile, setTrainingFile] = useState<File | null>(null);
  const [trainingFormError, setTrainingFormError] = useState("");
  const [trainingSubmitting, setTrainingSubmitting] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [clearanceVolunteers, setClearanceVolunteers] = useState<ClearanceVolunteer[]>([]);
  const [clearanceLoaded, setClearanceLoaded] = useState(false);
  const [clearanceActionLoading, setClearanceActionLoading] = useState<string | null>(null);

  // Suggestions state
  const [suggForm, setSuggForm] = useState({ type: "FEATURE", subject: "", message: "" });
  const [suggSubmitting, setSuggSubmitting] = useState(false);
  const [suggSuccess, setSuggSuccess] = useState(false);
  const [suggError, setSuggError] = useState("");

  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
  const isInstructor = (session?.user?.roles ?? []).includes("INSTRUCTOR");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    const role = session?.user?.role;
    if (role && role !== "VOLUNTEER" && role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "INSTRUCTOR") router.push("/dashboard");
  }, [status, session, router]);

  const fetchAll = useCallback(async () => {
    const [slotsRes, signupsRes, profileRes, notifRes] = await Promise.all([
      fetch("/api/volunteer/slots"),
      fetch("/api/volunteer/signups"),
      fetch("/api/volunteer/profile"),
      fetch("/api/volunteer/notif-prefs"),
    ]);
    if (slotsRes.ok) setBrowseSlots(await slotsRes.json());
    let loadedSignups: MySignup[] = [];
    if (signupsRes.ok) {
      loadedSignups = await signupsRes.json();
      setMySignups(loadedSignups);
    }
    if (profileRes.ok) {
      const p = await profileRes.json();
      setProfile(p);
      setProfileForm({ languages: p.languages ?? [] });
    }
    if (notifRes.ok) setNotifPrefs(await notifRes.json());
    setLoading(false);

    // Load which slots the volunteer already rated — single API call
    const statusRes = await fetch("/api/feedback/my-status");
    if (statusRes.ok) {
      const { givenSlotIds } = await statusRes.json();
      setFeedbackGiven(new Set<string>(givenSlotIds ?? []));
    }
  }, []);

  const fetchBrowse = useCallback(async () => {
    const params = langFilter !== "ALL" ? `?language=${langFilter}` : "";
    const res = await fetch(`/api/volunteer/slots${params}`);
    if (res.ok) setBrowseSlots(await res.json());
  }, [langFilter]);

  useEffect(() => {
    const role = session?.user?.role;
    if (role === "VOLUNTEER" || role === "ADMIN" || role === "SUPER_ADMIN" || role === "INSTRUCTOR") {
      fetchAll();
      fetch("/api/languages")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAvailableLanguages(data); })
        .catch(() => {});
    }
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
      // Redirect to Easter egg
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

  const submitTraining = async () => {
    setTrainingFormError("");
    setTrainingSubmitting(true);
    try {
      let url = trainingForm.url;
      let fileName: string | null = null;
      if (trainingForm.type === "FILE") {
        if (!trainingFile) { setTrainingFormError("Please select a file."); setTrainingSubmitting(false); return; }
        const fd = new FormData();
        fd.append("file", trainingFile);
        const uploadRes = await fetch("/api/training/upload", { method: "POST", body: fd });
        if (!uploadRes.ok) { const err = await uploadRes.json().catch(() => ({})); setTrainingFormError(err.error ?? "File upload failed."); setTrainingSubmitting(false); return; }
        const uploadData = await uploadRes.json();
        url = uploadData.url;
        fileName = uploadData.fileName;
      }
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trainingForm.title, description: trainingForm.description || null, type: trainingForm.type, url, fileName, languageCode: trainingForm.languageCode || null, category: trainingForm.category || "General" }),
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
    if (res.ok) setTrainingMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const toggleLangClearance = async (userId: string, langCode: string) => {
    const key = `${userId}-${langCode}`;
    setClearanceActionLoading(key);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, toggleLanguageClearance: langCode }),
    });
    if (res.ok) {
      const { roles: newRoles } = await res.json();
      setClearanceVolunteers((prev) => prev.map((v) => v.id === userId ? { ...v, roles: newRoles } : v));
    }
    setClearanceActionLoading(null);
  };

  const submitInlineFeedback = async (slotId: string, signupId: string) => {
    const form = feedbackForms[slotId];
    if (!form?.rating) return;
    setSubmittingFeedbackFor(slotId);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signupId, rating: form.rating, note: form.note ?? "" }),
    });
    if (res.ok || res.status === 409) {
      setFeedbackGiven((prev) => new Set([...prev, slotId]));
    }
    setSubmittingFeedbackFor(null);
  };

  const submitSuggestion = async () => {
    setSuggSubmitting(true);
    setSuggError("");
    const res = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suggForm),
    });
    if (res.ok) {
      setSuggSuccess(true);
      setSuggForm({ type: "FEATURE", subject: "", message: "" });
      setTimeout(() => setSuggSuccess(false), 3000);
    } else {
      const err = await res.json().catch(() => ({}));
      setSuggError(err.error ?? "Could not submit suggestion.");
    }
    setSuggSubmitting(false);
  };

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
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
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--gray-900)" }}>
      {isAdmin && (
        <div style={{ background: "#1E40AF", color: "#fff", padding: "10px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif" }}>
          <span>Viewing as Volunteer</span>
          <button
            onClick={() => router.push("/dashboard/admin")}
            style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", padding: "5px 14px", borderRadius: "7px", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif" }}
          >← Back to Admin</button>
        </div>
      )}
      {/* Header */}
      <header style={{ background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0 }} />
          <div>
            <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
            <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>Volunteer Dashboard</div>
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
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <div style={{ maxWidth: "920px", margin: "0 auto", padding: "36px 24px" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "28px", background: "var(--card-bg)", padding: "5px", borderRadius: "12px", width: "fit-content", border: "1px solid var(--card-border)" }}>
          {[
            { key: "browse" as Tab, label: "Browse Slots", count: 0 },
            { key: "signups" as Tab, label: "My Signups", count: mySignups.length },
            { key: "profile" as Tab, label: "Profile", count: 0 },
            { key: "training" as Tab, label: "Training", count: 0 },
            ...(isInstructor ? [{ key: "clearance" as Tab, label: "Clearance", count: 0 }] : []),
            { key: "suggestions" as Tab, label: "Messages", count: 0 },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === "training" && !trainingLoaded) {
                  fetch("/api/training")
                    .then((r) => r.json())
                    .then((data) => { setTrainingMaterials(data); setTrainingLoaded(true); })
                    .catch(() => setTrainingLoaded(true));
                }
                if (t.key === "clearance" && !clearanceLoaded) {
                  fetch("/api/admin/users")
                    .then((r) => r.json())
                    .then((data) => { setClearanceVolunteers(data.filter((u: ClearanceVolunteer) => (u.roles ?? []).some((r: string) => r.startsWith("LANG_")))); setClearanceLoaded(true); })
                    .catch(() => setClearanceLoaded(true));
                }
              }}
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
              {t.count > 0 && (
                <span style={{ background: "#DC2626", color: "#fff", fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px", borderRadius: "99px", marginLeft: "5px" }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

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
              <div key={slot.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.5 : 1 }}>
                {/* Card header */}
                <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
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
                      {Array.from({ length: slot.endTime - slot.startTime }, (_, i) => slot.startTime + i)
                        .filter((h) => slot.signups.filter((s) => s.subBlockHour === h).length < slot.interpreterCount).length} open
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
                      ) : (
                        <button
                          disabled={actionLoading === key}
                          onClick={() => signUp(slot.id, hour)}
                          style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 22px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", opacity: actionLoading === key ? 0.5 : 1, whiteSpace: "nowrap" }}
                        >
                          {actionLoading === key ? "..." : "Sign Up"}
                        </button>
                      )}
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
                {/* Language — fixed: All, Spanish, Mandarin; then dropdown for others */}
                {(() => {
                  const FIXED = ["ALL", "ES", "ZH"];
                  const fixedLabels: Record<string, string> = { ALL: "All Languages", ES: "Spanish", ZH: "Mandarin" };
                  const otherLangs = availableLanguages.filter((l) => !["ES", "ZH"].includes(l.code));
                  const otherSelected = !FIXED.includes(langFilter) && langFilter !== "ALL";
                  return (
                    <>
                      {FIXED.map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setLangFilter(lang)}
                          style={{
                            padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                            border: langFilter === lang ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)",
                            background: langFilter === lang ? "var(--blue)" : "var(--card-bg)",
                            color: langFilter === lang ? "#fff" : "var(--gray-900)",
                          }}
                        >{fixedLabels[lang]}</button>
                      ))}
                      {otherLangs.length > 0 && (
                        <select
                          value={otherSelected ? langFilter : ""}
                          onChange={(e) => { if (e.target.value) setLangFilter(e.target.value); }}
                          style={{
                            padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", outline: "none",
                            border: otherSelected ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)",
                            background: otherSelected ? "var(--blue)" : "var(--card-bg)",
                            color: otherSelected ? "#fff" : "var(--gray-900)",
                          }}
                        >
                          <option value="">Other languages…</option>
                          {otherLangs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                        </select>
                      )}
                    </>
                  );
                })()}

                <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />

                {/* Clinic */}
                <select
                  value={clinicFilter}
                  onChange={(e) => setClinicFilter(e.target.value)}
                  style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", outline: "none" }}
                >
                  <option value="ALL">All Clinics</option>
                  {uniqueClinics.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />

                {/* Date range */}
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
                  >
                    Clear
                  </button>
                )}

                <div style={{ width: "1px", background: "var(--card-border)", alignSelf: "stretch", margin: "0 4px" }} />

                {/* Availability */}
                <button
                  onClick={() => setAvailableOnly(!availableOnly)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "9px",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    border: availableOnly ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)",
                    background: availableOnly ? "var(--green)" : "var(--card-bg)",
                    color: availableOnly ? "#fff" : "var(--gray-900)",
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Available Only
                </button>
              </div>

              {/* Upcoming */}
              {upcoming.length === 0 && past.length === 0 ? (
                <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                  <p style={{ color: "var(--gray-400)" }}>No slots match your filters.</p>
                </div>
              ) : (
                <div>
                  {upcoming.map((slot) => renderSlot(slot, false))}

                  {past.length > 0 && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "32px 0 16px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--gray-400)" }}>
                        <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                        Past Slots
                        <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                      </div>
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
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No active signups. Browse available slots to sign up.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {Object.entries(signupsBySlot).map(([slotId, sigs]) => {
                  const slot = sigs[0].slot;
                  return (
                    <div key={slotId} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                      {/* Card header */}
                      <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)" }}>
                        <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--navy)" }}>{slot.clinic.name}</div>
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
                      {/* Hour rows */}
                      {sigs
                        .sort((a, b) => a.subBlockHour - b.subBlockHour)
                        .map((sig) => (
                          <div
                            key={sig.id}
                            style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: "1px solid var(--card-border)", gap: "16px" }}
                          >
                            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                            <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)", flex: 1 }}>
                              {formatHour(sig.subBlockHour)} – {formatHour(sig.subBlockHour + 1)}
                            </span>
                            <button
                              disabled={actionLoading === sig.id}
                              onClick={() => cancelSignup(sig.id, `${sig.slot.id}-${sig.subBlockHour}`)}
                              style={{ fontSize: "0.75rem", padding: "6px 14px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: actionLoading === sig.id ? 0.5 : 1 }}
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      {/* Inline feedback for past slots */}
                      {(() => {
                        const end = new Date(slot.date.slice(0, 10) + "T" + String(slot.endTime).padStart(2, "0") + ":00:00");
                        if (end >= new Date()) return null;
                        const signupId = sigs[0].id;
                        if (feedbackGiven.has(slot.id)) {
                          return (
                            <div style={{ padding: "12px 22px", borderTop: "1px solid var(--card-border)", fontSize: "0.75rem", color: "var(--green)" }}>
                              ✓ Feedback submitted
                            </div>
                          );
                        }
                        const form = feedbackForms[slot.id] ?? { rating: 0, note: "" };
                        return (
                          <div style={{ padding: "12px 22px", borderTop: "1px solid var(--card-border)" }}>
                            <p style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "8px", fontWeight: 500 }}>How was your shift at {slot.clinic.name}?</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                              {RATING_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setFeedbackForms((prev) => ({ ...prev, [slot.id]: { ...form, rating: opt.value } }))}
                                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${form.rating === opt.value ? opt.active : opt.idle}`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {form.rating > 0 && (
                              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginTop: "8px" }}>
                                <textarea
                                  placeholder="Any comments? (optional)"
                                  value={form.note}
                                  onChange={(e) => setFeedbackForms((prev) => ({ ...prev, [slot.id]: { ...form, note: e.target.value } }))}
                                  rows={2}
                                  style={{ flex: 1, padding: "6px 10px", fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", outline: "none", resize: "none" }}
                                />
                                <button
                                  disabled={submittingFeedbackFor === slot.id}
                                  onClick={() => submitInlineFeedback(slot.id, signupId)}
                                  style={{ padding: "6px 16px", fontSize: "0.75rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: submittingFeedbackFor === slot.id ? 0.5 : 1, whiteSpace: "nowrap" }}
                                >
                                  {submittingFeedbackFor === slot.id ? "..." : "Submit"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Profile */}
        {tab === "profile" && profile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "680px" }}>
            {/* Stats */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1.5px solid var(--card-border)", padding: "18px 28px", textAlign: "center" }}>
                <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--gray-900)", lineHeight: 1 }}>{profile.hoursVolunteered}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "6px" }}>Hours Volunteered</p>
              </div>
            </div>

            {/* Languages */}
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "28px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "6px" }}>Languages</h3>
              <p style={{ fontSize: "0.825rem", color: "var(--gray-600)", marginBottom: "12px" }}>Select the languages you speak and can interpret.</p>
              <p style={{ fontSize: "0.8rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "20px" }}>
                You must have a medical-level vocabulary to interpret in a clinical context. Only select languages you are fully confident using in a healthcare setting.
              </p>

              {/* Search box */}
              <div style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  placeholder="Search languages..."
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Currently selected languages */}
              {profileForm.languages.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Your languages</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {profileForm.languages.map((code) => {
                      const lang = ALL_WORLD_LANGUAGES.find((l) => l.code === code);
                      return (
                        <button
                          key={code}
                          onClick={() => toggleLanguage(code)}
                          style={{ padding: "4px 12px", fontSize: "0.75rem", borderRadius: "99px", background: "var(--blue)", color: "#fff", border: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          {lang?.name ?? code}
                          <span style={{ color: "rgba(255,255,255,.7)" }}>×</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Language list */}
              {(() => {
                const query = langSearch.trim().toLowerCase();
                const filtered = query
                  ? ALL_WORLD_LANGUAGES.filter((l) => l.name.toLowerCase().includes(query) || l.code.toLowerCase().includes(query))
                  : ALL_WORLD_LANGUAGES;
                const top10 = filtered.filter((l) => TOP_WORLD_LANGUAGES.some((t) => t.code === l.code));
                const others = filtered.filter((l) => !TOP_WORLD_LANGUAGES.some((t) => t.code === l.code));
                const unselected = [...top10, ...others].filter((l) => !profileForm.languages.includes(l.code));

                return (
                  <div style={{ maxHeight: "220px", overflowY: "auto", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)" }}>
                    {unselected.length === 0 ? (
                      <p style={{ fontSize: "0.8rem", color: "var(--gray-500)", padding: "14px", textAlign: "center" }}>No languages match your search.</p>
                    ) : (
                      <>
                        {!query && top10.filter((l) => !profileForm.languages.includes(l.code)).length > 0 && (
                          <div style={{ padding: "8px 14px 4px" }}>
                            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Most Common</p>
                          </div>
                        )}
                        {!query && top10.filter((l) => !profileForm.languages.includes(l.code)).map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => toggleLanguage(lang.code)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "var(--gray-900)", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                          >
                            {lang.name}
                            <span style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}>Add</span>
                          </button>
                        ))}
                        {!query && others.filter((l) => !profileForm.languages.includes(l.code)).length > 0 && (
                          <div style={{ padding: "8px 14px 4px", borderTop: "1px solid var(--card-border)" }}>
                            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>All Languages</p>
                          </div>
                        )}
                        {(query ? unselected : others.filter((l) => !profileForm.languages.includes(l.code))).map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => toggleLanguage(lang.code)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "var(--gray-900)", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                          >
                            {lang.name}
                            <span style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}>Add</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}

              <button
                disabled={actionLoading === "profile"}
                onClick={saveProfile}
                style={{ marginTop: "16px", padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", opacity: actionLoading === "profile" ? 0.5 : 1 }}
              >
                {actionLoading === "profile" ? "Saving..." : "Save Languages"}
              </button>
            </div>

            {/* Notification Preferences */}
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--gray-900)" }}>Email Notifications</h3>
                {notifSaved && <span style={{ fontSize: "0.8rem", color: "#15803D" }}>Saved</span>}
              </div>
              <p style={{ fontSize: "0.825rem", color: "var(--gray-600)", marginBottom: "24px" }}>Toggles save instantly. We&apos;ll never send you more than you want.</p>

              <div>
                {/* Recommended */}
                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Recommended</p>

                {([
                  { key: "signupReceipt" as const, label: "Signup confirmation", desc: "Sent after you sign up (2 min delay so quick toggles don't flood your inbox)" },
                  { key: "cancellationReceipt" as const, label: "Cancellation receipt", desc: "Confirms when you cancel a shift" },
                  { key: "reminder24h" as const, label: "24-hour reminder", desc: "Email the day before your shift" },
                ] as const).map(({ key, label, desc }) => (
                  <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 0", cursor: "pointer" }}>
                    <button
                      role="switch"
                      aria-checked={notifPrefs[key]}
                      onClick={() => toggleNotif(key)}
                      style={{ marginTop: "2px", position: "relative", display: "inline-flex", height: "20px", width: "36px", flexShrink: 0, borderRadius: "99px", border: "2px solid transparent", background: notifPrefs[key] ? "var(--blue)" : "var(--gray-200)", cursor: "pointer", outline: "none" }}
                    >
                      <span style={{ display: "inline-block", height: "16px", width: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transform: notifPrefs[key] ? "translateX(16px)" : "translateX(0)", transition: "transform .15s" }} />
                    </button>
                    <div>
                      <p style={{ fontSize: "0.875rem", color: "var(--gray-900)" }}>{label}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>{desc}</p>
                    </div>
                  </label>
                ))}

                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--card-border)", marginTop: "8px" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Optional</p>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 0", cursor: "pointer" }}>
                    <button
                      role="switch"
                      aria-checked={notifPrefs.unfilledSlotAlert}
                      onClick={() => toggleNotif("unfilledSlotAlert")}
                      style={{ marginTop: "2px", position: "relative", display: "inline-flex", height: "20px", width: "36px", flexShrink: 0, borderRadius: "99px", border: "2px solid transparent", background: notifPrefs.unfilledSlotAlert ? "var(--blue)" : "var(--gray-200)", cursor: "pointer", outline: "none" }}
                    >
                      <span style={{ display: "inline-block", height: "16px", width: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transform: notifPrefs.unfilledSlotAlert ? "translateX(16px)" : "translateX(0)", transition: "transform .15s" }} />
                    </button>
                    <div>
                      <p style={{ fontSize: "0.875rem", color: "var(--gray-900)" }}>Urgent: unfilled slot alerts</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>Notified immediately when a qualifying slot within 24 hrs has a last-minute opening due to a cancellation</p>
                    </div>
                  </label>
                </div>

                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--card-border)", marginTop: "8px" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Always On</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--gray-600)", paddingLeft: "4px" }}>
                    <p>• Removed from a shift by an admin</p>
                    <p>• Slot cancelled by a clinic</p>
                    <p>• Slot edited and your signup was dropped</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Easter egg */}
            <div style={{ marginTop: "8px", textAlign: "right" }}>
              <button
                onClick={() => setEasterOpen(!easterOpen)}
                style={{ fontSize: "0.75rem", color: "#e2e8f0", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                title="✨"
              >
                ✦
              </button>
            </div>
            {easterOpen && (
              <div
                style={{ borderRadius: "14px", padding: "24px", textAlign: "center", transition: "background .5s", backgroundColor: easterBg === "transparent" ? "#f5f5f4" : easterBg }}
              >
                <p style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "12px" }}>
                  {easterCount === 0 ? "You found it 🎉" : easterCount < 5 ? "Keep going..." : easterCount < 10 ? "Ooh pretty 🌈" : easterCount < 20 ? "Still going? Respect." : "You absolute legend 🏆"}
                </p>
                <button
                  onClick={() => {
                    const colors = ["#fde68a","#bbf7d0","#bfdbfe","#fbcfe8","#ddd6fe","#fed7aa","#99f6e4","#fca5a5","#c4b5fd","#6ee7b7","#f9a8d4","#93c5fd"];
                    const newColor = colors[Math.floor(Math.random() * colors.length)];
                    setEasterBg(newColor);
                    setEasterCount((n) => n + 1);
                  }}
                  style={{ width: "80px", height: "80px", borderRadius: "50%", border: "4px solid #fff", boxShadow: "0 4px 14px rgba(0,0,0,.12)", cursor: "pointer", backgroundColor: easterBg === "transparent" ? "#e7e5e4" : easterBg, transition: "background .3s" }}
                  title="Click me!"
                />
                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "12px" }}>clicks: {easterCount}</p>
              </div>
            )}
          </div>
        )}

        {/* Training */}
        {tab === "training" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {isInstructor && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowTrainingForm(!showTrainingForm)}
                  style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                >
                  {showTrainingForm ? "Cancel" : "+ Add Material"}
                </button>
              </div>
            )}
            {isInstructor && showTrainingForm && (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", margin: 0 }}>New Training Material</h3>
                <input placeholder="Title" value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none" }} />
                <textarea placeholder="Description (optional)" value={trainingForm.description} onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })} rows={2} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", resize: "none" }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["LINK", "FILE"] as const).map((t) => (
                    <button key={t} onClick={() => setTrainingForm({ ...trainingForm, type: t })} style={{ flex: 1, padding: "8px", fontSize: "0.875rem", borderRadius: "9px", border: trainingForm.type === t ? "none" : "1.5px solid var(--card-border)", background: trainingForm.type === t ? "var(--blue)" : "none", color: trainingForm.type === t ? "#fff" : "var(--gray-600)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{t === "LINK" ? "Link" : "File Upload"}</button>
                  ))}
                </div>
                {trainingForm.type === "LINK" ? (
                  <input placeholder="URL (https://...)" value={trainingForm.url} onChange={(e) => setTrainingForm({ ...trainingForm, url: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none" }} />
                ) : (
                  <input type="file" accept=".pdf,.doc,.docx,.pptx,.mp4,.mov" onChange={(e) => setTrainingFile(e.target.files?.[0] ?? null)} style={{ fontSize: "0.875rem", color: "var(--gray-600)" }} />
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--gray-400)", marginBottom: "4px" }}>Language</label>
                    <select value={trainingForm.languageCode} onChange={(e) => setTrainingForm({ ...trainingForm, languageCode: e.target.value })} style={{ width: "100%", padding: "8px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }}>
                      <option value="">All Languages</option>
                      {availableLanguages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--gray-400)", marginBottom: "4px" }}>Category</label>
                    <input placeholder="General" value={trainingForm.category} list="vol-training-categories" onChange={(e) => setTrainingForm({ ...trainingForm, category: e.target.value })} style={{ width: "100%", padding: "8px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", boxSizing: "border-box" }} />
                    <datalist id="vol-training-categories">{["General", "Medical Terminology", "Ethics", "Language-Specific", "Administrative"].map((c) => <option key={c} value={c} />)}</datalist>
                  </div>
                </div>
                {trainingFormError && <p style={{ fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{trainingFormError}</p>}
                <button disabled={trainingSubmitting || !trainingForm.title || (trainingForm.type === "LINK" && !trainingForm.url)} onClick={submitTraining} style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", opacity: trainingSubmitting || !trainingForm.title ? 0.5 : 1, alignSelf: "flex-start" }}>
                  {trainingSubmitting ? "Saving..." : "Add Material"}
                </button>
              </div>
            )}
            {!trainingLoaded ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>Loading training materials...</p>
              </div>
            ) : trainingMaterials.length === 0 ? (
              <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "var(--gray-400)" }}>No training materials available yet.</p>
              </div>
            ) : (() => {
              const categories = Array.from(new Set(trainingMaterials.map((m) => m.category))).sort();
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {categories.map((cat) => (
                    <div key={cat}>
                      <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>{cat}</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {trainingMaterials.filter((m) => m.category === cat).map((m) => (
                          <div key={m.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                                  <span style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: "0.875rem" }}>{m.title}</span>
                                  {isInstructor && session?.user?.email === m.uploadedBy.email && (
                                    <button onClick={() => deleteTraining(m.id)} style={{ fontSize: "0.72rem", padding: "2px 8px", background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Delete</button>
                                  )}
                                  {m.languageCode && (
                                    <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", background: "var(--blue-light)", color: "var(--navy)" }}>{m.languageCode}</span>
                                  )}
                                  <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", background: m.type === "FILE" ? "#fffbeb" : "var(--green-light)", color: m.type === "FILE" ? "#92400e" : "var(--green)" }}>
                                    {m.type}
                                  </span>
                                </div>
                                {m.description && <p style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "8px" }}>{m.description}</p>}
                                {m.type === "FILE" ? (
                                  <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--gray-600)", textDecoration: "underline" }}>
                                    {m.fileName ?? "Download"}
                                  </a>
                                ) : (
                                  <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--blue)", textDecoration: "underline", wordBreak: "break-all" }}>
                                    {m.url}
                                  </a>
                                )}
                                <p style={{ fontSize: "0.72rem", color: "var(--gray-400)", marginTop: "8px" }}>
                                  by {m.uploadedBy.name ?? m.uploadedBy.email} · {new Date(m.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Clearance — instructor only */}
        {tab === "clearance" && isInstructor && (() => {
          const myRoles = session?.user?.roles ?? [];
          const myClearedLangs = myRoles.filter((r) => r.startsWith("LANG_") && r.endsWith("_CLEARED")).map((r) => r.slice(5, -8));
          const relevant = clearanceVolunteers.filter((v) =>
            myClearedLangs.some((lang) => (v.roles ?? []).some((r) => r === `LANG_${lang}` || r === `LANG_${lang}_CLEARED`))
          );
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "var(--card-bg)", borderRadius: "10px", border: "1.5px solid var(--card-border)", padding: "10px 16px", fontSize: "0.75rem", color: "var(--gray-500)" }}>
                You can clear volunteers for languages you are yourself cleared for: {myClearedLangs.length === 0 ? "none yet" : myClearedLangs.join(", ")}
              </div>
              {!clearanceLoaded ? (
                <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                  <p style={{ color: "var(--gray-400)" }}>Loading volunteers...</p>
                </div>
              ) : relevant.length === 0 ? (
                <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
                  <p style={{ color: "var(--gray-400)" }}>No volunteers have your cleared languages yet.</p>
                </div>
              ) : (
                <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1.5px solid var(--card-border)" }}>
                        <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Volunteer</th>
                        <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Languages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relevant.map((v) => {
                        const vRoles = v.roles ?? [];
                        const langRows = myClearedLangs.filter((lang) => vRoles.some((r) => r === `LANG_${lang}` || r === `LANG_${lang}_CLEARED`));
                        return (
                          <tr key={v.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            <td style={{ padding: "14px 20px" }}>
                              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--gray-900)" }}>{v.name ?? "—"}</p>
                              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>{v.email}</p>
                            </td>
                            <td style={{ padding: "14px 20px" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {langRows.map((lang) => {
                                  const isCleared = vRoles.includes(`LANG_${lang}_CLEARED`);
                                  const loadingKey = `${v.id}-${lang}`;
                                  return (
                                    <span key={lang} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600, background: isCleared ? "#F0FDFA" : "#FAFAFA", color: isCleared ? "#0F766E" : "#64748B", border: isCleared ? "1px solid #99F6E4" : "1px solid #CBD5E1" }}>
                                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isCleared ? "#10B981" : "#94A3B8", flexShrink: 0 }} />
                                      {lang}
                                      <button
                                        disabled={clearanceActionLoading === loadingKey}
                                        onClick={() => toggleLangClearance(v.id, lang)}
                                        style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", border: "none", background: isCleared ? "#FECACA" : "#BBF7D0", color: isCleared ? "#DC2626" : "#15803D", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: clearanceActionLoading === loadingKey ? 0.5 : 1 }}
                                      >
                                        {clearanceActionLoading === loadingKey ? "…" : isCleared ? "Revoke" : "Clear"}
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* Suggestions */}
        {tab === "suggestions" && (
          <div style={{ maxWidth: "512px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "4px" }}>Messages</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginBottom: "20px" }}>Have a suggestion or feedback for the website? We&apos;d love to hear it.</p>

              {suggSuccess ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ color: "var(--green)", fontWeight: 500, fontSize: "0.875rem" }}>Thanks! Your suggestion has been submitted.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "4px" }}>Type</label>
                    <select
                      value={suggForm.type}
                      onChange={(e) => setSuggForm({ ...suggForm, type: e.target.value })}
                      style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", boxSizing: "border-box" }}
                    >
                      <option value="FEATURE">Feature Request</option>
                      <option value="BUG">Bug Report</option>
                      <option value="GENERAL">General Feedback</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "4px" }}>Subject</label>
                    <input
                      type="text"
                      placeholder="Brief subject..."
                      value={suggForm.subject}
                      onChange={(e) => setSuggForm({ ...suggForm, subject: e.target.value })}
                      style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "4px" }}>Message</label>
                    <textarea
                      placeholder="Describe your suggestion in detail..."
                      value={suggForm.message}
                      onChange={(e) => setSuggForm({ ...suggForm, message: e.target.value })}
                      rows={4}
                      style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", resize: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  {suggError && <p style={{ fontSize: "0.75rem", color: "#dc2626" }}>{suggError}</p>}
                  <button
                    disabled={suggSubmitting || !suggForm.subject.trim() || !suggForm.message.trim()}
                    onClick={submitSuggestion}
                    style={{ padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", opacity: suggSubmitting || !suggForm.subject.trim() || !suggForm.message.trim() ? 0.5 : 1 }}
                  >
                    {suggSubmitting ? "Submitting..." : "Submit Suggestion"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Anti-spam modal */}
      {spamModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "14px", boxShadow: "0 20px 60px rgba(0,0,0,.15)", width: "100%", maxWidth: "384px", padding: "24px", textAlign: "center" }}>
            {spamModal.isBlocked ? (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🎨</div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "8px" }}>Looks like you enjoy clicking!</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "16px" }}>You&apos;ve cancelled this shift too many times. Each cancellation within 24 hours sends an urgent alert to the clinic. We made something for you to click instead.</p>
                <button
                  onClick={() => { setSpamModal(null); setTab("profile"); setEasterOpen(true); }}
                  style={{ width: "100%", padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", marginBottom: "8px" }}
                >
                  Take me there →
                </button>
                <button onClick={() => setSpamModal(null)} style={{ fontSize: "0.75rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Dismiss</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "8px" }}>Heads up</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--gray-600)", marginBottom: "16px" }}>Cancelling a shift within 24 hours sends an urgent email alert to the clinic. Please be considerate of their time. Are you sure you want to cancel?</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => setSpamModal(null)}
                    style={{ flex: 1, padding: "9px 20px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "var(--gray-600)", borderRadius: "9px", background: "var(--card-bg)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Keep Signup
                  </button>
                  <button
                    onClick={spamModal.onProceed ?? (() => setSpamModal(null))}
                    style={{ flex: 1, padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer" }}
                  >
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
