"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";

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

export default function MessagesPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const roles = session?.user?.roles ?? [];
  const isAdmin = role === "ADMIN";
  const isDev = roles.includes("DEV");
  const isAdminView = isAdmin || isDev;

  // Volunteer submit form state
  const [suggForm, setSuggForm] = useState({ type: "FEATURE", subject: "", message: "" });
  const [suggSubmitting, setSuggSubmitting] = useState(false);
  const [suggSuccess, setSuggSuccess] = useState(false);
  const [suggError, setSuggError] = useState("");

  // Admin view state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = useCallback(async () => {
    const res = await fetch("/api/suggestions");
    if (res.ok) setSuggestions(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdminView) {
      void fetchSuggestions();
    } else {
      setLoading(false);
    }
  }, [isAdminView, fetchSuggestions]);

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
      setSuggError((err as { error?: string }).error ?? "Could not submit suggestion.");
    }
    setSuggSubmitting(false);
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  // Admin view — show all messages with status management
  if (isAdminView) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Messages</h1>
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
                      color: s.type === "BUG" ? "#B91C1C" : s.type === "FEATURE" ? "#0D1F3C" : s.type === "CONTACT" ? "#0F766E" : "#111827"
                    }}>
                      {s.type === "BUG" ? "Bug" : s.type === "FEATURE" ? "Feature" : s.type === "CONTACT" ? "Contact" : "General"}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: "0.875rem" }}>{s.subject}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "#111827", marginBottom: "8px" }}>{s.message}</p>
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
                    style={{ marginTop: "8px", width: "100%", padding: "6px 10px", fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", outline: "none", color: "#111827", background: "rgba(0,0,0,.02)", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                  <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600,
                    background: s.status === "OPEN" ? "#FFFBEB" : s.status === "NOTED" ? "#EBF3FC" : "var(--gray-200)",
                    color: s.status === "OPEN" ? "#B45309" : s.status === "NOTED" ? "#0D1F3C" : "#111827"
                  }}>
                    {s.status}
                  </span>
                  <select
                    value={s.status}
                    onChange={(e) => void updateSuggestionStatus(s.id, e.target.value)}
                    style={{ fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "8px", padding: "4px 8px", color: "#111827", background: "var(--card-bg)", outline: "none", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
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
    );
  }

  // Volunteer view — submit form
  return (
    <div style={{ maxWidth: "512px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--gray-900)", marginBottom: "4px" }}>Messages</h3>
        <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "20px" }}>Have a suggestion or feedback for the website? We&apos;d love to hear it.</p>

        {suggSuccess ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ color: "var(--green)", fontWeight: 500, fontSize: "0.875rem" }}>Thanks! Your suggestion has been submitted.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#111827", marginBottom: "4px" }}>Type</label>
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
              <label style={{ display: "block", fontSize: "0.75rem", color: "#111827", marginBottom: "4px" }}>Subject</label>
              <input
                type="text"
                placeholder="Brief subject..."
                value={suggForm.subject}
                onChange={(e) => setSuggForm({ ...suggForm, subject: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#111827", marginBottom: "4px" }}>Message</label>
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
              onClick={() => void submitSuggestion()}
              style={{ padding: "9px 20px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", opacity: suggSubmitting || !suggForm.subject.trim() || !suggForm.message.trim() ? 0.5 : 1 }}
            >
              {suggSubmitting ? "Submitting..." : "Submit Suggestion"}
            </button>
          </div>
        )}
      </div>

      {/* Suppress unused session warning */}
      {session && null}
    </div>
  );
}
