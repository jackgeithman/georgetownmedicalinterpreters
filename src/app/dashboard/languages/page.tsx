"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { LANGUAGE_MAP } from "@/lib/languages";

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

// Build the full selectable list from LANGUAGE_MAP, sorted alphabetically
const ALL_OPTIONS = Object.entries(LANGUAGE_MAP)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Deactivate conflict modal
  const [langDeactivateConflict, setLangDeactivateConflict] = useState<{
    langId: string;
    langName: string;
    conflicts: ConflictSlot[];
  } | null>(null);
  const [langDeactivateLoading, setLangDeactivateLoading] = useState(false);

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<LanguageConfig | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchLanguages = useCallback(async () => {
    const res = await fetch("/api/admin/languages");
    if (res.ok) setLanguages(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { void fetchLanguages(); }, [fetchLanguages]);

  // Filter options: match search text, exclude already-added languages
  const existingCodes = new Set(languages.map((l) => l.code.toUpperCase()));
  const filteredOptions = ALL_OPTIONS.filter(
    (o) =>
      !existingCodes.has(o.code.toUpperCase()) &&
      (search === "" || o.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = (opt: { code: string; name: string }) => {
    setSelected(opt);
    setSearch(opt.name);
    setDropdownOpen(false);
    setAddError("");
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setSelected(null);
    setDropdownOpen(true);
    setAddError("");
  };

  const createLanguage = async () => {
    if (!selected) return;
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/admin/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: selected.name, code: selected.code }),
    });
    if (res.ok) {
      const lang = await res.json();
      setLanguages((prev) => [...prev, lang].sort((a, b) => a.name.localeCompare(b.name)));
      setSearch("");
      setSelected(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setAddError((data as { error?: string }).error ?? "Could not add language.");
    }
    setAdding(false);
  };

  const toggleLanguageActive = async (id: string, newIsActive: boolean, langName: string) => {
    if (!newIsActive && !confirm(`Deactivate ${langName}? It will no longer be available for new slots.`)) return;
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

  const deleteLanguage = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/languages/${deleteConfirm.id}`, { method: "DELETE" });
    if (res.ok) {
      setLanguages((prev) => prev.filter((l) => l.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setDeleteError((data as { error?: string }).error ?? "Could not delete language.");
    }
    setDeleteLoading(false);
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

      {/* Add language */}
      <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "4px" }}>Add Language</h3>
        <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>Search and select from the standard language list.</p>
        <div style={{ display: "flex", gap: "10px", position: "relative" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              placeholder="Search languages (e.g. French)…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selected) void createLanguage();
                if (e.key === "Escape") setDropdownOpen(false);
              }}
              style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: `1.5px solid ${selected ? "var(--blue)" : "var(--card-border)"}`, borderRadius: "9px", background: "var(--card-bg)", color: "#111827", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
            />
            {dropdownOpen && filteredOptions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "9px", boxShadow: "0 4px 16px rgba(0,0,0,.1)", zIndex: 50, maxHeight: "220px", overflowY: "auto" }}>
                {filteredOptions.map((opt) => (
                  <button
                    key={opt.code}
                    onMouseDown={() => handleSelect(opt)}
                    style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "0.875rem", color: "#111827", background: "none", border: "none", borderBottom: "1px solid #F9FAFB", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    {opt.name}
                    <span style={{ fontSize: "0.7rem", color: "#111827", fontWeight: 500 }}>{opt.code}</span>
                  </button>
                ))}
              </div>
            )}
            {dropdownOpen && search.length > 0 && filteredOptions.length === 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "9px", padding: "12px 14px", fontSize: "0.8rem", color: "#111827", zIndex: 50 }}>
                No matching languages found.
              </div>
            )}
          </div>
          <button
            disabled={!selected || adding}
            onClick={() => void createLanguage()}
            style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: selected ? "pointer" : "not-allowed", fontWeight: 600, opacity: !selected || adding ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {addError && (
          <p style={{ marginTop: "8px", fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{addError}</p>
        )}
      </div>

      {/* Language list */}
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
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* iOS-style toggle */}
                <button
                  role="switch"
                  aria-checked={lang.isActive}
                  onClick={() => void toggleLanguageActive(lang.id, !lang.isActive, lang.name)}
                  title={lang.isActive ? "Deactivate" : "Activate"}
                  style={{
                    position: "relative", display: "inline-flex", alignItems: "center",
                    width: "44px", height: "26px", borderRadius: "99px", border: "none",
                    background: lang.isActive ? "#16A34A" : "#D1D5DB",
                    cursor: "pointer", flexShrink: 0,
                    transition: "background 0.2s",
                    padding: 0,
                  }}
                >
                  <span style={{
                    position: "absolute",
                    left: lang.isActive ? "20px" : "2px",
                    width: "22px", height: "22px", borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,.25)",
                    transition: "left 0.2s",
                  }} />
                </button>
                <button
                  onClick={() => { setDeleteConfirm(lang); setDeleteError(""); }}
                  title="Delete language permanently"
                  style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
                >
                  Delete
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
              <button onClick={() => setLangDeactivateConflict(null)} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "var(--card-bg)", color: "#111827", border: "1.5px solid var(--card-border)", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button disabled={langDeactivateLoading} onClick={() => void forceDeactivateLanguage()} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, opacity: langDeactivateLoading ? 0.5 : 1 }}>
                {langDeactivateLoading ? "Deactivating..." : "Deactivate Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "28px", maxWidth: "420px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Delete Language?</h3>
            <p style={{ fontSize: "0.875rem", color: "#111827", marginBottom: "6px" }}>
              This will permanently remove <strong>{deleteConfirm.name}</strong> from the system.
            </p>
            <p style={{ fontSize: "0.8rem", color: "#DC2626", marginBottom: "20px" }}>
              This cannot be undone. If any slots reference this language, deletion will be blocked.
            </p>
            {deleteError && (
              <p style={{ marginBottom: "16px", fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{deleteError}</p>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "var(--card-bg)", color: "#111827", border: "1.5px solid var(--card-border)", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button disabled={deleteLoading} onClick={() => void deleteLanguage()} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, opacity: deleteLoading ? 0.5 : 1 }}>
                {deleteLoading ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
