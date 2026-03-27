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

type Tab = "browse" | "signups" | "profile" | "training" | "suggestions";

type FeedbackEntry = { id: string; authorRole: string; rating: number | null; note: string; createdAt: string };

const RATING_OPTIONS = [
  { value: 1, label: "Needs Improvement", active: "bg-red-100 text-red-700 border-red-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-red-200 hover:text-red-600" },
  { value: 2, label: "Okay",              active: "bg-orange-100 text-orange-700 border-orange-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-orange-200 hover:text-orange-600" },
  { value: 3, label: "Good",              active: "bg-yellow-100 text-yellow-700 border-yellow-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-yellow-200 hover:text-yellow-600" },
  { value: 4, label: "Excellent",         active: "bg-green-100 text-green-700 border-green-300",  idle: "bg-white text-stone-500 border-stone-200 hover:border-green-200 hover:text-green-600" },
  { value: 5, label: "Exceptional", active: "bg-emerald-100 text-emerald-700 border-emerald-300", idle: "bg-white text-stone-500 border-stone-200 hover:border-emerald-200 hover:text-emerald-600" },
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
  const q = encodeURIComponent(address);
  return (
    <span className="inline-flex gap-1.5 ml-1.5 items-center">
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${q}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-[#4A90D9] hover:text-[#041E42] underline"
        title="Google Maps"
      >
        G Maps
      </a>
      <span className="text-stone-300">·</span>
      <a
        href={`https://maps.apple.com/?q=${q}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-[#4A90D9] hover:text-[#041E42] underline"
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

  // Suggestions state
  const [suggForm, setSuggForm] = useState({ type: "FEATURE", subject: "", message: "" });
  const [suggSubmitting, setSuggSubmitting] = useState(false);
  const [suggSuccess, setSuggSuccess] = useState(false);
  const [suggError, setSuggError] = useState("");

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
    if (role === "VOLUNTEER" || role === "ADMIN" || role === "SUPER_ADMIN") {
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
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
              <p className="text-xs text-stone-400">Volunteer Dashboard</p>
            </div>
            <button
              onClick={() => setTab("suggestions")}
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Contact Us
            </button>
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
        <div className="flex gap-1 bg-stone-200/50 p-1 rounded-xl w-fit">
          {[
            { key: "browse" as Tab, label: "Browse Slots", count: 0 },
            { key: "signups" as Tab, label: "My Signups", count: mySignups.length },
            { key: "profile" as Tab, label: "Profile", count: 0 },
            { key: "training" as Tab, label: "Training", count: 0 },
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
              }}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                tab === t.key
                  ? "bg-[#041E42] text-white shadow-sm font-medium"
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
                    {slot.clinic.address && (
                      <p className="text-xs text-stone-400">
                        {slot.clinic.address}
                        <MapsLinks address={slot.clinic.address} />
                      </p>
                    )}
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
                            onClick={() => cancelSignup(mySignupEntry.id, `${slot.id}-${hour}`)}
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
                            className="text-xs px-3 py-1 bg-[#041E42] text-white hover:bg-[#03163a] rounded-full transition-colors disabled:opacity-50"
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
                {["ALL", ...availableLanguages.map((l) => l.code)].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLangFilter(lang)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      langFilter === lang
                        ? "bg-[#041E42] text-white"
                        : "bg-white border border-stone-200 text-stone-500 hover:border-stone-300"
                    }`}
                  >
                    {lang === "ALL" ? "All Languages" : (availableLanguages.find((l) => l.code === lang)?.name ?? LANG_LABELS[lang] ?? lang)}
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
                          <span className="text-xs text-stone-400">
                            {slot.clinic.address}
                            <MapsLinks address={slot.clinic.address} />
                          </span>
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
                                onClick={() => cancelSignup(sig.id, `${sig.slot.id}-${sig.subBlockHour}`)}
                                className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ))}
                      </div>
                      {/* Inline feedback for past slots */}
                      {(() => {
                        const end = new Date(slot.date.slice(0, 10) + "T" + String(slot.endTime).padStart(2, "0") + ":00:00");
                        if (end >= new Date()) return null;
                        const signupId = sigs[0].id;
                        if (feedbackGiven.has(slot.id)) {
                          return <p className="mt-3 pt-3 border-t border-stone-100 text-xs text-emerald-600">✓ Feedback submitted</p>;
                        }
                        const form = feedbackForms[slot.id] ?? { rating: 0, note: "" };
                        return (
                          <div className="mt-3 pt-3 border-t border-stone-100">
                            <p className="text-xs text-stone-500 mb-2 font-medium">How was your shift at {slot.clinic.name}?</p>
                            <div className="flex flex-wrap gap-1.5 mb-2">
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
                              <div className="flex gap-2 items-start mt-2">
                                <textarea
                                  placeholder="Any comments? (optional)"
                                  value={form.note}
                                  onChange={(e) => setFeedbackForms((prev) => ({ ...prev, [slot.id]: { ...form, note: e.target.value } }))}
                                  rows={2}
                                  className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-300 resize-none"
                                />
                                <button
                                  disabled={submittingFeedbackFor === slot.id}
                                  onClick={() => submitInlineFeedback(slot.id, signupId)}
                                  className="px-3 py-1.5 text-xs bg-[#041E42] text-white rounded-full hover:bg-[#03163a] transition-colors disabled:opacity-50 whitespace-nowrap"
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
          <div className="space-y-4">
            {/* Stats */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 text-center w-48">
              <p className="text-2xl font-semibold text-stone-800">{profile.hoursVolunteered}</p>
              <p className="text-xs text-stone-400 mt-1">Hours Volunteered</p>
            </div>

            {/* Languages */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h3 className="text-sm font-medium text-stone-700 mb-1">Languages</h3>
              <p className="text-xs text-stone-400 mb-1">Select the languages you speak and can interpret.</p>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mb-4">
                ⚠️ You must have a medical-level vocabulary to effectively translate in a clinical context. Only select languages you are confident interpreting in a healthcare setting.
              </p>

              {/* Search box */}
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search languages..."
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>

              {/* Currently selected languages */}
              {profileForm.languages.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Selected</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profileForm.languages.map((code) => {
                      const lang = ALL_WORLD_LANGUAGES.find((l) => l.code === code);
                      return (
                        <button
                          key={code}
                          onClick={() => toggleLanguage(code)}
                          className="px-3 py-1 text-xs rounded-full bg-[#041E42] text-white hover:bg-[#03163a] transition-colors flex items-center gap-1"
                        >
                          {lang?.name ?? code}
                          <span className="text-stone-400">×</span>
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
                  <div className="max-h-48 overflow-y-auto border border-stone-100 rounded-md">
                    {unselected.length === 0 ? (
                      <p className="text-xs text-stone-400 p-3 text-center">No languages match your search.</p>
                    ) : (
                      <>
                        {!query && top10.filter((l) => !profileForm.languages.includes(l.code)).length > 0 && (
                          <div className="px-3 pt-2 pb-1">
                            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Most Common</p>
                          </div>
                        )}
                        {!query && top10.filter((l) => !profileForm.languages.includes(l.code)).map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => toggleLanguage(lang.code)}
                            className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors flex items-center justify-between"
                          >
                            {lang.name}
                            <span className="text-xs text-stone-300">+</span>
                          </button>
                        ))}
                        {!query && others.filter((l) => !profileForm.languages.includes(l.code)).length > 0 && (
                          <div className="px-3 pt-2 pb-1 border-t border-stone-50">
                            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">All Languages</p>
                          </div>
                        )}
                        {(query ? unselected : others.filter((l) => !profileForm.languages.includes(l.code))).map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => toggleLanguage(lang.code)}
                            className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors flex items-center justify-between"
                          >
                            {lang.name}
                            <span className="text-xs text-stone-300">+</span>
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
                className="mt-4 px-4 py-2 text-sm bg-[#041E42] text-white hover:bg-[#03163a] rounded-full transition-colors disabled:opacity-50"
              >
                {actionLoading === "profile" ? "Saving..." : "Save Languages"}
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
                        notifPrefs[key] ? "bg-[#041E42]" : "bg-stone-200"
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
                        notifPrefs.unfilledSlotAlert ? "bg-[#041E42]" : "bg-stone-200"
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

            {/* Easter egg */}
            <div className="mt-2 text-right">
              <button
                onClick={() => setEasterOpen(!easterOpen)}
                className="text-xs text-stone-200 hover:text-stone-400 transition-colors select-none"
                title="✨"
              >
                ✦
              </button>
            </div>
            {easterOpen && (
              <div
                className="rounded-xl p-6 text-center transition-all duration-500"
                style={{ backgroundColor: easterBg === "transparent" ? "#f5f5f4" : easterBg }}
              >
                <p className="text-xs text-stone-500 mb-3">
                  {easterCount === 0 ? "You found it 🎉" : easterCount < 5 ? "Keep going..." : easterCount < 10 ? "Ooh pretty 🌈" : easterCount < 20 ? "Still going? Respect." : "You absolute legend 🏆"}
                </p>
                <button
                  onClick={() => {
                    const colors = ["#fde68a","#bbf7d0","#bfdbfe","#fbcfe8","#ddd6fe","#fed7aa","#99f6e4","#fca5a5","#c4b5fd","#6ee7b7","#f9a8d4","#93c5fd"];
                    const newColor = colors[Math.floor(Math.random() * colors.length)];
                    setEasterBg(newColor);
                    setEasterCount((n) => n + 1);
                  }}
                  className="w-20 h-20 rounded-full border-4 border-white shadow-lg transition-all duration-300 hover:scale-110 active:scale-95"
                  style={{ backgroundColor: easterBg === "transparent" ? "#e7e5e4" : easterBg }}
                  title="Click me!"
                />
                <p className="text-xs text-stone-400 mt-3">clicks: {easterCount}</p>
              </div>
            )}
          </div>
        )}

        {/* Training */}
        {tab === "training" && (
          <div className="space-y-4">
            {!trainingLoaded ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">Loading training materials...</p>
              </div>
            ) : trainingMaterials.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No training materials available yet.</p>
              </div>
            ) : (() => {
              const categories = Array.from(new Set(trainingMaterials.map((m) => m.category))).sort();
              return (
                <div className="space-y-6">
                  {categories.map((cat) => (
                    <div key={cat}>
                      <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">{cat}</h3>
                      <div className="space-y-3">
                        {trainingMaterials.filter((m) => m.category === cat).map((m) => (
                          <div key={m.id} className="bg-white rounded-xl border border-stone-200 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-medium text-stone-800 text-sm">{m.title}</span>
                                  {m.languageCode && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#EBF3FC] text-[#041E42]">{m.languageCode}</span>
                                  )}
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${m.type === "FILE" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                                    {m.type}
                                  </span>
                                </div>
                                {m.description && <p className="text-xs text-stone-500 mb-2">{m.description}</p>}
                                {m.type === "FILE" ? (
                                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-stone-600 hover:text-stone-800 underline">
                                    {m.fileName ?? "Download"}
                                  </a>
                                ) : (
                                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4A90D9] hover:text-[#041E42] underline break-all">
                                    {m.url}
                                  </a>
                                )}
                                <p className="text-xs text-stone-400 mt-2">
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
      </div>

      {/* Suggestions */}
      {tab === "suggestions" && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h3 className="text-sm font-medium text-stone-700 mb-1">Messages</h3>
            <p className="text-xs text-stone-400 mb-5">Have a suggestion or feedback for the website? We&apos;d love to hear it.</p>

            {suggSuccess ? (
              <div className="text-center py-6">
                <p className="text-emerald-600 font-medium text-sm">Thanks! Your suggestion has been submitted.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Type</label>
                  <select
                    value={suggForm.type}
                    onChange={(e) => setSuggForm({ ...suggForm, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
                  >
                    <option value="FEATURE">Feature Request</option>
                    <option value="BUG">Bug Report</option>
                    <option value="GENERAL">General Feedback</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Subject</label>
                  <input
                    type="text"
                    placeholder="Brief subject..."
                    value={suggForm.subject}
                    onChange={(e) => setSuggForm({ ...suggForm, subject: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Message</label>
                  <textarea
                    placeholder="Describe your suggestion in detail..."
                    value={suggForm.message}
                    onChange={(e) => setSuggForm({ ...suggForm, message: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
                  />
                </div>
                {suggError && <p className="text-xs text-red-500">{suggError}</p>}
                <button
                  disabled={suggSubmitting || !suggForm.subject.trim() || !suggForm.message.trim()}
                  onClick={submitSuggestion}
                  className="px-4 py-2 text-sm bg-[#041E42] text-white hover:bg-[#03163a] rounded-full transition-colors disabled:opacity-50"
                >
                  {suggSubmitting ? "Submitting..." : "Submit Suggestion"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anti-spam modal */}
      {spamModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            {spamModal.isBlocked ? (
              <>
                <div className="text-4xl mb-3">🎨</div>
                <h3 className="text-sm font-semibold text-stone-800 mb-2">Looks like you enjoy clicking!</h3>
                <p className="text-xs text-stone-500 mb-4">You&apos;ve cancelled this shift too many times. Each cancellation within 24 hours sends an urgent alert to the clinic. We made something for you to click instead.</p>
                <button
                  onClick={() => { setSpamModal(null); setTab("profile"); setEasterOpen(true); }}
                  className="w-full px-4 py-2 text-sm bg-[#041E42] text-white rounded-full hover:bg-[#03163a] transition-colors mb-2"
                >
                  Take me there →
                </button>
                <button onClick={() => setSpamModal(null)} className="text-xs text-stone-400 hover:text-stone-600">Dismiss</button>
              </>
            ) : (
              <>
                <div className="text-3xl mb-3">⚠️</div>
                <h3 className="text-sm font-semibold text-stone-800 mb-2">Heads up</h3>
                <p className="text-xs text-stone-500 mb-4">Cancelling a shift within 24 hours sends an urgent email alert to the clinic. Please be considerate of their time. Are you sure you want to cancel?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSpamModal(null)}
                    className="flex-1 px-4 py-2 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50"
                  >
                    Keep Signup
                  </button>
                  <button
                    onClick={spamModal.onProceed ?? (() => setSpamModal(null))}
                    className="flex-1 px-4 py-2 text-sm bg-[#041E42] text-white rounded-full hover:bg-[#03163a]"
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
