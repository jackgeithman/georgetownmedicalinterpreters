"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { langName } from "@/lib/languages";

type VolunteerStats = {
  languages: string[];
  hoursVolunteered: number;
  cancellationsWithin24h: number;
  cancellationsWithin2h: number;
  noShows: number;
  isCleared: boolean;
  clearedAt: string | null;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  status: string;
  clinicId: string | null;
  createdAt: string;
  clinic?: { name: string } | null;
  volunteer?: VolunteerStats | null;
};

type LanguageConfig = { id: string; code: string; name: string; isActive: boolean };

const ROLE_CHIPS = [
  { key: "ADMIN",      label: "Admin",      bg: "#F5F3FF", color: "#6D28D9", border: "#EDE9FE" },
  { key: "VOLUNTEER",  label: "Volunteer",  bg: "#DCFCE7", color: "#15803D", border: "#BBF7D0" },
  { key: "INSTRUCTOR", label: "Instructor", bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  { key: "DEV",        label: "Developer",  bg: "#EDE9FE", color: "#5B21B6", border: "#DDD6FE" },
  { key: "PENDING",    label: "Unassigned", bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" },
] as const;

function getLangLabel(code: string) {
  return langName(code);
}

function parseUserRoles(roles: string[]) {
  const roleChips: string[] = [];
  const langMap: Record<string, "pending" | "cleared" | "denied"> = {};
  for (const r of roles) {
    if (r.startsWith("LANG_")) {
      if (r.endsWith("_CLEARED")) langMap[r.slice(5, -8)] = "cleared";
      else if (r.endsWith("_DENIED")) langMap[r.slice(5, -7)] = "denied";
      else langMap[r.slice(5)] = "pending";
    } else {
      roleChips.push(r);
    }
  }
  const langChips = Object.entries(langMap).map(([code, state]) => ({ code, state }));
  return { roleChips, langChips };
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState<Set<string>>(new Set());
  const [addRoleTarget, setAddRoleTarget] = useState<string | null>(null);
  const [addRoleDropdownPos, setAddRoleDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [addLangTarget, setAddLangTarget] = useState<string | null>(null);
  const [addLangDropdownPos, setAddLangDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [volunteerRemoveWarning, setVolunteerRemoveWarning] = useState<{ userId: string; userName: string; upcomingCount: number } | null>(null);
  const [langActionModal, setLangActionModal] = useState<{
    userId: string;
    langCode: string;
    action: "deny" | "revoke" | "override";
    note: string;
  } | null>(null);
  const [counterEditTarget, setCounterEditTarget] = useState<string | null>(null);
  const [counterEditValues, setCounterEditValues] = useState<{ cancellationsWithin24h: number; cancellationsWithin2h: number; noShows: number }>({ cancellationsWithin24h: 0, cancellationsWithin2h: 0, noShows: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!addRoleTarget) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-role-add-dropdown]") && !t.closest("[data-role-add-btn]")) {
        setAddRoleTarget(null);
        setAddRoleDropdownPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addRoleTarget]);

  useEffect(() => {
    if (!roleFilterOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-role-filter-dropdown]") && !t.closest("[data-role-filter-btn]")) {
        setRoleFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [roleFilterOpen]);

  useEffect(() => {
    if (!addLangTarget) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-lang-add-dropdown]") && !t.closest("[data-lang-add-btn]")) {
        setAddLangTarget(null);
        setAddLangDropdownPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addLangTarget]);

  const fetchData = useCallback(async () => {
    const [usersRes, langsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/languages"),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (langsRes.ok) setLanguages(await langsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const updateUser = async (userId: string, data: Record<string, string | null>) => {
    setActionLoading(userId);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...data }),
    });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

  const handleAddRole = async (userId: string, role: string) => {
    setRoleActionLoading(`add-${userId}-${role}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, addRole: role }),
    });
    if (res.ok) await fetchData();
    setAddRoleTarget(null);
    setRoleActionLoading(null);
  };

  const handleRemoveRole = async (userId: string, role: string, confirm?: boolean) => {
    setRoleActionLoading(`remove-${userId}-${role}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, removeRole: role, confirmRemoveVolunteer: confirm }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.needsConfirm) {
        const u = users.find((x) => x.id === userId);
        setVolunteerRemoveWarning({ userId, userName: u?.name ?? userId, upcomingCount: data.upcomingCount });
        setRoleActionLoading(null);
        return;
      }
      await fetchData();
    }
    setRoleActionLoading(null);
  };

  const handleLangAction = async (userId: string, langCode: string, action: "approve" | "deny" | "revoke" | "override", note?: string) => {
    const key = `lang-${userId}-${langCode}`;
    setRoleActionLoading(key);
    const body: Record<string, string> = { userId };
    if (action === "approve") body.approveLanguage = langCode;
    else if (action === "deny") body.denyLanguage = langCode;
    else if (action === "revoke") body.revokeLanguage = langCode;
    else body.overrideLanguage = langCode;
    if (note) body.note = note;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) await fetchData();
    setRoleActionLoading(null);
  };

  const handleAddLanguage = async (userId: string, langCode: string) => {
    setRoleActionLoading(`addlang-${userId}-${langCode}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, addLanguage: langCode }),
    });
    if (res.ok) await fetchData();
    setAddLangTarget(null);
    setAddLangDropdownPos(null);
    setRoleActionLoading(null);
  };

  const handleRemoveLanguage = async (userId: string, langCode: string) => {
    setRoleActionLoading(`removelang-${userId}-${langCode}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, removeLanguage: langCode }),
    });
    if (res.ok) await fetchData();
    setRoleActionLoading(null);
  };

  const saveCounters = async (userId: string) => {
    setActionLoading(`counters-${userId}`);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, updateCounters: counterEditValues }),
    });
    setCounterEditTarget(null);
    await fetchData();
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  const pendingUsers = users.filter((u) => u.status === "PENDING_APPROVAL");
  const pendingLangCount = users.filter((u) =>
    (u.roles ?? []).some((r) => r.startsWith("LANG_") && !r.endsWith("_CLEARED") && !r.endsWith("_DENIED")),
  ).length;

  const viewerIsAdmin = session?.user?.role === "ADMIN" || session?.user?.roles?.includes("DEV");
  const isSuperAdmin = session?.user?.roles?.includes("DEV");

  const sortedUsers = [...users].sort((a, b) => {
    if (a.status === "PENDING_APPROVAL" && b.status !== "PENDING_APPROVAL") return -1;
    if (a.status !== "PENDING_APPROVAL" && b.status === "PENDING_APPROVAL") return 1;
    return 0;
  });

  const filteredUsers = roleFilter.length === 0 ? sortedUsers : sortedUsers.filter(u =>
    roleFilter.every(f => {
      if (f === "SUSPENDED") return u.status === "SUSPENDED";
      if (f.startsWith("LANG_")) {
        const code = f.slice(5);
        return (u.roles ?? []).some(r => r === `LANG_${code}` || r === `LANG_${code}_CLEARED`);
      }
      return (u.roles ?? []).includes(f);
    })
  );

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <button
            data-role-filter-btn="true"
            onClick={() => setRoleFilterOpen(!roleFilterOpen)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "0.82rem", fontWeight: 500, border: roleFilter.length > 0 ? "1.5px solid var(--blue)" : "1.5px solid var(--card-border)", borderRadius: "9px", background: roleFilter.length > 0 ? "#EFF6FF" : "var(--card-bg)", color: roleFilter.length > 0 ? "var(--blue)" : "#111827", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filter{roleFilter.length > 0 && ` (${roleFilter.length})`}
          </button>
          {roleFilterOpen && (
            <div data-role-filter-dropdown="true" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "12px", padding: "12px", minWidth: "220px", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-400)", marginBottom: "8px" }}>Roles</p>
              {(["ADMIN", "VOLUNTEER", "INSTRUCTOR", "PENDING", "SUSPENDED"] as const).map(r => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 4px", cursor: "pointer", fontSize: "0.82rem", color: "#111827" }}>
                  <input type="checkbox" checked={roleFilter.includes(r)} onChange={() => setRoleFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} style={{ accentColor: "var(--blue)", width: "14px", height: "14px" }} />
                  {r === "PENDING" ? "Unassigned" : r.charAt(0) + r.slice(1).toLowerCase()}
                </label>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 4px", cursor: "pointer", fontSize: "0.82rem", color: "#111827" }}>
                <input type="checkbox" checked={roleFilter.includes("DEV")} onChange={() => setRoleFilter(prev => prev.includes("DEV") ? prev.filter(x => x !== "DEV") : [...prev, "DEV"])} style={{ accentColor: "var(--blue)", width: "14px", height: "14px" }} />
                Developer (Dev scope)
              </label>
              <div style={{ borderTop: "1px solid var(--card-border)", marginTop: "8px", paddingTop: "8px" }}>
                <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-400)", marginBottom: "8px" }}>Languages</p>
                {["ES", "ZH", "KO", "AR", "FR", "HI", "PT", "RU", "DE", "JA", "VI"].map(code => (
                  <label key={code} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 4px", cursor: "pointer", fontSize: "0.82rem", color: "#111827" }}>
                    <input type="checkbox" checked={roleFilter.includes(`LANG_${code}`)} onChange={() => setRoleFilter(prev => prev.includes(`LANG_${code}`) ? prev.filter(x => x !== `LANG_${code}`) : [...prev, `LANG_${code}`])} style={{ accentColor: "var(--blue)", width: "14px", height: "14px" }} />
                    {getLangLabel(code)}
                  </label>
                ))}
              </div>
              {roleFilter.length > 0 && (
                <button onClick={() => setRoleFilter([])} style={{ marginTop: "8px", width: "100%", padding: "6px", fontSize: "0.78rem", color: "var(--gray-400)", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear all</button>
              )}
            </div>
          )}
        </div>
        {roleFilter.map(f => (
          <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600, background: "#EFF6FF", color: "var(--blue)", borderRadius: "6px", border: "1px solid #BFDBFE" }}>
            {f.startsWith("LANG_") ? getLangLabel(f.slice(5)) : f === "DEV" ? "Super Admin" : f === "PENDING" ? "Unassigned" : f.charAt(0) + f.slice(1).toLowerCase()}
            <button onClick={() => setRoleFilter(prev => prev.filter(x => x !== f))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--blue)", fontSize: "0.85rem", lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        {(pendingUsers.length > 0 || pendingLangCount > 0) && (
          <span style={{ fontSize: "0.75rem", padding: "3px 10px", background: "#FEF2F2", color: "#DC2626", borderRadius: "6px", fontWeight: 600 }}>
            {pendingUsers.length + pendingLangCount} pending action{(pendingUsers.length + pendingLangCount) !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Language clearance legend */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "10px", padding: "10px 16px", background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827" }}>Language chips:</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#111827" }}>
          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
          Amber — pending clearance
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#111827" }}>
          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
          Green — cleared to interpret
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#111827" }}>
          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />
          Red — clearance denied
        </span>
      </div>

      <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid var(--card-border)" }}>
              <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Name</th>
              <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Email</th>
              <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Roles</th>
              <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Languages</th>
              <th style={{ textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Stats</th>
              <th style={{ textAlign: "right", fontSize: "0.68rem", fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.09em", padding: "12px 20px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const { roleChips, langChips } = parseUserRoles(user.roles ?? []);
              const isUserSuperAdmin = user.roles?.includes("DEV");
              const canModify = isSuperAdmin || (!isUserSuperAdmin && user.role !== "ADMIN");
              const canAdminModify = viewerIsAdmin && canModify;
              const emailFull = user.email ?? "";
              const isExpanded = emailExpanded.has(user.id);
              const addableRoles = ROLE_CHIPS.filter(r => {
                if (roleChips.includes(r.key)) return false;
                if (r.key === "DEV") return false;
                if (r.key === "ADMIN" && !isSuperAdmin) return false;
                if (isUserSuperAdmin) return false;
                return true;
              });
              return (
                <tr key={user.id} style={{ borderBottom: "1px solid var(--card-border)", background: user.status === "PENDING_APPROVAL" ? "rgba(251,191,36,.06)" : "transparent" }}>

                  {/* Name */}
                  <td style={{ padding: "14px 20px", fontSize: "0.875rem", color: "#111827", fontWeight: 500, whiteSpace: "nowrap" }}>{user.name}</td>

                  {/* Email — truncated, click to expand */}
                  <td style={{ padding: "14px 20px" }}>
                    <button
                      onClick={() => setEmailExpanded(prev => { const n = new Set(prev); isExpanded ? n.delete(user.id) : n.add(user.id); return n; })}
                      title={emailFull}
                      style={{ fontSize: "0.82rem", color: "#111827", background: "none", border: "none", cursor: emailFull.length > 18 ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", padding: 0, textAlign: "left" }}
                    >
                      {isExpanded ? emailFull : emailFull.length > 18 ? `${emailFull.slice(0, 18)}…` : emailFull}
                    </button>
                  </td>

                  {/* Roles */}
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                      {user.status === "SUSPENDED" && (
                        <span style={{ display: "inline-flex", alignItems: "center", fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                          Suspended
                        </span>
                      )}
                      {roleChips.map(r => {
                        const chip = ROLE_CHIPS.find(c => c.key === r);
                        const label  = chip?.label  ?? (r === "PENDING" ? "Unassigned" : r.charAt(0) + r.slice(1).toLowerCase());
                        const bg     = chip?.bg     ?? "#F1F5F9";
                        const color  = chip?.color  ?? "#475569";
                        const border = chip?.border ?? "#CBD5E1";
                        const isLoading = roleActionLoading === `remove-${user.id}-${r}`;
                        return (
                          <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.72rem", padding: "2px 6px 2px 8px", borderRadius: "99px", fontWeight: 600, background: bg, color, border: `1px solid ${border}` }}>
                            {label}
                            {canAdminModify && r !== "PENDING" && r !== "DEV" && (
                              <button
                                onClick={() => handleRemoveRole(user.id, r)}
                                disabled={!!isLoading}
                                title={`Remove ${label}`}
                                style={{ background: "none", border: "none", cursor: "pointer", color, opacity: isLoading ? 0.4 : 0.55, fontSize: "0.9rem", lineHeight: 1, padding: "0 1px", fontFamily: "'DM Sans', sans-serif" }}
                              >×</button>
                            )}
                          </span>
                        );
                      })}
                      {canAdminModify && addableRoles.length > 0 && (
                        <button
                          data-role-add-btn="true"
                          onClick={(e) => {
                            if (addRoleTarget === user.id) {
                              setAddRoleTarget(null);
                              setAddRoleDropdownPos(null);
                            } else {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setAddRoleTarget(user.id);
                              setAddRoleDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
                            }
                          }}
                          title="Add role"
                          style={{ width: "20px", height: "20px", borderRadius: "99px", border: "1.5px dashed var(--card-border)", background: "none", cursor: "pointer", color: "var(--gray-400)", fontSize: "1rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}
                        >+</button>
                      )}
                    </div>
                  </td>

                  {/* Languages */}
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {langChips.map(({ code, state }) => {
                        const isLoading = roleActionLoading === `lang-${user.id}-${code}`;
                        const chipStyle =
                          state === "cleared"
                            ? { bg: "#BBF7D0", color: "#15803D", border: "1px solid #86EFAC", dot: "#10B981" }
                            : state === "denied"
                            ? { bg: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", dot: "#EF4444" }
                            : { bg: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A", dot: "#F59E0B" };
                        return (
                          <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.72rem", borderRadius: "99px", fontWeight: 600, background: chipStyle.bg, color: chipStyle.color, border: chipStyle.border, opacity: isLoading ? 0.5 : 1 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px 2px 8px" }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: chipStyle.dot, flexShrink: 0 }} />
                              {getLangLabel(code)}
                            </span>
                            {state === "pending" && (
                              <>
                                <button onClick={() => handleLangAction(user.id, code, "approve")} disabled={isLoading} title="Approve clearance" style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", border: "none", background: "#BBF7D0", color: "#15803D", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Approve</button>
                                <button onClick={() => setLangActionModal({ userId: user.id, langCode: code, action: "deny", note: "" })} disabled={isLoading} title="Deny clearance" style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", border: "none", background: "#FECACA", color: "#DC2626", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Deny</button>
                                <button onClick={() => handleRemoveLanguage(user.id, code)} disabled={roleActionLoading === `removelang-${user.id}-${code}`} title={`Remove ${getLangLabel(code)}`} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.55, fontSize: "0.9rem", lineHeight: 1, padding: "0 5px 0 1px", fontFamily: "'DM Sans', sans-serif" }}>×</button>
                              </>
                            )}
                            {state === "cleared" && canModify && (
                              <button onClick={() => setLangActionModal({ userId: user.id, langCode: code, action: "revoke", note: "" })} disabled={isLoading} title="Revoke clearance" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "0.9rem", lineHeight: 1, padding: "0 5px 0 1px", fontFamily: "'DM Sans', sans-serif" }}>×</button>
                            )}
                            {state === "denied" && (
                              <button onClick={() => setLangActionModal({ userId: user.id, langCode: code, action: "override", note: "" })} disabled={isLoading} title="Override denial" style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", border: "none", background: "#BBF7D0", color: "#15803D", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginRight: "3px" }}>Override</button>
                            )}
                            {state !== "pending" && state !== "cleared" && canModify && (
                              <button onClick={() => handleRemoveLanguage(user.id, code)} disabled={roleActionLoading === `removelang-${user.id}-${code}`} title={`Remove ${getLangLabel(code)}`} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.55, fontSize: "0.9rem", lineHeight: 1, padding: "0 5px 0 1px", fontFamily: "'DM Sans', sans-serif" }}>×</button>
                            )}
                          </span>
                        );
                      })}
                      {langChips.length === 0 && <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>—</span>}
                      {canModify && (
                        <button
                          data-lang-add-btn="true"
                          onClick={(e) => {
                            if (addLangTarget === user.id) {
                              setAddLangTarget(null);
                              setAddLangDropdownPos(null);
                            } else {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setAddLangTarget(user.id);
                              setAddLangDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
                            }
                          }}
                          title="Add language"
                          style={{ width: "20px", height: "20px", borderRadius: "99px", border: "1.5px dashed #94A3B8", background: "none", cursor: "pointer", color: "#94A3B8", fontSize: "1rem", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}
                        >+</button>
                      )}
                    </div>
                  </td>

                  {/* Stats */}
                  <td style={{ padding: "14px 20px" }}>
                    {user.volunteer ? (
                      counterEditTarget === user.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem", minWidth: "120px" }}>
                          {[
                            { label: "NS", field: "noShows" as const },
                            { label: "24h", field: "cancellationsWithin24h" as const },
                            { label: "2h", field: "cancellationsWithin2h" as const },
                          ].map(({ label, field }) => (
                            <div key={field} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ color: "var(--gray-400)", width: "24px" }}>{label}</span>
                              <input
                                type="number"
                                min={0}
                                value={counterEditValues[field]}
                                onChange={(e) => setCounterEditValues((v) => ({ ...v, [field]: parseInt(e.target.value) || 0 }))}
                                style={{ width: "48px", padding: "2px 4px", fontSize: "0.75rem", border: "1.5px solid var(--card-border)", borderRadius: "5px", background: "var(--card-bg)", color: "#111827", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
                              />
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: "4px", marginTop: "2px" }}>
                            <button
                              onClick={() => saveCounters(user.id)}
                              disabled={actionLoading === `counters-${user.id}`}
                              style={{ fontSize: "0.68rem", padding: "2px 8px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                            >Save</button>
                            <button
                              onClick={() => setCounterEditTarget(null)}
                              style={{ fontSize: "0.68rem", padding: "2px 8px", background: "var(--gray-200)", color: "#111827", border: "none", borderRadius: "5px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                            >Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.75rem" }}>
                          <span style={{ color: "#111827" }}>⏱ {user.volunteer.hoursVolunteered}h</span>
                          {user.volunteer.noShows > 0 && <span style={{ color: "#EF4444" }}>NS {user.volunteer.noShows}</span>}
                          {(user.volunteer.cancellationsWithin24h > 0 || user.volunteer.cancellationsWithin2h > 0) && (
                            <span style={{ color: "#D97706" }}>
                              {user.volunteer.cancellationsWithin24h > 0 && `24h ${user.volunteer.cancellationsWithin24h}`}
                              {user.volunteer.cancellationsWithin24h > 0 && user.volunteer.cancellationsWithin2h > 0 && " · "}
                              {user.volunteer.cancellationsWithin2h > 0 && `2h ${user.volunteer.cancellationsWithin2h}`}
                            </span>
                          )}
                          {canAdminModify && (
                            <button
                              onClick={() => {
                                setCounterEditTarget(user.id);
                                setCounterEditValues({
                                  noShows: user.volunteer!.noShows,
                                  cancellationsWithin24h: user.volunteer!.cancellationsWithin24h,
                                  cancellationsWithin2h: user.volunteer!.cancellationsWithin2h,
                                });
                              }}
                              style={{ fontSize: "0.68rem", color: "var(--gray-400)", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans', sans-serif", marginTop: "2px" }}
                            >Edit</button>
                          )}
                        </div>
                      )
                    ) : (
                      <span style={{ fontSize: "0.78rem", color: "var(--gray-400)" }}>—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    {canAdminModify && user.status === "PENDING_APPROVAL" ? (
                      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => updateUser(user.id, { status: "ACTIVE", role: "VOLUNTEER" })}
                          style={{ padding: "6px 12px", fontSize: "0.75rem", background: "#DCFCE7", color: "#15803D", border: "none", borderRadius: "6px", cursor: "pointer", opacity: actionLoading === user.id ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                        >Approve</button>
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                          style={{ padding: "6px 12px", fontSize: "0.75rem", background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: "6px", cursor: "pointer", opacity: actionLoading === user.id ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                        >Reject</button>
                      </div>
                    ) : canAdminModify && !isUserSuperAdmin && (
                      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                        {user.status === "ACTIVE" ? (
                          <button
                            onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                            style={{ padding: "5px 10px", fontSize: "0.75rem", background: "#FEF2F2", color: "#DC2626", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                          >Suspend</button>
                        ) : user.status === "SUSPENDED" ? (
                          <button
                            onClick={() => updateUser(user.id, { status: "ACTIVE" })}
                            style={{ padding: "5px 10px", fontSize: "0.75rem", background: "#DCFCE7", color: "#15803D", border: "none", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                          >Activate</button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Volunteer-remove warning modal */}
      {volunteerRemoveWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "28px", maxWidth: "420px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>Remove Volunteer Role?</h3>
            <p style={{ fontSize: "0.875rem", color: "#111827", marginBottom: "20px", lineHeight: 1.5 }}>
              <strong>{volunteerRemoveWarning.userName}</strong> has <strong>{volunteerRemoveWarning.upcomingCount} upcoming shift{volunteerRemoveWarning.upcomingCount !== 1 ? "s" : ""}</strong>. Removing their Volunteer role will cancel all of them.
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setVolunteerRemoveWarning(null)}
                style={{ padding: "8px 16px", fontSize: "0.875rem", background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#111827" }}
              >Cancel</button>
              <button
                onClick={async () => {
                  const { userId } = volunteerRemoveWarning;
                  setVolunteerRemoveWarning(null);
                  await handleRemoveRole(userId, "VOLUNTEER", true);
                }}
                style={{ padding: "8px 16px", fontSize: "0.875rem", background: "#DC2626", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}
              >Remove &amp; Cancel Shifts</button>
            </div>
          </div>
        </div>
      )}

      {/* Lang action modal */}
      {langActionModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "28px", maxWidth: "440px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
              {langActionModal.action === "deny" && "Deny Language Clearance"}
              {langActionModal.action === "revoke" && "Revoke Language Clearance"}
              {langActionModal.action === "override" && "Override Denial"}
            </h3>
            <p style={{ fontSize: "0.82rem", color: "#111827", marginBottom: "16px" }}>
              {langActionModal.action === "deny" && `Deny clearance for ${getLangLabel(langActionModal.langCode)}. The volunteer will receive an email but will not see this note.`}
              {langActionModal.action === "revoke" && `Revoke clearance for ${getLangLabel(langActionModal.langCode)}. The volunteer will receive an email but will not see this note.`}
              {langActionModal.action === "override" && `Override the denial and clear ${getLangLabel(langActionModal.langCode)}. The volunteer will receive an approval email. This note is internal only.`}
            </p>
            <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", padding: "8px 12px", marginBottom: "14px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>🔒</span>
              <span style={{ fontSize: "0.78rem", color: "#92400E", fontWeight: 500 }}>Internal note — the volunteer will <strong>not</strong> see this.</span>
            </div>
            <textarea
              placeholder="Reason (required)..."
              value={langActionModal.note}
              onChange={(e) => setLangActionModal({ ...langActionModal, note: e.target.value })}
              rows={3}
              style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", background: "var(--card-bg)", color: "#111827", outline: "none", resize: "none", boxSizing: "border-box", marginBottom: "16px" }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setLangActionModal(null)} style={{ padding: "8px 18px", fontSize: "0.875rem", background: "var(--card-bg)", color: "#111827", border: "1.5px solid var(--card-border)", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button
                disabled={!langActionModal.note.trim()}
                onClick={async () => {
                  const { userId, langCode, action, note } = langActionModal;
                  setLangActionModal(null);
                  await handleLangAction(userId, langCode, action, note);
                }}
                style={{ padding: "8px 18px", fontSize: "0.875rem", background: langActionModal.action === "override" ? "var(--blue)" : "#DC2626", color: "#fff", border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: langActionModal.note.trim() ? 1 : 0.4 }}
              >
                {langActionModal.action === "deny" && "Deny"}
                {langActionModal.action === "revoke" && "Revoke"}
                {langActionModal.action === "override" && "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal: add-role dropdown */}
      {mounted && addRoleTarget && addRoleDropdownPos && (() => {
        const targetUser = users.find(u => u.id === addRoleTarget);
        if (!targetUser) return null;
        const { roleChips: tRoleChips } = parseUserRoles(targetUser.roles ?? []);
        const tIsSuperAdmin = targetUser.roles?.includes("DEV");
        const tAddableRoles = ROLE_CHIPS.filter(r => {
          if (tRoleChips.includes(r.key)) return false;
          if (r.key === "DEV") return false;
          if (r.key === "ADMIN" && !isSuperAdmin) return false;
          if (tIsSuperAdmin) return false;
          return true;
        });
        return ReactDOM.createPortal(
          <div
            data-role-add-dropdown="true"
            style={{ position: "absolute", top: addRoleDropdownPos.top, left: addRoleDropdownPos.left, zIndex: 9999, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "6px", minWidth: "140px", maxHeight: "200px", overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.15)" }}
          >
            {tAddableRoles.map(r => (
              <button
                key={r.key}
                onClick={() => handleAddRole(targetUser.id, r.key)}
                disabled={roleActionLoading === `add-${targetUser.id}-${r.key}`}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", fontSize: "0.78rem", fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: r.color, borderRadius: "6px", fontFamily: "'DM Sans', sans-serif" }}
              >
                {roleActionLoading === `add-${targetUser.id}-${r.key}` ? "…" : r.label}
              </button>
            ))}
          </div>,
          document.body
        );
      })()}

      {/* Portal: add-language dropdown */}
      {mounted && addLangTarget && addLangDropdownPos && (() => {
        const targetUser = users.find(u => u.id === addLangTarget);
        if (!targetUser) return null;
        const { langChips } = parseUserRoles(targetUser.roles ?? []);
        const assignedCodes = langChips.map(l => l.code);
        const availableLangs = languages.filter(l => l.isActive && !assignedCodes.includes(l.code.toUpperCase()));
        if (availableLangs.length === 0) return null;
        return ReactDOM.createPortal(
          <div
            data-lang-add-dropdown="true"
            style={{ position: "absolute", top: addLangDropdownPos.top, left: addLangDropdownPos.left, zIndex: 9999, background: "var(--card-bg)", border: "1.5px solid var(--card-border)", borderRadius: "10px", padding: "6px", minWidth: "140px", maxHeight: "200px", overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.15)" }}
          >
            {availableLangs.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleAddLanguage(targetUser.id, lang.code)}
                disabled={roleActionLoading === `addlang-${targetUser.id}-${lang.code}`}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", fontSize: "0.78rem", fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: "#64748B", borderRadius: "6px", fontFamily: "'DM Sans', sans-serif" }}
              >
                {roleActionLoading === `addlang-${targetUser.id}-${lang.code}` ? "…" : lang.name}
              </button>
            ))}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
