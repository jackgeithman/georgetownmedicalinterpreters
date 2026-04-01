"use client";

import { useEffect, useState, useCallback } from "react";

type LanguageConfig = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  volunteerCount?: number;
};

type ConflictSlot = {
  id: string;
  clinicName: string;
  clinicEmail: string;
  date: string;
  language: string;
  isFilled: boolean;
  assignedVolunteers: { name: string | null; email: string }[];
  interpreterCount: number;
  signupCount: number;
};

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [langForm, setLangForm] = useState({ name: "" });
  const [langFormError, setLangFormError] = useState("");
  const [langDeactivateConflict, setLangDeactivateConflict] = useState<{
    langId: string;
    langName: string;
    conflicts: ConflictSlot[];
  } | null>(null);
  const [langDeactivateLoading, setLangDeactivateLoading] = useState(false);

  const fetchLanguages = useCallback(async () => {
    const res = await fetch("/api/admin/languages");
    if (res.ok) setLanguages(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchLanguages();
  }, [fetchLanguages]);

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
      setLangForm({ name: "" });
    } else {
      const data = await res.json().catch(() => ({}));
      setLangFormError((data as { error?: string }).error ?? "Could not add language.");
    }
  };

  const toggleLanguageActive = async (id: string, newIsActive: boolean, langName: string) => {
    try {
      if (!newIsActive) {
        const res = await fetch(`/api/admin/languages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false }),
        });
        if (res.status === 409) {
          const data = await res.json();
          setLangDeactivateConflict({ langId: id, langName, conflicts: (data as { conflicts: ConflictSlot[] }).conflicts });
          return;
        }
        if (res.ok) {
          const updated = await res.json();
          setLanguages((prev) => prev.map((l) => (l.id === id ? updated : l)));
        } else {
          const data = await res.json().catch(() => ({}));
          alert((data as { error?: string }).error ?? `Failed to deactivate language (${res.status}). Please try again.`);
        }
      } else {
        const res = await fetch(`/api/admin/languages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        });
        if (res.ok) {
          const updated = await res.json();
          setLanguages((prev) => prev.map((l) => (l.id === id ? updated : l)));
        } else {
          const data = await res.json().catch(() => ({}));
          alert((data as { error?: string }).error ?? `Failed to activate language (${res.status}). Please try again.`);
        }
      }
    } catch {
      alert("An unexpected error occurred. Please try again.");
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading languages...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "4px" }}>Add Language</h3>
        <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>Inactive languages are hidden from dropdowns but shown here.</p>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            placeholder="Name (e.g. French)"
            value={langForm.name}
            onChange={(e) => setLangForm({ name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && langForm.name.trim()) void createLanguage(); }}
            style={{ flex: 1, padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "#111827", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
          />
          <button
            disabled={!langForm.name.trim()}
            onClick={() => void createLanguage()}
            style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: !langForm.name.trim() ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
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
                <span style={{ fontSize: "0.875rem", color: "#111827", fontWeight: 500 }}>{lang.name}</span>
                <span style={{ fontSize: "0.75rem", color: "#111827" }}>{lang.volunteerCount ?? 0} volunteer{(lang.volunteerCount ?? 0) !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.75rem", padding: "2px 10px", borderRadius: "99px", background: lang.isActive ? "#DCFCE7" : "var(--gray-200)", color: lang.isActive ? "#15803D" : "var(--gray-400)" }}>
                  {lang.isActive ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => void toggleLanguageActive(lang.id, !lang.isActive, lang.name)}
                  style={{ fontSize: "0.75rem", padding: "4px 12px", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: lang.isActive ? "var(--gray-200)" : "#DCFCE7", color: lang.isActive ? "#111827" : "#15803D", border: "none" }}
                >
                  {lang.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deactivate conflict modal */}
      {langDeactivateConflict && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "28px", maxWidth: "520px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxHeight: "80vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Cannot Deactivate — Upcoming Slots</h3>
            <p style={{ fontSize: "0.875rem", color: "#111827", marginBottom: "16px" }}>
              <strong>{langDeactivateConflict.langName}</strong> has {langDeactivateConflict.conflicts.length} upcoming slot{langDeactivateConflict.conflicts.length !== 1 ? "s" : ""}. Deactivating will not delete them, but the language will no longer be available for new slots.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {langDeactivateConflict.conflicts.slice(0, 5).map((c) => (
                <div key={c.id} style={{ padding: "10px 14px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "8px", fontSize: "0.82rem" }}>
                  <span style={{ fontWeight: 600, color: "#111827" }}>{c.clinicName}</span>
                  <span style={{ color: "#111827", marginLeft: "8px" }}>{new Date(c.date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span style={{ color: "#111827", marginLeft: "8px" }}>{c.signupCount}/{c.interpreterCount} filled</span>
                </div>
              ))}
              {langDeactivateConflict.conflicts.length > 5 && (
                <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", textAlign: "center" }}>… and {langDeactivateConflict.conflicts.length - 5} more</p>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setLangDeactivateConflict(null)}
                style={{ padding: "8px 18px", fontSize: "0.875rem", background: "var(--card-bg)", color: "#111827", border: "1.5px solid var(--card-border)", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
              >Cancel</button>
              <button
                disabled={langDeactivateLoading}
                onClick={() => void forceDeactivateLanguage()}
                style={{ padding: "8px 18px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, opacity: langDeactivateLoading ? 0.5 : 1 }}
              >
                {langDeactivateLoading ? "Deactivating..." : "Deactivate Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
