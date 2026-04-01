"use client";

import { useEffect, useState, useCallback } from "react";

type Metrics = {
  totalHours: number;
  hoursByLanguage: { code: string; name: string; hours: number }[];
  hoursByClinic: { clinicId: string; clinicName: string; hours: number }[];
  volunteerCount: number;
  activeVolunteerCount?: number;
  filledSlotHours?: number;
  unfilledSlotHours?: number;
  feedbackCount?: number;
  avgVolunteerRating?: number | null;
  avgClinicRating?: number | null;
};

type AdminFeedback = {
  id: string;
  authorRole: string;
  rating: number | null;
  note: string;
  createdAt: string;
  signup: {
    slot: { date: string; language: string; clinic: { name: string } };
    volunteer: { user: { name: string | null; email: string } };
  };
};

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [allFeedback, setAllFeedback] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [metricsRes, feedbackRes] = await Promise.all([
      fetch("/api/admin/metrics"),
      fetch("/api/admin/feedback"),
    ]);
    if (metricsRes.ok) setMetrics(await metricsRes.json());
    if (feedbackRes.ok) setAllFeedback(await feedbackRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const deleteFeedback = async (feedbackId: string) => {
    if (!confirm("Delete this feedback entry?")) return;
    const res = await fetch(`/api/admin/feedback/${feedbackId}`, { method: "DELETE" });
    if (res.ok) setAllFeedback((prev) => prev.filter((f) => f.id !== feedbackId));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "#111827", fontFamily: "'DM Sans', sans-serif" }}>Loading metrics...</p>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>Metrics</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
        {[
          { value: metrics.totalHours, label: "Total Hours" },
          { value: metrics.activeVolunteerCount ?? metrics.volunteerCount, label: "Active Volunteers", sub: "volunteered in last 30 days" },
          { value: metrics.filledSlotHours ?? "—", label: "Filled Slot-Hours", sub: "upcoming" },
          { value: metrics.unfilledSlotHours ?? "—", label: "Unfilled Slot-Hours", sub: "upcoming" },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px", textAlign: "center" }}>
            <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--gray-900)" }}>{stat.value}</p>
            <p style={{ fontSize: "0.75rem", color: "#111827", marginTop: "4px" }}>{stat.label}</p>
            {stat.sub && <p style={{ fontSize: "0.68rem", color: "#111827", marginTop: "2px", fontStyle: "italic" }}>{stat.sub}</p>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>Hours by Language</h3>
          {metrics.hoursByLanguage.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "#111827" }}>No data yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {metrics.hoursByLanguage.map((item) => (
                <div key={item.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 700, padding: "2px 6px", background: "var(--gray-200)", color: "#111827", borderRadius: "4px" }}>{item.code}</span>
                    <span style={{ fontSize: "0.875rem", color: "#111827" }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)" }}>{item.hours}h</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>Hours by Clinic</h3>
          {metrics.hoursByClinic.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "#111827" }}>No data yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {metrics.hoursByClinic.map((item) => (
                <div key={item.clinicId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.875rem", color: "#111827" }}>{item.clinicName}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gray-900)" }}>{item.hours}h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: "0.75rem", color: "#111827", textAlign: "center" }}>Graphs coming soon</p>

      <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "20px" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>Feedback Overview</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "16px" }}>
          {[
            { value: metrics.feedbackCount ?? 0, label: "Total Feedback" },
            { value: metrics.avgVolunteerRating != null ? `${metrics.avgVolunteerRating}★` : "—", label: "Avg Volunteer Rating" },
            { value: metrics.avgClinicRating != null ? `${metrics.avgClinicRating}★` : "—", label: "Avg Clinic Rating" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--gray-900)" }}>{stat.value}</p>
              <p style={{ fontSize: "0.75rem", color: "#111827", marginTop: "4px" }}>{stat.label}</p>
            </div>
          ))}
        </div>
        {allFeedback.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "4px" }}>Recent Feedback</p>
            {allFeedback.slice(0, 10).map((fb) => (
              <div key={fb.id} style={{ border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, background: fb.authorRole === "CLINIC" ? "#EBF3FC" : "#DCFCE7", color: fb.authorRole === "CLINIC" ? "#0D1F3C" : "#15803D" }}>
                      {fb.authorRole}
                    </span>
                    <button
                      onClick={() => void deleteFeedback(fb.id)}
                      style={{ fontSize: "0.68rem", padding: "2px 8px", background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: "5px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >Delete</button>
                    {fb.rating != null && (
                      <span style={{ fontSize: "0.75rem", color: "#F59E0B" }}>
                        {"★".repeat(fb.rating)}{"☆".repeat(5 - fb.rating)}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "#111827" }}>{new Date(fb.createdAt).toLocaleDateString()}</span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "#111827", marginBottom: "4px" }}>{fb.note}</p>
                <p style={{ fontSize: "0.72rem", color: "#111827" }}>
                  {fb.signup.slot.clinic.name} · {fb.signup.volunteer.user.name ?? fb.signup.volunteer.user.email}
                </p>
              </div>
            ))}
          </div>
        )}
        {allFeedback.length === 0 && (
          <p style={{ fontSize: "0.75rem", color: "#111827", textAlign: "center", padding: "16px 0" }}>No feedback yet.</p>
        )}
      </div>
    </div>
  );
}
