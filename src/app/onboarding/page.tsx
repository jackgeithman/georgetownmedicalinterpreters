"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LANGUAGE_MAP } from "@/lib/languages";

const TOP_LANGUAGE_CODES = ["ZH", "HI", "ES", "FR", "AR", "BN", "PT", "RU", "UR"];

const ALL_LANGUAGES = Object.entries(LANGUAGE_MAP)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => {
    const aTop = TOP_LANGUAGE_CODES.indexOf(a.code);
    const bTop = TOP_LANGUAGE_CODES.indexOf(b.code);
    if (aTop !== -1 && bTop !== -1) return aTop - bTop;
    if (aTop !== -1) return -1;
    if (bTop !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

type Role = "VOLUNTEER" | "INSTRUCTOR" | "ADMIN";

const ROLES: { id: Role; label: string; desc: string }[] = [
  { id: "VOLUNTEER", label: "Volunteer", desc: "Sign up for clinic interpretation shifts" },
  { id: "INSTRUCTOR", label: "Instructor", desc: "Lead training sessions and manage language clearances" },
  { id: "ADMIN", label: "Admin", desc: "Manage users, schedules, and clinic settings" },
];

export default function OnboardingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [langSearch, setLangSearch] = useState("");
  const [requestedDriverClearance, setRequestedDriverClearance] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    signupReceipt: true,
    cancellationReceipt: true,
    reminder24h: true,
    unfilledSlotAlert: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      if (session.user.status === "DELETED") {
        void signOut({ callbackUrl: "/login" });
        return;
      }
      if (session.user.onboardingComplete) {
        // Already submitted — send to appropriate place
        if (session.user.status === "PENDING_APPROVAL") router.push("/pending");
        else router.push("/dashboard");
      }
    }
  }, [status, session, router]);

  const toggleRole = (role: Role) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const toggleLanguage = (code: string) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleNotif = (key: keyof typeof notifPrefs) => {
    setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (selectedRoles.length === 0) {
      setError("Please select at least one role.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
          roles: selectedRoles,
          languages,
          notifPrefs: selectedRoles.includes("VOLUNTEER") ? notifPrefs : null,
          requestedDriverClearance: selectedRoles.includes("VOLUNTEER") ? requestedDriverClearance : false,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      // Force session context refresh so layout sees onboardingComplete: true before navigating
      await update();
      router.push("/pending");
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && session.user.onboardingComplete)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "#111827" }}>Loading…</p>
      </div>
    );
  }

  const userEmail = session?.user?.email ?? "";
  const isVolunteer = selectedRoles.includes("VOLUNTEER");

  const query = langSearch.trim().toLowerCase();
  const filtered = query
    ? ALL_LANGUAGES.filter((l) => l.name.toLowerCase().includes(query) || l.code.toLowerCase().includes(query))
    : ALL_LANGUAGES;
  const topFiltered = filtered.filter((l) => TOP_LANGUAGE_CODES.includes(l.code));
  const otherFiltered = filtered.filter((l) => !TOP_LANGUAGE_CODES.includes(l.code));
  const unselected = [...topFiltered, ...otherFiltered].filter((l) => !languages.includes(l.code));

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: "80px" }}>

      {/* Header */}
      <div style={{ width: "100%", background: "#0D1F3C", padding: "20px 32px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fff", letterSpacing: "-0.01em" }}>
          Georgetown Medical Interpreters
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: "640px", padding: "0 20px", display: "flex", flexDirection: "column", gap: "32px" }}>

        {/* Intro */}
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#111827", marginBottom: "8px", lineHeight: 1.2 }}>
            Welcome to GMI
          </h1>
          <p style={{ fontSize: "0.95rem", color: "#111827", lineHeight: 1.6 }}>
            Let&apos;s get your account set up. Fill out the form below and an admin will review your request.
          </p>
        </div>

        {/* Section 1 — Identity */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6" }}>
            <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Your Name</h2>
          </div>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                Preferred first name <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Jack"
                style={{ width: "100%", padding: "10px 13px", fontSize: "0.9rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", color: "#111827", outline: "none", background: "#fff", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                Last name <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Smith"
                style={{ width: "100%", padding: "10px 13px", fontSize: "0.9rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", color: "#111827", outline: "none", background: "#fff", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                Phone number <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#374151" }}>(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. (202) 555-0100"
                style={{ width: "100%", padding: "10px 13px", fontSize: "0.9rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", color: "#111827", outline: "none", background: "#fff", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* Section 2 — Roles */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6" }}>
            <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Roles</h2>
          </div>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "0.82rem", color: "#111827", marginBottom: "4px", lineHeight: 1.5 }}>
              Select all that apply. Each role is reviewed and approved individually.
            </p>
            {ROLES.map(({ id, label, desc }) => {
              const active = selectedRoles.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleRole(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: active ? "1.5px solid #F59E0B" : "1.5px solid var(--card-border)",
                    background: active ? "#FFFBEB" : "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827", margin: 0 }}>{label}</p>
                    <p style={{ fontSize: "0.78rem", color: "#111827", margin: "2px 0 0" }}>{desc}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    {active && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "99px", fontSize: "0.7rem", fontWeight: 600, background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                        Pending approval
                      </span>
                    )}
                    <span style={{
                      width: "20px", height: "20px", borderRadius: "6px", border: active ? "2px solid #F59E0B" : "2px solid #D1D5DB",
                      background: active ? "#F59E0B" : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      {active && <span style={{ color: "#fff", fontSize: "0.75rem", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3 — Languages */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Languages</h2>
            <span style={{ fontSize: "0.72rem", color: "#111827", fontWeight: 500 }}>Optional — medical-level only</span>
          </div>
          <div style={{ padding: "18px 20px" }}>
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "8px", padding: "9px 13px", marginBottom: "18px", fontSize: "0.78rem", color: "#1E40AF", lineHeight: 1.5 }}>
              Only select languages you are fully confident using in a <strong>healthcare setting</strong> with medical vocabulary.
            </div>

            {languages.length > 0 && (
              <div style={{ marginBottom: "18px" }}>
                <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", marginBottom: "10px" }}>Selected</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {languages.map((code) => {
                    const name = LANGUAGE_MAP[code] ?? code;
                    return (
                      <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "99px", fontSize: "0.78rem", fontWeight: 600, background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                        {name}
                        <span style={{ fontSize: "0.68rem", opacity: 0.75 }}>· Pending</span>
                        <button
                          onClick={() => toggleLanguage(code)}
                          style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: "0.9rem", lineHeight: 1, padding: "0 0 0 2px", color: "inherit", fontFamily: "'DM Sans', sans-serif" }}
                          title="Remove language"
                        >×</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <input
              type="text"
              placeholder="Search languages to add…"
              value={langSearch}
              onChange={(e) => setLangSearch(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", color: "#111827", outline: "none", background: "#FAFAFA", marginBottom: "10px", boxSizing: "border-box" }}
            />

            <div style={{ border: "1.5px solid var(--card-border)", borderRadius: "10px", overflow: "hidden", maxHeight: "180px", overflowY: "auto" }}>
              {unselected.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "#111827", padding: "14px", textAlign: "center" }}>
                  {languages.length > 0 && !query ? "All languages added." : "No languages match your search."}
                </p>
              ) : (
                <>
                  {!query && topFiltered.filter((l) => !languages.includes(l.code)).length > 0 && (
                    <div style={{ padding: "7px 14px 4px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                      Most Common
                    </div>
                  )}
                  {!query && topFiltered.filter((l) => !languages.includes(l.code)).map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => toggleLanguage(lang.code)}
                      style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "var(--gray-900)", background: "none", border: "none", borderBottom: "1px solid #F9FAFB", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    >
                      {lang.name}
                      <span style={{ fontSize: "0.72rem", color: "#111827", fontWeight: 500 }}>+ Add</span>
                    </button>
                  ))}
                  {!query && otherFiltered.filter((l) => !languages.includes(l.code)).length > 0 && (
                    <div style={{ padding: "7px 14px 4px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", background: "#FAFAFA", borderBottom: "1px solid #F3F4F6", borderTop: "1px solid #F3F4F6" }}>
                      All Languages
                    </div>
                  )}
                  {(query ? unselected : otherFiltered.filter((l) => !languages.includes(l.code))).map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => toggleLanguage(lang.code)}
                      style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "var(--gray-900)", background: "none", border: "none", borderBottom: "1px solid #F9FAFB", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    >
                      {lang.name}
                      <span style={{ fontSize: "0.72rem", color: "#111827", fontWeight: 500 }}>+ Add</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section 4 — CSJ Driver Clearance (volunteer only) */}
        {isVolunteer && (
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6" }}>
              <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Driver Clearance</h2>
            </div>
            <div style={{ padding: "20px" }}>
              <p style={{ fontSize: "0.82rem", color: "#111827", lineHeight: 1.6, marginBottom: "16px" }}>
                Drivers transport the volunteer team to and from clinic sites. To drive, volunteers must hold a valid CSJ Driver Clearance through Georgetown.
              </p>
              <button
                onClick={() => setRequestedDriverClearance((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "14px 16px", borderRadius: "12px", cursor: "pointer",
                  border: requestedDriverClearance ? "1.5px solid #2563EB" : "1.5px solid var(--card-border)",
                  background: requestedDriverClearance ? "#EFF6FF" : "#fff",
                  fontFamily: "'DM Sans', sans-serif", textAlign: "left",
                  transition: "border-color 0.12s, background 0.12s",
                }}
              >
                <div>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827", margin: 0 }}>I have CSJ Driver Clearance</p>
                  <p style={{ fontSize: "0.78rem", color: "#111827", margin: "2px 0 0" }}>Select if you are cleared to drive through Georgetown&apos;s CSJ program</p>
                </div>
                <span style={{
                  width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0, marginLeft: "12px",
                  border: requestedDriverClearance ? "2px solid #2563EB" : "2px solid #D1D5DB",
                  background: requestedDriverClearance ? "#2563EB" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {requestedDriverClearance && <span style={{ color: "#fff", fontSize: "0.75rem", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </span>
              </button>
              {requestedDriverClearance && (
                <p style={{ fontSize: "0.75rem", color: "#2563EB", marginTop: "10px", lineHeight: 1.5 }}>
                  ✓ An admin will verify your clearance and enable your driver access.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Section 5 — Notifications (volunteer only) */}
        {isVolunteer && (
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6" }}>
              <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Notifications</h2>
            </div>
            <div style={{ padding: "14px 20px" }}>
              <p style={{ fontSize: "0.82rem", color: "#111827", marginBottom: "12px", lineHeight: 1.5 }}>
                Choose which emails you&apos;d like to receive once your volunteer access is approved.
              </p>
              {([
                { key: "signupReceipt" as const, label: "Signup confirmation", desc: "Email when you sign up for a shift" },
                { key: "cancellationReceipt" as const, label: "Cancellation receipt", desc: "Email when you cancel a shift" },
                { key: "reminder24h" as const, label: "24-hour reminder", desc: "Day-before shift reminder" },
                { key: "unfilledSlotAlert" as const, label: "Urgent opening alert", desc: "Get notified if a slot opens within 24 hrs of the shift — you may still be able to take it" },
              ] as const).map(({ key, label, desc }, i, arr) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111827", margin: 0 }}>{label}</p>
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
        )}

        {/* Submission */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "24px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <p style={{ fontSize: "0.875rem", color: "#111827", lineHeight: 1.6, marginBottom: "20px" }}>
            Once you submit, your request will be sent to an admin for review. You&apos;ll receive an email at{" "}
            <strong>{userEmail}</strong> when your access has been cleared.
          </p>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "0.82rem", color: "#DC2626" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "13px",
              background: submitting ? "#D1D5DB" : "#0D1F3C",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontSize: "0.95rem",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </div>

      </div>
    </div>
  );
}
