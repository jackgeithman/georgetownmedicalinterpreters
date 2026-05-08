"use client";

import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Constants ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Mobile",    w: 375,  h: 812  },
  { label: "iPhone SE", w: 320,  h: 568  },
  { label: "Tablet",    w: 768,  h: 1024 },
  { label: "Desktop",   w: 1280, h: 800  },
];

const ROLE_BUTTONS = [
  { label: "Admin",      email: "dev-admin@dev.local",      role: "ADMIN",      color: "#8b5cf6" },
  { label: "Instructor", email: "dev-instructor@dev.local", role: "INSTRUCTOR", color: "#10b981" },
  { label: "Clinic",     email: "dev-clinic@dev.local",     role: "CLINIC",     color: "#f59e0b" },
];

const VOLUNTEER_BUTTONS = [
  { label: "Driver ES",  email: "dev-driver-es@dev.local",    role: "VOLUNTEER", color: "#3b82f6" },
  { label: "Driver ZH",  email: "dev-driver-zh@dev.local",    role: "VOLUNTEER", color: "#3b82f6" },
  { label: "ES + ZH",    email: "dev-interp-es-zh@dev.local", role: "VOLUNTEER", color: "#3b82f6" },
  { label: "ES Only",    email: "dev-interp-es@dev.local",    role: "VOLUNTEER", color: "#3b82f6" },
  { label: "Uncleared",  email: "dev-uncleared@dev.local",    role: "VOLUNTEER", color: "#64748b" },
];

const ALL_BUTTONS = [...ROLE_BUTTONS, ...VOLUNTEER_BUTTONS];

const PAGES_BY_ROLE: Record<string, { label: string; path: string }[]> = {
  ADMIN: [
    { label: "Home",      path: "/" },
    { label: "Browse",    path: "/dashboard/browse" },
    { label: "Signups",   path: "/dashboard/signups" },
    { label: "Users",     path: "/dashboard/users" },
    { label: "Metrics",   path: "/dashboard/metrics" },
    { label: "Activity",  path: "/dashboard/activity" },
    { label: "Notes",     path: "/dashboard/notes" },
    { label: "Languages", path: "/dashboard/languages" },
    { label: "Clinics",   path: "/dashboard/clinics" },
    { label: "Messages",  path: "/dashboard/messages" },
    { label: "Training",  path: "/dashboard/training" },
    { label: "Profile",   path: "/dashboard/profile" },
    { label: "Access",    path: "/dashboard/access" },
  ],
  VOLUNTEER: [
    { label: "Home",     path: "/" },
    { label: "Browse",   path: "/dashboard/browse" },
    { label: "Signups",  path: "/dashboard/signups" },
    { label: "Profile",  path: "/dashboard/profile" },
    { label: "Training", path: "/dashboard/training" },
    { label: "Messages", path: "/dashboard/messages" },
  ],
  INSTRUCTOR: [
    { label: "Home",     path: "/" },
    { label: "Browse",   path: "/dashboard/browse" },
    { label: "Signups",  path: "/dashboard/signups" },
    { label: "Users",    path: "/dashboard/users" },
    { label: "Training", path: "/dashboard/training" },
    { label: "Messages", path: "/dashboard/messages" },
    { label: "Profile",  path: "/dashboard/profile" },
  ],
  CLINIC: [
    { label: "Home",             path: "/" },
    { label: "Clinic Dashboard", path: "/dashboard/clinic" },
  ],
  NONE: [
    { label: "Home",       path: "/" },
    { label: "Onboarding", path: "/onboarding" },
    { label: "Pending",    path: "/pending" },
    { label: "Terms",      path: "/terms" },
    { label: "Privacy",    path: "/privacy" },
  ],
};

const BAR_H = 34;

// ── Types ──────────────────────────────────────────────────────────────────

type DevLogEntry = {
  id: string;
  ts: string;
  service: "GCAL" | "GMAIL";
  action: string;
  summary: string;
  detail: string;
};

type DropdownId = "role" | "pages" | "view" | null;

// ── Shared styles ──────────────────────────────────────────────────────────

const FF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function tbBtn(active = false, color = "#94a3b8"): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: "4px",
    padding: "0 8px", height: "22px", borderRadius: "4px",
    fontSize: "11px", fontWeight: active ? 600 : 400,
    fontFamily: FF, whiteSpace: "nowrap", cursor: "pointer",
    border: `1px solid ${active ? color + "66" : "#2d3748"}`,
    background: active ? color + "18" : "transparent",
    color: active ? color : "#94a3b8",
    transition: "all 0.1s",
    flexShrink: 0,
  };
}

const dividerStyle: React.CSSProperties = {
  width: "1px", height: "16px", background: "#1e293b",
  flexShrink: 0, margin: "0 2px",
};

// ── Dropdown ───────────────────────────────────────────────────────────────

function Dropdown({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: "absolute", bottom: BAR_H + 4, left: 0,
      background: "#0d1220", border: "1px solid #1e293b",
      borderRadius: "8px", boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
      padding: "6px", zIndex: 10001, minWidth: "140px",
      fontFamily: FF,
      ...style,
    }}>
      {children}
    </div>
  );
}

function DropItem({
  label, color, active, onClick, sub,
}: {
  label: string; color?: string; active?: boolean; onClick: () => void; sub?: string;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: "100%", padding: "5px 8px", borderRadius: "5px",
      fontSize: "11px", fontWeight: active ? 600 : 400,
      color: active ? (color ?? "#fff") : "#94a3b8",
      background: active ? (color ?? "#fff") + "15" : "transparent",
      border: "none", cursor: "pointer", textAlign: "left", gap: "8px",
      fontFamily: FF, whiteSpace: "nowrap",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {color && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: active ? color : "#334155", flexShrink: 0 }} />}
        {label}
      </span>
      {sub && <span style={{ fontSize: "9px", color: "#334155", letterSpacing: "0.04em" }}>{sub}</span>}
    </button>
  );
}

function DropSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "9px", fontWeight: 700, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 8px 2px", fontFamily: FF }}>
      {children}
    </div>
  );
}

// ── ScaledIframe ───────────────────────────────────────────────────────────

function ScaledIframe({ preset, path }: { preset: typeof PRESETS[number]; path: string }) {
  const availW = window.innerWidth;
  const availH = window.innerHeight - BAR_H - 44;
  const scale  = Math.min(1, availW / preset.w, availH / preset.h);
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "22px" }}>
      <div style={{
        transformOrigin: "top center", transform: `scale(${scale})`,
        width: preset.w, height: preset.h, flexShrink: 0,
        boxShadow: "0 0 0 1px #334155, 0 24px 64px rgba(0,0,0,.7)",
        borderRadius: "10px", overflow: "hidden",
      }}>
        <iframe key={`${preset.label}-${path}`} src={path}
          style={{ width: preset.w, height: preset.h, border: "none", display: "block" }}
          title={`${preset.label} preview`} />
      </div>
    </div>
  );
}

// ── NotificationsPanel ─────────────────────────────────────────────────────

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [logs, setLogs]         = useState<DevLogEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/dev/logs").catch(() => null);
    if (res?.ok) setLogs(await res.json());
  }, []);

  useEffect(() => {
    fetchLogs();
    timer.current = setInterval(fetchLogs, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchLogs]);

  const clearLogs = async () => {
    setClearing(true);
    await fetch("/api/dev/logs", { method: "DELETE" });
    setLogs([]);
    setClearing(false);
  };

  const svcBadge = (svc: string): React.CSSProperties => ({
    display: "inline-block", padding: "1px 6px", borderRadius: "3px",
    fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0,
    background: svc === "GCAL" ? "#1e3a5f" : "#1a3a1a",
    color: svc === "GCAL" ? "#60a5fa" : "#4ade80",
  });

  return (
    <div style={{
      position: "fixed", bottom: BAR_H, left: 0, right: 0, zIndex: 9998,
      background: "rgba(8,12,22,0.98)", borderTop: "1px solid #1e293b",
      maxHeight: "45vh", display: "flex", flexDirection: "column", fontFamily: FF,
    }}>
      <div style={{ display: "flex", alignItems: "center", padding: "5px 10px", borderBottom: "1px solid #1e293b", flexShrink: 0, gap: "8px" }}>
        <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Notifications {logs.length > 0 && `(${logs.length})`}
        </span>
        <span style={{ fontSize: "9px", color: "#334155" }}>auto-refreshes every 3s</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "5px" }}>
          <button onClick={clearLogs} disabled={clearing}
            style={{ fontSize: "10px", color: "#f87171", background: "none", border: "1px solid #4b1515", borderRadius: "4px", padding: "2px 7px", cursor: "pointer", fontFamily: FF }}>
            Clear
          </button>
          <button onClick={onClose}
            style={{ fontSize: "10px", color: "#64748b", background: "none", border: "1px solid #1e293b", borderRadius: "4px", padding: "2px 7px", cursor: "pointer", fontFamily: FF }}>
            ✕
          </button>
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {logs.length === 0 ? (
          <div style={{ padding: "14px 10px", color: "#334155", fontSize: "11px" }}>
            No intercepted calls yet. Perform a signup or cancel to see GCal/Gmail output.
          </div>
        ) : logs.map((entry) => (
          <div key={entry.id} style={{ borderBottom: "1px solid #0f172a" }}>
            <div onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
              style={{ display: "flex", alignItems: "flex-start", padding: "5px 10px", cursor: "pointer", gap: "6px" }}>
              <span style={svcBadge(entry.service)}>{entry.service}</span>
              <span style={{ fontSize: "9px", color: "#475569", flexShrink: 0, marginTop: "1px" }}>
                {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span style={{ fontSize: "11px", color: "#94a3b8", flex: 1, lineHeight: 1.4 }}>{entry.summary}</span>
              <span style={{ fontSize: "9px", color: "#334155" }}>{expanded === entry.id ? "▲" : "▼"}</span>
            </div>
            {expanded === entry.id && entry.detail && (
              <div style={{ padding: "0 10px 8px" }}>
                {entry.service === "GMAIL" ? (
                  <iframe srcDoc={entry.detail}
                    style={{ width: "100%", height: "280px", border: "1px solid #1e293b", borderRadius: "6px", background: "#fff" }}
                    title="Email preview" sandbox="allow-same-origin" />
                ) : (
                  <pre style={{ margin: 0, fontSize: "10px", color: "#64748b", whiteSpace: "pre-wrap", lineHeight: 1.6, background: "#0a0f1e", padding: "8px", borderRadius: "6px", border: "1px solid #1e293b" }}>
                    {entry.detail}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DevToolbar ─────────────────────────────────────────────────────────────

function DevViewportBar() {
  const [mounted, setMounted]       = useState(false);
  const [viewport, setViewport]     = useState<typeof PRESETS[number] | null>(null);
  const [iframePath, setIframePath] = useState("/");
  const [signingIn, setSigningIn]   = useState<string | null>(null);
  const [openDd, setOpenDd]         = useState<DropdownId>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [resetting, setResetting]   = useState(false);
  const [resetMsg, setResetMsg]     = useState<string | null>(null);
  const [logCount, setLogCount]     = useState(0);
  const { data: session, status }   = useSession();
  const router                      = useRouter();
  const barRef                      = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    document.body.style.paddingBottom = `${BAR_H}px`;
    return () => { document.body.style.paddingBottom = ""; };
  }, [mounted]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenDd(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Poll log count for badge
  useEffect(() => {
    if (!mounted) return;
    const poll = async () => {
      const res = await fetch("/api/dev/logs").catch(() => null);
      if (res?.ok) { const d = await res.json(); setLogCount(d.length); }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [mounted]);

  if (!mounted || process.env.NODE_ENV !== "development") return null;

  const currentEmail = session?.user?.email ?? "";
  const currentRole  = session?.user?.role  ?? "NONE";
  const isDevSession = currentEmail.endsWith("@dev.local");
  const activeBtn    = ALL_BUTTONS.find((b) => b.email === currentEmail);
  const pages        = PAGES_BY_ROLE[currentRole] ?? PAGES_BY_ROLE.NONE;
  const currentPath  = typeof window !== "undefined" ? window.location.pathname : "/";

  const navigate = (path: string) => {
    setOpenDd(null);
    if (viewport) { setIframePath(path); } else { router.push(path); }
  };

  const handleRoleSelect = async (btn: typeof ALL_BUTTONS[number]) => {
    setOpenDd(null);
    setViewport(null);
    setSigningIn(btn.email);
    const startPath = btn.role === "CLINIC" ? "/dashboard/clinic" : "/dashboard/browse";
    await signIn("dev", { email: btn.email, role: btn.role, redirect: false });
    window.location.href = startPath;
  };

  const handleSignOut = async () => {
    setOpenDd(null);
    setViewport(null);
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  const handleReset = async () => {
    if (!confirm("Wipe dev database and restore test seed? All current dev data will be lost.")) return;
    setResetting(true);
    setResetMsg(null);
    const res = await fetch("/api/dev/seed", { method: "POST" });
    setResetting(false);
    if (res.ok) {
      setResetMsg("✓ Done");
      setTimeout(() => { setResetMsg(null); window.location.href = "/dashboard/browse"; }, 1200);
    } else {
      setResetMsg("✗ Failed");
      setTimeout(() => setResetMsg(null), 3000);
    }
  };

  const toggleDd = (id: DropdownId) => setOpenDd(openDd === id ? null : id);

  // Label for the role dropdown button
  const roleLabel = signingIn
    ? "…"
    : isDevSession && activeBtn
    ? activeBtn.label
    : status === "authenticated"
    ? currentRole
    : "Sign in";

  const roleColor = activeBtn?.color ?? "#64748b";

  return (
    <>
      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}

      {viewport && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "#090e1a", display: "flex", flexDirection: "column",
          paddingBottom: BAR_H,
        }}>
          <ScaledIframe preset={viewport} path={iframePath} />
        </div>
      )}

      {/* ── Single-row toolbar ── */}
      <div ref={barRef} style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        height: BAR_H,
        background: "rgba(10,14,26,0.97)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid #1e293b",
        display: "flex", alignItems: "center",
        padding: "0 8px", gap: "4px",
        fontFamily: FF,
      }}>

        {/* GMI label */}
        <span style={{ fontSize: "9px", fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: "2px", flexShrink: 0 }}>
          GMI dev
        </span>

        <div style={dividerStyle} />

        {/* ── Role dropdown ── */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => toggleDd("role")}
            disabled={signingIn !== null}
            style={{ ...tbBtn(openDd === "role" || isDevSession, roleColor), gap: "5px" }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isDevSession ? roleColor : "#334155", flexShrink: 0 }} />
            {roleLabel}
            <span style={{ fontSize: "8px", opacity: 0.6 }}>▾</span>
          </button>

          {openDd === "role" && (
            <Dropdown style={{ minWidth: "160px" }}>
              <DropSectionLabel>Staff</DropSectionLabel>
              {ROLE_BUTTONS.map((btn) => (
                <DropItem key={btn.email} label={btn.label} color={btn.color}
                  active={currentEmail === btn.email && isDevSession}
                  onClick={() => handleRoleSelect(btn)} />
              ))}
              <div style={{ height: "1px", background: "#1e293b", margin: "4px 0" }} />
              <DropSectionLabel>Volunteers</DropSectionLabel>
              {VOLUNTEER_BUTTONS.map((btn) => (
                <DropItem key={btn.email} label={btn.label} color={btn.color}
                  active={currentEmail === btn.email && isDevSession}
                  onClick={() => handleRoleSelect(btn)} />
              ))}
              {status === "authenticated" && (
                <>
                  <div style={{ height: "1px", background: "#1e293b", margin: "4px 0" }} />
                  <DropItem label="Sign out" color="#f87171" onClick={handleSignOut} />
                </>
              )}
            </Dropdown>
          )}
        </div>

        <div style={dividerStyle} />

        {/* ── Pages dropdown ── */}
        <div style={{ position: "relative" }}>
          <button onClick={() => toggleDd("pages")} style={tbBtn(openDd === "pages")}>
            Pages <span style={{ fontSize: "8px", opacity: 0.6 }}>▾</span>
          </button>
          {openDd === "pages" && (
            <Dropdown style={{ minWidth: "150px" }}>
              {pages.map(({ label, path }) => (
                <DropItem key={path} label={label}
                  active={(viewport ? iframePath : currentPath) === path}
                  onClick={() => navigate(path)} />
              ))}
            </Dropdown>
          )}
        </div>

        {/* ── View dropdown ── */}
        <div style={{ position: "relative" }}>
          <button onClick={() => toggleDd("view")} style={tbBtn(openDd === "view" || !!viewport, "#60a5fa")}>
            {viewport ? viewport.label : "View"} <span style={{ fontSize: "8px", opacity: 0.6 }}>▾</span>
          </button>
          {openDd === "view" && (
            <Dropdown style={{ minWidth: "130px" }}>
              {viewport && (
                <DropItem label="✕ Exit preview" color="#f87171" onClick={() => { setViewport(null); setOpenDd(null); }} />
              )}
              {viewport && <div style={{ height: "1px", background: "#1e293b", margin: "4px 0" }} />}
              {PRESETS.map((p) => (
                <DropItem key={p.label} label={p.label} sub={`${p.w}×${p.h}`}
                  active={viewport?.label === p.label}
                  onClick={() => { setViewport(p); setIframePath(iframePath || "/"); setOpenDd(null); }} />
              ))}
            </Dropdown>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Notifs ── */}
        <button
          onClick={() => { setShowNotifs(!showNotifs); setOpenDd(null); }}
          style={{ ...tbBtn(showNotifs, "#a78bfa"), position: "relative" }}
        >
          Notifs
          {logCount > 0 && (
            <span style={{
              background: "#a78bfa", color: "#fff",
              fontSize: "8px", fontWeight: 700, borderRadius: "999px",
              padding: "0 3px", minWidth: "13px", lineHeight: "13px",
              textAlign: "center", display: "inline-block", marginLeft: "2px",
            }}>{logCount > 99 ? "99+" : logCount}</span>
          )}
        </button>

        {/* ── Reset DB ── */}
        <button onClick={handleReset} disabled={resetting}
          style={{ ...tbBtn(false, "#f97316"), opacity: resetting ? 0.5 : 1 }}>
          {resetting ? "…" : resetMsg ?? "Reset DB"}
        </button>

      </div>
    </>
  );
}

// ── Providers ──────────────────────────────────────────────────────────────

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <DevViewportBar />
    </SessionProvider>
  );
}
