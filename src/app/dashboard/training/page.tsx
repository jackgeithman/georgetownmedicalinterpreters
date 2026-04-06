"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";

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

export default function TrainingPage() {
  const { data: session } = useSession();
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; name: string }[]>([]);
  const [trainingLangFilter, setTrainingLangFilter] = useState("ALL");
  const [trainingForm, setTrainingForm] = useState({ title: "", description: "", url: "", languageCode: "", category: "General" });
  const [trainingFormError, setTrainingFormError] = useState("");
  const [trainingSubmitting, setTrainingSubmitting] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);

  const role = session?.user?.role;
  const roles = session?.user?.roles ?? [];
  const isInstructor = role === "INSTRUCTOR";
  const isAdmin = role === "ADMIN";
  const isDev = roles.includes("DEV");
  const canAdd = isInstructor || isAdmin || isDev;

  const fetchData = useCallback(async () => {
    const [trainingRes, langsRes] = await Promise.all([
      fetch("/api/training"),
      fetch("/api/languages"),
    ]);
    if (trainingRes.ok) setTrainingMaterials(await trainingRes.json());
    if (langsRes.ok) {
      const data = await langsRes.json();
      if (Array.isArray(data)) setAvailableLanguages(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const submitTraining = async () => {
    setTrainingFormError("");
    setTrainingSubmitting(true);
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trainingForm.title,
          description: trainingForm.description || null,
          url: trainingForm.url,
          languageCode: trainingForm.languageCode || null,
          category: trainingForm.category || "General",
        }),
      });
      if (res.ok) {
        const material = await res.json();
        setTrainingMaterials((prev) => [material, ...prev]);
        setTrainingForm({ title: "", description: "", url: "", languageCode: "", category: "General" });
        setShowTrainingForm(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setTrainingFormError((err as { error?: string }).error ?? "Could not add material.");
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading training materials...</p>
      </div>
    );
  }

  const getLangName = (code: string) => availableLanguages.find((l) => l.code === code)?.name ?? code;
  const filterLangs = [{ code: "ALL", name: "All Languages" }, ...availableLanguages];
  const filtered = trainingLangFilter === "ALL" ? trainingMaterials : trainingMaterials.filter((m) => m.languageCode === trainingLangFilter);
  const categories = Array.from(new Set(filtered.map((m) => m.category))).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>Training</h1>
        {canAdd && (
          <button
            onClick={() => setShowTrainingForm(!showTrainingForm)}
            style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
          >
            {showTrainingForm ? "Cancel" : "+ Add Material"}
          </button>
        )}
      </div>

      {canAdd && showTrainingForm && (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)", margin: 0 }}>New Training Material</h3>
          <input placeholder="Title" value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none" }} />
          <textarea placeholder="Description (optional)" value={trainingForm.description} onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })} rows={2} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", resize: "none" }} />
          <input placeholder="URL (https://...)" value={trainingForm.url} onChange={(e) => setTrainingForm({ ...trainingForm, url: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none" }} />
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
              <input placeholder="General" value={trainingForm.category} list="training-categories" onChange={(e) => setTrainingForm({ ...trainingForm, category: e.target.value })} style={{ width: "100%", padding: "8px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", boxSizing: "border-box" }} />
              <datalist id="training-categories">{["General", "Medical Terminology", "Ethics", "Language-Specific", "Administrative"].map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          {trainingFormError && <p style={{ fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{trainingFormError}</p>}
          <button disabled={trainingSubmitting || !trainingForm.title || !trainingForm.url} onClick={() => void submitTraining()} style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", opacity: trainingSubmitting || !trainingForm.title ? 0.5 : 1, alignSelf: "flex-start" }}>
            {trainingSubmitting ? "Saving..." : "Add Material"}
          </button>
        </div>
      )}

      {availableLanguages.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {filterLangs.map((l) => (
            <button
              key={l.code}
              onClick={() => setTrainingLangFilter(l.code)}
              style={{ padding: "5px 14px", fontSize: "0.78rem", fontWeight: 500, border: "1.5px solid", borderRadius: "99px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", borderColor: trainingLangFilter === l.code ? "var(--blue)" : "var(--card-border)", background: trainingLangFilter === l.code ? "var(--blue)" : "var(--card-bg)", color: trainingLangFilter === l.code ? "#fff" : "#111827", transition: "all 0.15s" }}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No training materials available yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {categories.map((cat) => (
            <div key={cat}>
              <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>{cat}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {filtered.filter((m) => m.category === cat).map((m) => (
                  <div key={m.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: "0.875rem" }}>{m.title}</span>
                          {canAdd && (isAdmin || isDev || session?.user?.email === m.uploadedBy.email) && (
                            <button onClick={() => void deleteTraining(m.id)} style={{ fontSize: "0.72rem", padding: "2px 8px", background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Delete</button>
                          )}
                          {m.languageCode && (
                            <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", background: "var(--blue-light)", color: "var(--navy)" }}>{getLangName(m.languageCode)}</span>
                          )}
                        </div>
                        {m.description && <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "8px" }}>{m.description}</p>}
                        <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--blue)", textDecoration: "underline", wordBreak: "break-all" }}>
                          {m.url}
                        </a>
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
      )}
    </div>
  );
}
