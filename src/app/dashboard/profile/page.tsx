"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";

type VolunteerProfile = {
  id: string;
  languages: string[];
  backgroundInfo: string | null;
  hoursVolunteered: number;
  clearanceStatus: string | null;
  clearanceDate: string | null;
  userCreatedAt?: string;
};

type VolunteerNotifPrefs = {
  signupReceipt: boolean;
  cancellationReceipt: boolean;
  reminder24h: boolean;
  unfilledSlotAlert: boolean;
};

// Top 10 most spoken world languages first, then rest alphabetically
const TOP_WORLD_LANGUAGES = [
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

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState<{ languages: string[] }>({ languages: [] });
  const [notifPrefs, setNotifPrefs] = useState<VolunteerNotifPrefs>({
    signupReceipt: true,
    cancellationReceipt: true,
    reminder24h: true,
    unfilledSlotAlert: false,
  });
  const [notifSaved, setNotifSaved] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [langSearch, setLangSearch] = useState("");
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    const [profileRes, notifRes] = await Promise.all([
      fetch("/api/volunteer/profile"),
      fetch("/api/volunteer/notif-prefs"),
    ]);
    if (profileRes.ok) {
      const p = await profileRes.json();
      setProfile(p);
      setProfileForm({ languages: p.languages ?? [] });
    }
    if (notifRes.ok) setNotifPrefs(await notifRes.json());
    setLoading(false);

    fetch("/api/languages")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAvailableLanguages(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
    void saveNotifPrefs(updated);
  };

  const toggleLanguage = async (lang: string) => {
    const isRemoving = profileForm.languages.includes(lang);
    const langs = isRemoving
      ? profileForm.languages.filter((l) => l !== lang)
      : [...profileForm.languages, lang];
    setActionLoading("profile");
    const res = await fetch("/api/volunteer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languages: langs }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProfile(updated);
      setProfileForm({ languages: langs });
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: "24px" }}>My Profile</h1>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "20px", alignItems: "start" }}>

        {/* Left sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Identity card */}
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", boxShadow: "0 1px 4px rgba(0,0,0,.04)", padding: "20px" }}>
            <p style={{ fontSize: "1rem", fontWeight: 700, color: "#111827" }}>{session?.user?.name}</p>
            <p style={{ fontSize: "0.75rem", color: "#111827", marginTop: "3px" }}>{session?.user?.email}</p>
            {profile.userCreatedAt && (
              <p style={{ fontSize: "0.7rem", color: "#111827", marginTop: "6px" }}>
                Member since {new Date(profile.userCreatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </p>
            )}
            <div style={{ width: "100%", height: "1px", background: "#F3F4F6", margin: "14px 0" }} />
            <div style={{ background: "#F0F7FF", border: "1px solid #BFDBFE", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1D4ED8", lineHeight: 1 }}>{profile.hoursVolunteered}</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.07em", lineHeight: 1.4 }}>Hours<br />Volunteered</span>
            </div>
          </div>

          {/* Notifications card */}
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em" }}>Notifications</h3>
              {notifSaved && <span style={{ fontSize: "0.75rem", color: "#15803D" }}>Saved</span>}
            </div>
            <div style={{ padding: "14px 18px" }}>
              {([
                { key: "signupReceipt" as const, label: "Signup confirmation", desc: "Email on signup" },
                { key: "cancellationReceipt" as const, label: "Cancellation receipt", desc: "Email on cancellation" },
                { key: "reminder24h" as const, label: "24-hour reminder", desc: "Day-before reminder" },
                { key: "unfilledSlotAlert" as const, label: "Unfilled slot alerts", desc: "Open shifts in your languages" },
              ] as const).map(({ key, label, desc }, i, arr) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111827" }}>{label}</p>
                    <p style={{ fontSize: "0.72rem", color: "#111827", marginTop: "2px" }}>{desc}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={notifPrefs[key]}
                    onClick={() => toggleNotif(key)}
                    style={{ flexShrink: 0, position: "relative", display: "inline-flex", height: "21px", width: "38px", borderRadius: "99px", border: "none", background: notifPrefs[key] ? "#2563EB" : "#D1D5DB", cursor: "pointer", outline: "none", padding: 0 }}
                  >
                    <span style={{ display: "inline-block", height: "15px", width: "15px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", position: "absolute", top: "3px", left: notifPrefs[key] ? "20px" : "3px", transition: "left .15s" }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right column: Languages */}
        <div>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em" }}>Languages</h3>
              <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "#111827" }}>Medical-level proficiency only</span>
            </div>
            <div style={{ padding: "18px 20px" }}>

              {/* Blue disclaimer */}
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "8px", padding: "9px 13px", marginBottom: "18px", fontSize: "0.78rem", color: "#1E40AF", lineHeight: 1.5 }}>
                Only select languages you are fully confident using in a <strong>healthcare setting</strong> with medical vocabulary.
              </div>

              {/* Current languages */}
              {profileForm.languages.length > 0 && (
                <div style={{ marginBottom: "18px" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", marginBottom: "10px" }}>Your languages</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {profileForm.languages.map((code) => {
                      const lang = ALL_WORLD_LANGUAGES.find((l) => l.code === code);
                      const myRoles = session?.user?.roles ?? [];
                      const isCleared = myRoles.includes(`LANG_${code}_CLEARED`);
                      const isDenied = myRoles.includes(`LANG_${code}_DENIED`);
                      const chipStyle = isCleared
                        ? { bg: "#BBF7D0", color: "#15803D", border: "1px solid #86EFAC", dot: "#10B981", label: "Cleared" }
                        : isDenied
                        ? { bg: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", dot: "#EF4444", label: "Denied" }
                        : { bg: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A", dot: "#F59E0B", label: "Pending" };
                      const showRemove = true;
                      return (
                        <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "99px", fontSize: "0.78rem", fontWeight: 600, background: chipStyle.bg, color: chipStyle.color, border: chipStyle.border }}>
                          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: chipStyle.dot, flexShrink: 0 }} />
                          {lang?.name ?? code}
                          <span style={{ fontSize: "0.68rem", opacity: 0.75 }}>· {chipStyle.label}</span>
                          {showRemove && (
                            <button
                              onClick={() => void toggleLanguage(code)}
                              style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: "0.9rem", lineHeight: 1, padding: "0 0 0 2px", color: "inherit", fontFamily: "'DM Sans', sans-serif" }}
                              title="Remove language"
                            >×</button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search */}
              <input
                type="text"
                placeholder="Search languages to add…"
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", color: "var(--gray-900)", outline: "none", background: "#FAFAFA", marginBottom: "10px", boxSizing: "border-box" }}
              />

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
                  <div style={{ border: "1.5px solid var(--card-border)", borderRadius: "10px", overflow: "hidden", maxHeight: "180px", overflowY: "auto" }}>
                    {unselected.length === 0 ? (
                      <p style={{ fontSize: "0.8rem", color: "#111827", padding: "14px", textAlign: "center" }}>No languages match your search.</p>
                    ) : (
                      <>
                        {!query && top10.filter((l) => !profileForm.languages.includes(l.code)).length > 0 && (
                          <div style={{ padding: "7px 14px 4px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                            Most Common
                          </div>
                        )}
                        {!query && top10.filter((l) => !profileForm.languages.includes(l.code)).map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => void toggleLanguage(lang.code)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "var(--gray-900)", background: "none", border: "none", borderBottom: "1px solid #F9FAFB", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                          >
                            {lang.name}
                            <span style={{ fontSize: "0.72rem", color: "#111827", fontWeight: 500 }}>+ Add</span>
                          </button>
                        ))}
                        {!query && others.filter((l) => !profileForm.languages.includes(l.code)).length > 0 && (
                          <div style={{ padding: "7px 14px 4px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", background: "#FAFAFA", borderBottom: "1px solid #F3F4F6", borderTop: "1px solid #F3F4F6" }}>
                            All Languages
                          </div>
                        )}
                        {(query ? unselected : others.filter((l) => !profileForm.languages.includes(l.code))).map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => void toggleLanguage(lang.code)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "var(--gray-900)", background: "none", border: "none", borderBottom: "1px solid #F9FAFB", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                          >
                            {lang.name}
                            <span style={{ fontSize: "0.72rem", color: "#111827", fontWeight: 500 }}>+ Add</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}

              {actionLoading === "profile" && (
                <p style={{ marginTop: "10px", fontSize: "0.78rem", color: "#111827" }}>Saving…</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
