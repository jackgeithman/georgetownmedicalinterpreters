"use client";

import { useEffect, useState, useCallback } from "react";

export default function NotesPage() {
  const [adminNotesContent, setAdminNotesContent] = useState("");
  const [adminNotesUpdatedBy, setAdminNotesUpdatedBy] = useState<string | null>(null);
  const [adminNotesSaving, setAdminNotesSaving] = useState(false);
  const [adminNotesSaved, setAdminNotesSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    const res = await fetch("/api/admin/notes");
    if (res.ok) {
      const data = await res.json();
      setAdminNotesContent((data as { content?: string; updatedBy?: string }).content ?? "");
      setAdminNotesUpdatedBy((data as { content?: string; updatedBy?: string }).updatedBy ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const saveAdminNotes = async () => {
    setAdminNotesSaving(true);
    const res = await fetch("/api/admin/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: adminNotesContent }),
    });
    if (res.ok) {
      const nd = await res.json();
      setAdminNotesUpdatedBy((nd as { updatedBy?: string }).updatedBy ?? null);
      setAdminNotesSaved(true);
      setTimeout(() => setAdminNotesSaved(false), 2000);
    }
    setAdminNotesSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading notes...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>Notes</h1>
      <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827" }}>Admin Notes</h3>
          {adminNotesUpdatedBy && (
            <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>Last saved by {adminNotesUpdatedBy}</span>
          )}
        </div>
        <p style={{ fontSize: "0.75rem", color: "#111827" }}>
          Use this space for internal documentation — notification defaults, page breakdowns, role permissions, or anything else the team should know.
        </p>
        <textarea
          value={adminNotesContent}
          onChange={(e) => setAdminNotesContent(e.target.value)}
          rows={20}
          placeholder={"## Role Permissions\n\nVOLUNTEER\n- Access: Browse Slots, My Signups, My Profile, Training, Suggestions\n\nINSTRUCTOR\n- Access: all VOLUNTEER pages + All Users\n\nADMIN\n- Access: full admin dashboard\n\nDEV\n- role: ADMIN, roles includes DEV\n- Additional access: Access Control tab\n\n## Notification Defaults\n\n...\n\n## Page Breakdown\n\n..."}
          style={{ width: "100%", padding: "12px 14px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "10px", background: "rgba(0,0,0,.02)", color: "#111827", outline: "none", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            disabled={adminNotesSaving}
            onClick={() => void saveAdminNotes()}
            style={{ padding: "9px 24px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: adminNotesSaving ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
          >
            {adminNotesSaving ? "Saving..." : "Save"}
          </button>
          {adminNotesSaved && <span style={{ fontSize: "0.75rem", color: "#15803D" }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}
