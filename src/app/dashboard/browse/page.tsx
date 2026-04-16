"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { langName } from "@/lib/languages";

// ─── Types ────────────────────────────────────────────────────────────────────

type Position = {
  id: string;
  positionNumber: number;
  isDriver: boolean;
  languageCode: string | null;
  status: string;
  volunteer: { id: string; user: { name: string | null; email: string } } | null;
  // volunteer view enrichment
  canSignUp?: boolean;
  isMyPosition?: boolean;
};

type AdminShift = {
  id: string;
  date: string;
  volunteerStart: number;
  volunteerEnd: number;
  travelMinutes: number;
  languagesNeeded: string[];
  notes: string | null;
  status: string;
  clinic: { id: string; name: string; address: string };
  postedBy: { name: string | null; email: string };
  positions: Position[];
};

type BrowseShift = {
  id: string;
  date: string;
  volunteerStart: number;
  volunteerEnd: number;
  travelMinutes: number;
  languagesNeeded: string[];
  notes: string | null;
  keyRetrievalTime: number;
  driveStartTime: number;
  keyReturnTime: number;
  clinic: { id: string; name: string; address: string };
  positions: Position[];
};

type ClinicOption = { id: string; name: string; address: string; travelMinutes: number };
type LanguageConfig = { id: string; code: string; name: string; isActive: boolean };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

function fmtDate(s: string): string {
  const d = new Date(s.slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeInputToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTimeInput(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function posStatus(pos: Position) {
  if (pos.status === "FILLED") return { label: "Filled", bg: "#DCFCE7", color: "#15803D" };
  if (pos.status === "LOCKED") return { label: "Locked", bg: "#F3F4F6", color: "#6B7280" };
  if (pos.status === "OPEN") return { label: "Open", bg: "#EFF6FF", color: "#2563EB" };
  return { label: pos.status, bg: "#F3F4F6", color: "#374151" };
}

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const { data: session } = useSession();
  const [adminShifts, setAdminShifts] = useState<AdminShift[]>([]);
  const [browseShifts, setBrowseShifts] = useState<BrowseShift[]>([]);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [langFilter, setLangFilter] = useState("ALL");
  const [clinicFilter, setClinicFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);

  // Create/edit shift modal
  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminShift | null>(null);
  const [formClinicId, setFormClinicId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("13:00");
  const [formTravel, setFormTravel] = useState<number | null>(null);
  const [formLangs, setFormLangs] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Cancel shift confirmation
  const [cancelTarget, setCancelTarget] = useState<AdminShift | null>(null);
  const [cancelInput, setCancelInput] = useState("");

  // Driver sign-up language picker
  const [driverLangPicker, setDriverLangPicker] = useState<{
    positionId: string; shiftId: string; availableLangs: string[];
  } | null>(null);
  const [driverLangChoice, setDriverLangChoice] = useState("");

  const role = session?.user?.role;
  const roles = session?.user?.roles ?? [];
  const isAdmin = role === "ADMIN" || roles.includes("DEV");

  const fetchData = useCallback(async () => {
    if (isAdmin) {
      const [shiftsRes, clinicsRes, langsRes] = await Promise.all([
        fetch("/api/admin/shifts"),
        fetch("/api/admin/clinics"),
        fetch("/api/admin/languages"),
      ]);
      if (shiftsRes.ok) setAdminShifts(await shiftsRes.json());
      if (clinicsRes.ok) {
        const data = await clinicsRes.json();
        setClinics(Array.isArray(data) ? data : data.clinics ?? []);
      }
      if (langsRes.ok) setLanguages(await langsRes.json());
    } else {
      const shiftsRes = await fetch("/api/volunteer/shifts");
      if (shiftsRes.ok) setBrowseShifts(await shiftsRes.json());
      const langsRes = await fetch("/api/languages");
      if (langsRes.ok) {
        const data = await langsRes.json();
        if (Array.isArray(data)) setLanguages(data.map((l: { code: string; name: string }) => ({ id: l.code, code: l.code, name: l.name, isActive: true })));
      }
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (role !== undefined) fetchData();
  }, [role, fetchData]);

  // ── Admin: Create Shift ───────────────────────────────────────────────────

  const openCreate = () => {
    setFormClinicId(clinics[0]?.id ?? "");
    setFormDate("");
    setFormStart("09:00");
    setFormEnd("13:00");
    setFormTravel(null);
    setFormLangs([]);
    setFormNotes("");
    setFormError("");
    setEditTarget(null);
    setCreateModal(true);
  };

  const openEdit = (shift: AdminShift) => {
    setFormClinicId(shift.clinic.id);
    setFormDate(shift.date.slice(0, 10));
    setFormStart(minutesToTimeInput(shift.volunteerStart));
    setFormEnd(minutesToTimeInput(shift.volunteerEnd));
    setFormTravel(shift.travelMinutes);
    setFormLangs([...shift.languagesNeeded]);
    setFormNotes(shift.notes ?? "");
    setFormError("");
    setEditTarget(shift);
    setCreateModal(true);
  };

  const toggleFormLang = (code: string) => {
    setFormLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  };

  const handleFormSubmit = async () => {
    if (!formClinicId || !formDate || formLangs.length === 0) {
      setFormError("Clinic, date, and at least one language are required.");
      return;
    }
    const vs = timeInputToMinutes(formStart);
    const ve = timeInputToMinutes(formEnd);
    if (ve <= vs) {
      setFormError("End time must be after start time.");
      return;
    }

    setFormLoading(true);
    setFormError("");

    const selectedClinic = clinics.find((c) => c.id === formClinicId);
    const body = {
      clinicId: formClinicId,
      date: formDate,
      volunteerStart: vs,
      volunteerEnd: ve,
      travelMinutes: formTravel ?? selectedClinic?.travelMinutes ?? 30,
      languagesNeeded: formLangs,
      notes: formNotes || null,
    };

    const url = editTarget ? `/api/admin/shifts/${editTarget.id}` : "/api/admin/shifts";
    const method = editTarget ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setCreateModal(false);
      setEditTarget(null);
      await fetchData();
    } else {
      const err = await res.json().catch(() => ({}));
      setFormError((err as { error?: string }).error ?? "Failed to save shift.");
    }
    setFormLoading(false);
  };

  // ── Admin: Cancel Shift ───────────────────────────────────────────────────

  const confirmCancelShift = async () => {
    if (!cancelTarget) return;
    setActionLoading(cancelTarget.id);
    const res = await fetch(`/api/admin/shifts/${cancelTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setCancelTarget(null);
      setCancelInput("");
      await fetchData();
    }
    setActionLoading(null);
  };

  // ── Volunteer: Sign Up ────────────────────────────────────────────────────

  const signUp = async (positionId: string, shift: BrowseShift) => {
    const pos = shift.positions.find((p) => p.id === positionId);
    if (!pos) return;

    if (pos.isDriver) {
      // Need language picker
      const cleared = shift.languagesNeeded.filter((lang) =>
        roles.includes(`LANG_${lang}_CLEARED`)
      );
      setDriverLangChoice(cleared.length === 1 ? cleared[0] : "");
      setDriverLangPicker({ positionId, shiftId: shift.id, availableLangs: cleared });
      return;
    }

    setActionLoading(positionId);
    const res = await fetch("/api/volunteer/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
    });
    if (res.ok) {
      await fetchData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert((err as { error?: string }).error ?? "Could not sign up.");
    }
    setActionLoading(null);
  };

  const confirmDriverSignUp = async () => {
    if (!driverLangPicker || !driverLangChoice) return;
    setActionLoading(driverLangPicker.positionId);
    const res = await fetch("/api/volunteer/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: driverLangPicker.positionId, languageCode: driverLangChoice }),
    });
    setDriverLangPicker(null);
    setDriverLangChoice("");
    if (res.ok) {
      await fetchData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert((err as { error?: string }).error ?? "Could not sign up.");
    }
    setActionLoading(null);
  };

  const cancelPosition = async (positionId: string) => {
    setActionLoading(positionId);
    const res = await fetch(`/api/volunteer/positions/${positionId}`, { method: "DELETE" });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading...</p>
      </div>
    );
  }

  const now = new Date();
  const activeLangs = languages.filter((l) => l.isActive);

  // ── Admin view ────────────────────────────────────────────────────────────
  if (isAdmin) {
    const shiftEnd = (s: AdminShift) => new Date(s.date.slice(0, 10) + "T23:59:59");

    const filtered = adminShifts.filter((s) => {
      if (langFilter !== "ALL" && !s.languagesNeeded.includes(langFilter)) return false;
      if (clinicFilter !== "ALL" && s.clinic.name !== clinicFilter) return false;
      if (dateFrom && new Date(s.date.slice(0, 10) + "T12:00:00") < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && new Date(s.date.slice(0, 10) + "T12:00:00") > new Date(dateTo + "T23:59:59")) return false;
      if (availableOnly) {
        const hasOpen = s.positions.some((p) => p.status === "OPEN" || p.status === "LOCKED");
        if (!hasOpen) return false;
      }
      return true;
    });

    const upcoming = filtered.filter((s) => shiftEnd(s) >= now);
    const past = filtered.filter((s) => shiftEnd(s) < now)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const uniqueAdminClinics = Array.from(new Set(adminShifts.map((s) => s.clinic.name))).sort();

    const renderAdminShift = (shift: AdminShift, isPast: boolean) => {
      const openCount = shift.positions.filter((p) => p.status === "OPEN" || p.status === "LOCKED").length;
      const filledCount = shift.positions.filter((p) => p.status === "FILLED").length;

      return (
        <div key={shift.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)", opacity: isPast ? 0.55 : 1 }}>
          {/* Header */}
          <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--navy)" }}>{shift.clinic.name}</div>
                {shift.languagesNeeded.map((lang) => (
                  <span key={lang} style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: "#EFF6FF", color: "#1D4ED8" }}>{langName(lang)}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Date</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtDate(shift.date)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Interpreting Window</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtMin(shift.volunteerStart)} – {fmtMin(shift.volunteerEnd)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Full Commitment</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>
                    {fmtMin(shift.volunteerStart - shift.travelMinutes - 30)} – {fmtMin(shift.volunteerEnd + shift.travelMinutes + 15)}
                  </span>
                </div>
                {shift.clinic.address && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Location</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>
                      {shift.clinic.address}
                      <MapsLinks address={shift.clinic.address} />
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
              {isPast ? (
                <span style={{ background: "var(--gray-200)", color: "var(--gray-600)", fontSize: "0.7rem", fontWeight: 600, padding: "4px 10px", borderRadius: "99px", textTransform: "uppercase" }}>Past</span>
              ) : (
                <>
                  <div style={{ background: openCount > 0 ? "var(--green-light)" : "#F0FDF4", color: openCount > 0 ? "var(--green)" : "#15803D", fontSize: "0.85rem", fontWeight: 700, padding: "6px 14px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center" }}>
                    {filledCount}/{shift.positions.length} filled
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => openEdit(shift)}
                      style={{ fontSize: "0.75rem", padding: "4px 10px", background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >Edit</button>
                    <button
                      onClick={() => { setCancelTarget(shift); setCancelInput(""); }}
                      style={{ fontSize: "0.75rem", padding: "4px 10px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
          {shift.notes && (
            <div style={{ padding: "8px 22px", fontSize: "0.82rem", color: "#111827", fontStyle: "italic", borderBottom: "1px solid var(--card-border)" }}>
              {shift.notes}
            </div>
          )}
          {/* Positions */}
          {shift.positions.map((pos) => {
            const st = posStatus(pos);
            return (
              <div key={pos.id} style={{ display: "flex", alignItems: "center", padding: "12px 22px", borderBottom: "1px solid var(--card-border)", gap: "14px", flexWrap: "wrap" }}>
                <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: pos.status === "FILLED" ? "var(--green)" : pos.status === "OPEN" ? "#3B82F6" : "var(--gray-400)", flexShrink: 0 }} />
                <div style={{ minWidth: "110px" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#111827" }}>
                    {pos.isDriver ? "Driver" : `Seat ${pos.positionNumber}`}
                  </span>
                  {pos.languageCode && (
                    <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "#374151" }}>{langName(pos.languageCode)}</span>
                  )}
                  {!pos.languageCode && pos.status === "LOCKED" && (
                    <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "#9CA3AF" }}>Language TBD</span>
                  )}
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: st.bg, color: st.color }}>{st.label}</span>
                {pos.volunteer && (
                  <span style={{ fontSize: "0.82rem", color: "#111827", flex: 1 }}>
                    {pos.volunteer.user.name ?? pos.volunteer.user.email}
                    <span style={{ marginLeft: "6px", color: "#6B7280", fontSize: "0.75rem" }}>{pos.volunteer.user.email}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
          <button
            onClick={openCreate}
            style={{ padding: "10px 20px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
          >+ Post Shift</button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
          <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "#111827", fontFamily: "'DM Sans', sans-serif", outline: "none", cursor: "pointer" }}>
            <option value="ALL">All Languages</option>
            {activeLangs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "#111827", fontFamily: "'DM Sans', sans-serif", outline: "none", cursor: "pointer" }}>
            <option value="ALL">All Clinics</option>
            {uniqueAdminClinics.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", color: "var(--gray-900)" }}>
            From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: "8px 10px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", outline: "none", background: "var(--card-bg)", color: "var(--gray-900)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", color: "var(--gray-900)" }}>
            To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: "8px 10px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", outline: "none", background: "var(--card-bg)", color: "var(--gray-900)" }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ fontSize: "0.8rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer" }}>Clear dates</button>
          )}
          <button
            onClick={() => setAvailableOnly((v) => !v)}
            style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: availableOnly ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)", background: availableOnly ? "var(--green)" : "var(--card-bg)", color: availableOnly ? "#fff" : "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >Available Only</button>
        </div>

        {upcoming.length === 0 && past.length === 0 ? (
          <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
            <p style={{ color: "var(--gray-400)" }}>No shifts match your filters.</p>
          </div>
        ) : (
          <div>
            {upcoming.map((s) => renderAdminShift(s, false))}
            {past.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "32px 0 16px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--gray-400)" }}>
                  <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                  Past Shifts
                  <span style={{ flex: 1, height: "1px", background: "var(--card-border)", display: "block" }} />
                </div>
                {past.map((s) => renderAdminShift(s, true))}
              </>
            )}
          </div>
        )}

        {/* Create / Edit Shift Modal */}
        {createModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ padding: "20px 24px 16px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--gray-900)", margin: 0 }}>{editTarget ? "Edit Shift" : "Post New Shift"}</h3>
              </div>
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Clinic */}
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>Clinic</label>
                  <select
                    value={formClinicId}
                    onChange={(e) => {
                      setFormClinicId(e.target.value);
                      const c = clinics.find((c) => c.id === e.target.value);
                      if (c && formTravel === null) setFormTravel(c.travelMinutes);
                    }}
                    style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
                  >
                    <option value="">Select clinic…</option>
                    {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Date */}
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>Date</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
                </div>
                {/* Times */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>Interpreting Start (XX1)</label>
                    <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>Interpreting End (XX2)</label>
                    <input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                {/* Preview full commitment */}
                {formStart && formEnd && (() => {
                  const vs = timeInputToMinutes(formStart);
                  const ve = timeInputToMinutes(formEnd);
                  const t = formTravel ?? clinics.find((c) => c.id === formClinicId)?.travelMinutes ?? 30;
                  const keyRetrieval = vs - t - 30;
                  const keyReturn = ve + t + 15;
                  if (ve > vs) {
                    return (
                      <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "9px", padding: "10px 14px", fontSize: "0.82rem", color: "#0369A1" }}>
                        <strong>Full commitment:</strong> {fmtMin(keyRetrieval)} – {fmtMin(keyReturn)}
                        <span style={{ marginLeft: "8px", opacity: 0.8 }}>({fmtMin(vs)} – {fmtMin(ve)} interpreting)</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* Travel Minutes */}
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>
                    Travel Minutes (t) <span style={{ fontWeight: 400, color: "#6B7280" }}>— one-way drive to clinic</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={formTravel ?? clinics.find((c) => c.id === formClinicId)?.travelMinutes ?? 30}
                    onChange={(e) => setFormTravel(Number(e.target.value))}
                    style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                {/* Languages */}
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>Languages Needed (one seat per language)</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {activeLangs.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => toggleFormLang(l.code)}
                        style={{ padding: "6px 14px", borderRadius: "99px", fontSize: "0.82rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: formLangs.includes(l.code) ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", background: formLangs.includes(l.code) ? "var(--blue)" : "var(--card-bg)", color: formLangs.includes(l.code) ? "#fff" : "#111827" }}
                      >{l.name}</button>
                    ))}
                  </div>
                  {formLangs.length > 0 && (
                    <p style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "6px" }}>
                      {formLangs.length} seat{formLangs.length !== 1 ? "s" : ""}: 1 driver + {formLangs.length - 1} interpreter{formLangs.length !== 2 ? "s" : ""}
                    </p>
                  )}
                </div>
                {/* Notes */}
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>Notes (optional)</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                    placeholder="Special instructions, parking info, etc."
                  />
                </div>
                {formError && <p style={{ fontSize: "0.82rem", color: "#DC2626" }}>{formError}</p>}
                <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
                  <button
                    onClick={() => { setCreateModal(false); setEditTarget(null); }}
                    style={{ flex: 1, padding: "10px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                  >Cancel</button>
                  <button
                    disabled={formLoading}
                    onClick={handleFormSubmit}
                    style={{ flex: 1, padding: "10px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", opacity: formLoading ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
                  >{formLoading ? "Saving..." : editTarget ? "Save Changes" : "Post Shift"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Shift Confirmation */}
        {cancelTarget && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "420px" }}>
              <div style={{ padding: "20px 24px 16px", borderBottom: "1.5px solid var(--card-border)" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--gray-900)", margin: 0 }}>Cancel Shift</h3>
                <p style={{ fontSize: "0.78rem", color: "#111827", marginTop: "4px" }}>This will cancel the shift and notify any signed-up volunteers.</p>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "9px", padding: "10px 14px", marginBottom: "16px", fontSize: "0.82rem", color: "#7F1D1D" }}>
                  <strong>{cancelTarget.clinic.name}</strong> · {fmtDate(cancelTarget.date)} · {fmtMin(cancelTarget.volunteerStart)}–{fmtMin(cancelTarget.volunteerEnd)}
                  <div style={{ marginTop: "4px", color: "#B91C1C" }}>
                    {cancelTarget.positions.filter((p) => p.status === "FILLED").length} volunteer{cancelTarget.positions.filter((p) => p.status === "FILLED").length !== 1 ? "s" : ""} will be notified
                  </div>
                </div>
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "9px", padding: "10px 14px", marginBottom: "16px" }}>
                  <p style={{ fontSize: "0.78rem", color: "#92400E" }}>
                    Type <strong>{cancelTarget.clinic.name}</strong> to confirm:
                  </p>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={cancelInput}
                  onChange={(e) => setCancelInput(e.target.value)}
                  placeholder={cancelTarget.clinic.name}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", marginBottom: "16px" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => { setCancelTarget(null); setCancelInput(""); }}
                    style={{ flex: 1, padding: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                  >Keep Shift</button>
                  <button
                    disabled={cancelInput.trim() !== cancelTarget.clinic.name || actionLoading === cancelTarget.id}
                    onClick={confirmCancelShift}
                    style={{ flex: 1, padding: "9px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", opacity: (cancelInput.trim() !== cancelTarget.clinic.name || actionLoading === cancelTarget.id) ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
                  >{actionLoading === cancelTarget.id ? "Cancelling..." : "Cancel Shift"}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Volunteer view ────────────────────────────────────────────────────────

  const shiftEnd = (s: BrowseShift) => new Date(s.date.slice(0, 10) + "T23:59:59");

  const filteredVolunteer = browseShifts.filter((s) => {
    if (shiftEnd(s) < now) return false;
    if (langFilter !== "ALL" && !s.languagesNeeded.includes(langFilter)) return false;
    if (clinicFilter !== "ALL" && s.clinic.name !== clinicFilter) return false;
    if (dateFrom && new Date(s.date.slice(0, 10) + "T12:00:00") < new Date(dateFrom + "T00:00:00")) return false;
    if (dateTo && new Date(s.date.slice(0, 10) + "T12:00:00") > new Date(dateTo + "T23:59:59")) return false;
    if (availableOnly) {
      const hasOpen = s.positions.some((p) => p.canSignUp);
      if (!hasOpen) return false;
    }
    return true;
  });

  const uniqueVolunteerClinics = Array.from(new Set(browseShifts.map((s) => s.clinic.name))).sort();

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "#111827", fontFamily: "'DM Sans', sans-serif", outline: "none", cursor: "pointer" }}>
          <option value="ALL">All Languages</option>
          {activeLangs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: "9px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "#111827", fontFamily: "'DM Sans', sans-serif", outline: "none", cursor: "pointer" }}>
          <option value="ALL">All Clinics</option>
          {uniqueVolunteerClinics.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", color: "var(--gray-900)" }}>
          From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: "8px 10px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", outline: "none", background: "var(--card-bg)", color: "var(--gray-900)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", color: "var(--gray-900)" }}>
          To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: "8px 10px", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontSize: "0.875rem", fontFamily: "'DM Sans', sans-serif", outline: "none", background: "var(--card-bg)", color: "var(--gray-900)" }} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ fontSize: "0.8rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer" }}>Clear dates</button>
        )}
        <button
          onClick={() => setAvailableOnly((v) => !v)}
          style={{ padding: "9px 14px", borderRadius: "9px", fontSize: "0.875rem", fontWeight: 500, border: availableOnly ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)", background: availableOnly ? "var(--green)" : "var(--card-bg)", color: availableOnly ? "#fff" : "var(--gray-900)", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
        >Available Only</button>
      </div>

      {filteredVolunteer.length === 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No upcoming shifts match your filters.</p>
        </div>
      ) : (
        <div>
          {filteredVolunteer.map((shift) => {
            const myPositions = shift.positions.filter((p) => p.isMyPosition);
            const openPositions = shift.positions.filter((p) => p.canSignUp);
            const anyMine = myPositions.length > 0;

            return (
              <div key={shift.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: anyMine ? "1.5px solid var(--green)" : "1.5px solid var(--card-border)", overflow: "hidden", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                {/* Header */}
                <div style={{ padding: "16px 22px 14px", borderBottom: "1.5px solid var(--card-border)", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--navy)" }}>{shift.clinic.name}</div>
                      {shift.languagesNeeded.map((lang) => (
                        <span key={lang} style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: "#EFF6FF", color: "#1D4ED8" }}>{langName(lang)}</span>
                      ))}
                      {anyMine && <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: "#DCFCE7", color: "#15803D" }}>Signed up</span>}
                    </div>
                    <div style={{ display: "flex", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Date</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtDate(shift.date)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Interpreting</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtMin(shift.volunteerStart)} – {fmtMin(shift.volunteerEnd)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Full Time Commitment</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>{fmtMin(shift.keyRetrievalTime)} – {fmtMin(shift.keyReturnTime)}</span>
                      </div>
                      {shift.clinic.address && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--gray-400)" }}>Location</span>
                          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray-900)" }}>
                            {shift.clinic.address}
                            <MapsLinks address={shift.clinic.address} />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {openPositions.length > 0 ? (
                    <div style={{ background: "var(--green-light)", color: "var(--green)", fontSize: "0.85rem", fontWeight: 700, padding: "6px 14px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center" }}>
                      {openPositions.length} open
                    </div>
                  ) : (
                    <div style={{ background: "#F3F4F6", color: "#6B7280", fontSize: "0.85rem", fontWeight: 700, padding: "6px 14px", borderRadius: "10px", whiteSpace: "nowrap", textAlign: "center" }}>
                      Full
                    </div>
                  )}
                </div>
                {shift.notes && (
                  <div style={{ padding: "8px 22px", fontSize: "0.82rem", color: "#111827", fontStyle: "italic", borderBottom: "1px solid var(--card-border)" }}>
                    {shift.notes}
                  </div>
                )}
                {/* Positions */}
                {shift.positions.map((pos) => {
                  const st = posStatus(pos);
                  const loading = actionLoading === pos.id;

                  return (
                    <div key={pos.id} style={{ display: "flex", alignItems: "center", padding: "12px 22px", borderBottom: "1px solid var(--card-border)", gap: "14px", flexWrap: "wrap" }}>
                      <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: pos.status === "FILLED" ? "var(--green)" : pos.status === "OPEN" ? "#3B82F6" : "var(--gray-400)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: "140px" }}>
                        <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#111827" }}>
                          {pos.isDriver ? "Driver + Interpreter" : "Interpreter"}
                        </span>
                        {pos.languageCode ? (
                          <span style={{ marginLeft: "6px", fontSize: "0.82rem", color: "#374151" }}>{langName(pos.languageCode)}</span>
                        ) : pos.status === "LOCKED" ? (
                          <span style={{ marginLeft: "6px", fontSize: "0.78rem", color: "#9CA3AF" }}>Unlocks when driver signs up</span>
                        ) : null}
                        {pos.isDriver && pos.status === "OPEN" && !pos.languageCode && (
                          <span style={{ marginLeft: "6px", fontSize: "0.78rem", color: "#6B7280" }}>You pick your language</span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: st.bg, color: st.color }}>{st.label}</span>
                      {pos.isMyPosition ? (
                        <button
                          disabled={loading}
                          onClick={() => cancelPosition(pos.id)}
                          style={{ fontSize: "0.75rem", padding: "6px 14px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
                          title="Click to cancel"
                        >{loading ? "..." : "Signed Up ✓"}</button>
                      ) : pos.canSignUp ? (
                        <button
                          disabled={loading}
                          onClick={() => signUp(pos.id, shift)}
                          style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.4 : 1, whiteSpace: "nowrap" }}
                        >{loading ? "..." : "Sign Up"}</button>
                      ) : pos.status === "LOCKED" ? (
                        <span style={{ fontSize: "0.72rem", color: "#9CA3AF", padding: "6px 10px" }}>🔒 Locked</span>
                      ) : pos.status === "FILLED" ? null : (
                        <span style={{ fontSize: "0.72rem", color: "#9CA3AF", padding: "6px 10px" }}>Not eligible</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Driver language picker */}
      {driverLangPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", width: "100%", maxWidth: "380px" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1.5px solid var(--card-border)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--gray-900)", margin: 0 }}>Driver Sign-Up</h3>
              <p style={{ fontSize: "0.78rem", color: "#111827", marginTop: "4px" }}>As the driver, which language will you interpret?</p>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                {driverLangPicker.availableLangs.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setDriverLangChoice(lang)}
                    style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: driverLangChoice === lang ? "2px solid var(--blue)" : "1.5px solid var(--card-border)", background: driverLangChoice === lang ? "#EFF6FF" : "var(--card-bg)", color: "#111827", textAlign: "left" }}
                  >{langName(lang)}</button>
                ))}
                {driverLangPicker.availableLangs.length === 0 && (
                  <p style={{ fontSize: "0.82rem", color: "#DC2626" }}>You are not cleared for any of the required languages.</p>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => { setDriverLangPicker(null); setDriverLangChoice(""); }}
                  style={{ flex: 1, padding: "10px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", color: "#111827", borderRadius: "10px", background: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >Cancel</button>
                <button
                  disabled={!driverLangChoice || actionLoading === driverLangPicker.positionId}
                  onClick={confirmDriverSignUp}
                  style={{ flex: 1, padding: "10px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", opacity: !driverLangChoice ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
                >{actionLoading === driverLangPicker.positionId ? "Signing up..." : "Confirm Sign-Up"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
