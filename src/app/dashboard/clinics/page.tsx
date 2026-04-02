"use client";

import { useEffect, useState, useCallback } from "react";

type Clinic = {
  id: string;
  name: string;
  address: string;
  contactName: string;
  contactEmail: string;
  loginToken: string;
  loginPin: string;
  _count?: { staff: number; slots: number };
};

function MapsLinks({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const q = encodeURIComponent(address);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-maps-dropdown]") && !t.closest("[data-maps-btn]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "6px" }}>
      <button data-maps-btn onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ fontSize: "0.72rem", color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit" }}>Maps ↗</button>
      {open && (
        <span data-maps-dropdown style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", padding: "6px 0", display: "flex", flexDirection: "column", whiteSpace: "nowrap", minWidth: "120px" }}>
          <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "var(--gray-900)", textDecoration: "none", display: "block" }}>Google Maps</a>
          <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ padding: "5px 14px", fontSize: "0.78rem", color: "var(--gray-900)", textDecoration: "none", display: "block" }}>Apple Maps</a>
        </span>
      )}
    </span>
  );
}

export default function ClinicsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showClinicForm, setShowClinicForm] = useState(false);
  const [clinicForm, setClinicForm] = useState({ name: "", address: "", contactName: "", contactEmail: "" });
  const [clinicFormError, setClinicFormError] = useState("");
  const [pinReveal, setPinReveal] = useState<{ clinicName: string; pin: string } | null>(null);
  const [pinVisible, setPinVisible] = useState<Set<string>>(new Set());
  const [pinCopied, setPinCopied] = useState<string | null>(null);
  const [regenConfirm, setRegenConfirm] = useState<{ clinicId: string; clinicName: string } | null>(null);

  const copyPin = (pin: string, key: string) => {
    void navigator.clipboard.writeText(pin).then(() => {
      setPinCopied(key);
      setTimeout(() => setPinCopied((c) => (c === key ? null : c)), 2000);
    });
  };

  const fetchClinics = useCallback(async () => {
    const res = await fetch("/api/admin/clinics");
    if (res.ok) setClinics(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchClinics();
  }, [fetchClinics]);

  const createClinic = async () => {
    setActionLoading("clinic-form");
    setClinicFormError("");
    const res = await fetch("/api/admin/clinics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clinicForm),
    });
    if (res.ok) {
      const data = await res.json();
      await fetchClinics();
      setClinicForm({ name: "", address: "", contactName: "", contactEmail: "" });
      setClinicFormError("");
      setShowClinicForm(false);
      setPinReveal({ clinicName: (data as { name: string; plainPin: string }).name, pin: (data as { name: string; plainPin: string }).plainPin });
    } else {
      const data = await res.json().catch(() => ({}));
      setClinicFormError((data as { error?: string }).error ?? `Error ${res.status} — please try again.`);
    }
    setActionLoading(null);
  };

  const deleteClinic = async (clinicId: string, clinicName: string) => {
    if (!confirm(`Delete "${clinicName}"? This cannot be undone.`)) return;
    setActionLoading(`delete-clinic-${clinicId}`);
    const res = await fetch(`/api/admin/clinics/${clinicId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchClinics();
    } else {
      const data = await res.json().catch(() => ({}));
      alert((data as { error?: string }).error ?? "Could not delete clinic.");
    }
    setActionLoading(null);
  };

  const regeneratePin = async (clinicId: string, clinicName: string) => {
    setRegenConfirm({ clinicId, clinicName });
  };

  const confirmRegenPin = async () => {
    if (!regenConfirm) return;
    const { clinicId, clinicName } = regenConfirm;
    setRegenConfirm(null);
    setActionLoading(`pin-${clinicId}`);
    const res = await fetch(`/api/admin/clinics/${clinicId}`, { method: "PATCH" });
    if (res.ok) {
      const data = await res.json();
      await fetchClinics();
      setPinReveal({ clinicName, pin: (data as { plainPin: string }).plainPin });
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>Clinics</h1>
        <button
          onClick={() => setShowClinicForm(!showClinicForm)}
          style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
        >
          {showClinicForm ? "Cancel" : "+ Add Clinic"}
        </button>
      </div>

      {showClinicForm && (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "16px" }}>New Clinic</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <input placeholder="Clinic Name" value={clinicForm.name} onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
            <input placeholder="Address" value={clinicForm.address} onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
            <input placeholder="Contact Name" value={clinicForm.contactName} onChange={(e) => setClinicForm({ ...clinicForm, contactName: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
            <input placeholder="Contact Email" value={clinicForm.contactEmail} onChange={(e) => setClinicForm({ ...clinicForm, contactEmail: e.target.value })} style={{ padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "var(--gray-900)", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
          </div>
          {clinicFormError && (
            <p style={{ marginTop: "12px", fontSize: "0.875rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>{clinicFormError}</p>
          )}
          <button
            disabled={actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail}
            onClick={() => void createClinic()}
            style={{ marginTop: "16px", padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail) ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
          >
            {actionLoading === "clinic-form" ? "Creating..." : "Create Clinic"}
          </button>
        </div>
      )}

      {clinics.length === 0 && !showClinicForm ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No clinics yet</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {clinics.map((clinic) => (
            <div key={clinic.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--navy)" }}>{clinic.name}</h3>
                  <p style={{ fontSize: "0.875rem", color: "#111827", marginTop: "2px" }}>
                    {clinic.address}
                    {clinic.address && <MapsLinks address={clinic.address} />}
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "4px" }}>{clinic.contactName} · {clinic.contactEmail}</p>
                  <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,.04)", border: "1.5px solid var(--card-border)", borderRadius: "8px", padding: "4px 10px" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>PIN</span>
                      <span
                        onClick={() => pinVisible.has(clinic.id) && copyPin(clinic.loginPin, clinic.id)}
                        title={pinVisible.has(clinic.id) ? "Click to copy" : undefined}
                        style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 700, color: "#111827", letterSpacing: "0.2em", cursor: pinVisible.has(clinic.id) ? "pointer" : "default" }}
                      >
                        {pinVisible.has(clinic.id) ? clinic.loginPin : "••••••••"}
                      </span>
                      <button
                        onClick={() => setPinVisible(prev => { const n = new Set(prev); n.has(clinic.id) ? n.delete(clinic.id) : n.add(clinic.id); return n; })}
                        title={pinVisible.has(clinic.id) ? "Hide PIN" : "Show PIN"}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", lineHeight: 1, padding: "0 2px", display: "flex", alignItems: "center" }}
                      >
                        {pinVisible.has(clinic.id) ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                      {pinVisible.has(clinic.id) && (
                        <button
                          onClick={() => copyPin(clinic.loginPin, clinic.id)}
                          title="Copy PIN"
                          style={{ background: "none", border: "none", cursor: "pointer", color: pinCopied === clinic.id ? "#16A34A" : "var(--gray-400)", lineHeight: 1, padding: "0 2px", display: "flex", alignItems: "center" }}
                        >
                          {pinCopied === clinic.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          )}
                        </button>
                      )}
                    </div>
                    <button
                      disabled={actionLoading === `pin-${clinic.id}`}
                      onClick={() => void regeneratePin(clinic.id, clinic.name)}
                      style={{ fontSize: "0.75rem", padding: "4px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", color: "#B45309", borderRadius: "8px", cursor: "pointer", opacity: actionLoading === `pin-${clinic.id}` ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                    >
                      Regenerate PIN
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>{clinic._count?.slots || 0} slots</span>
                  <button
                    disabled={actionLoading === `delete-clinic-${clinic.id}`}
                    onClick={() => void deleteClinic(clinic.id, clinic.name)}
                    style={{ fontSize: "0.75rem", padding: "4px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: "8px", cursor: "pointer", opacity: actionLoading === `delete-clinic-${clinic.id}` ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Regenerate PIN confirm modal */}
      {regenConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "18px", boxShadow: "0 8px 32px rgba(0,0,0,.18)", padding: "24px 24px 20px", width: "100%", maxWidth: "380px" }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "#111827", lineHeight: 1.5, marginBottom: "20px" }}>Generate a new PIN for <strong>{regenConfirm.clinicName}</strong>? The old PIN will stop working immediately.</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setRegenConfirm(null)} style={{ background: "none", border: "1.5px solid var(--card-border)", color: "#0F172A", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 600, padding: "8px 18px", borderRadius: "99px", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => void confirmRegenPin()} style={{ background: "var(--blue)", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 600, padding: "8px 18px", borderRadius: "99px", cursor: "pointer" }}>Regenerate</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN reveal modal */}
      {pinReveal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "18px", border: "1.5px solid var(--card-border)", padding: "24px 24px 20px", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,.18)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Clinic Created</h3>
            <p style={{ fontSize: "0.875rem", color: "#111827", marginBottom: "16px" }}>Share this login PIN with <strong>{pinReveal.clinicName}</strong>:</p>
            <div
              onClick={() => copyPin(pinReveal.pin, "modal")}
              title="Click to copy"
              style={{ background: "#F0F7FF", border: "1px solid #BFDBFE", borderRadius: "12px", padding: "16px 24px", marginBottom: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}
            >
              <p style={{ fontSize: "2rem", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.3em", color: "#1D4ED8" }}>{pinReveal.pin}</p>
              {pinCopied === "modal" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setPinReveal(null)} style={{ background: "var(--blue)", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 600, padding: "8px 18px", borderRadius: "99px", cursor: "pointer" }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
