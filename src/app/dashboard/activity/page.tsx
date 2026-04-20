"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type ActivityLogEntry = {
  id: string;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  detail: string | null;
  createdAt: string;
};

export default function ActivityPage() {
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activityLogNextCursor, setActivityLogNextCursor] = useState<string | null>(null);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [activityLogSearch, setActivityLogSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActivityLogs = useCallback(async (search: string, cursor?: string) => {
    setActivityLogLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/admin/activity-log?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (cursor) {
        setActivityLogs((prev) => [...prev, ...(data as { items: ActivityLogEntry[]; nextCursor: string | null }).items]);
      } else {
        setActivityLogs((data as { items: ActivityLogEntry[]; nextCursor: string | null }).items);
      }
      setActivityLogNextCursor((data as { items: ActivityLogEntry[]; nextCursor: string | null }).nextCursor);
    }
    setActivityLogLoading(false);
  }, []);

  useEffect(() => {
    void fetchActivityLogs("");
  }, [fetchActivityLogs]);

  const handleSearchChange = (q: string) => {
    setActivityLogSearch(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setActivityLogs([]);
      setActivityLogNextCursor(null);
      void fetchActivityLogs(q);
    }, 400);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>Activity Log</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input
          type="text"
          placeholder="Search by user, action, or detail..."
          value={activityLogSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ flex: 1, padding: "9px 14px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "10px", background: "var(--card-bg)", color: "#111827", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
        />
        <button
          onClick={() => { setActivityLogs([]); setActivityLogNextCursor(null); void fetchActivityLogs(activityLogSearch); }}
          style={{ padding: "9px 16px", fontSize: "0.875rem", background: "var(--gray-200)", color: "#111827", border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
        >Refresh</button>
      </div>

      {activityLogs.length === 0 && !activityLogLoading ? (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--gray-400)" }}>No activity logged yet.</p>
        </div>
      ) : (
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "10px" }}>
          {activityLogLoading && activityLogs.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--gray-400)" }}>Loading...</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {activityLogs.map((entry) => (
                <div key={entry.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                    <div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#111827" }}>
                        {entry.actorName ?? entry.actorEmail ?? "System"}
                      </span>
                      {entry.actorEmail && entry.actorName && (
                        <div style={{ fontSize: "0.72rem", color: "#374151" }}>{entry.actorEmail}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 600, padding: "2px 7px", background: "var(--gray-200)", color: "#111827", borderRadius: "5px" }}>
                        {entry.action}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "#374151", whiteSpace: "nowrap" }}>
                        {new Date(entry.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  {entry.detail && (
                    <div style={{ fontSize: "0.78rem", color: "#111827" }}>{entry.detail}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {activityLogNextCursor && (
            <div style={{ padding: "12px", textAlign: "center", borderTop: "1px solid var(--card-border)" }}>
              <button
                disabled={activityLogLoading}
                onClick={() => void fetchActivityLogs(activityLogSearch, activityLogNextCursor ?? undefined)}
                style={{ padding: "8px 24px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", opacity: activityLogLoading ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
              >
                {activityLogLoading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
