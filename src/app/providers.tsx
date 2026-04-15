"use client";

import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Constants ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Mobile", w: 375, h: 812 },
  { label: "iPhone SE", w: 320, h: 568 },
  { label: "Tablet", w: 768, h: 1024 },
  { label: "Desktop", w: 1280, h: 800 },
];

const DEV_ROLES = [
  { label: "Admin", role: "ADMIN", color: "#8b5cf6" },
  { label: "Volunteer", role: "VOLUNTEER", color: "#3b82f6" },
  { label: "Instructor", role: "INSTRUCTOR", color: "#10b981" },
  { label: "Clinic", role: "CLINIC", color: "#f59e0b" },
];

const PAGES_BY_ROLE: Record<string, { label: string; path: string }[]> = {
  ADMIN: [
    { label: "Home", path: "/" },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Browse", path: "/dashboard/browse" },
    { label: "Signups", path: "/dashboard/signups" },
    { label: "Users", path: "/dashboard/users" },
    { label: "Metrics", path: "/dashboard/metrics" },
    { label: "Activity", path: "/dashboard/activity" },
    { label: "Notes", path: "/dashboard/notes" },
    { label: "Languages", path: "/dashboard/languages" },
    { label: "Clinics", path: "/dashboard/clinics" },
    { label: "Messages", path: "/dashboard/messages" },
    { label: "Training", path: "/dashboard/training" },
    { label: "Profile", path: "/dashboard/profile" },
    { label: "Access", path: "/dashboard/access" },
  ],
  VOLUNTEER: [
    { label: "Home", path: "/" },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Browse", path: "/dashboard/browse" },
    { label: "Signups", path: "/dashboard/signups" },
    { label: "Profile", path: "/dashboard/profile" },
    { label: "Training", path: "/dashboard/training" },
    { label: "Messages", path: "/dashboard/messages" },
  ],
  INSTRUCTOR: [
    { label: "Home", path: "/" },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Browse", path: "/dashboard/browse" },
    { label: "Signups", path: "/dashboard/signups" },
    { label: "Users", path: "/dashboard/users" },
    { label: "Training", path: "/dashboard/training" },
    { label: "Messages", path: "/dashboard/messages" },
    { label: "Profile", path: "/dashboard/profile" },
  ],
  CLINIC: [
    { label: "Home", path: "/" },
    { label: "Clinic Dashboard", path: "/dashboard/clinic" },
  ],
  NONE: [
    { label: "Home", path: "/" },
    { label: "Onboarding", path: "/onboarding" },
    { label: "Pending", path: "/pending" },
    { label: "Terms", path: "/terms" },
    { label: "Privacy", path: "/privacy" },
  ],
};

const BAR_HEIGHT = 60;

// ── ScaledIframe ───────────────────────────────────────────────────────────

function ScaledIframe({ preset, barHeight, path }: {
  preset: typeof PRESETS[number];
  barHeight: number;
  path: string;
}) {
  const availW = window.innerWidth;
  const availH = window.innerHeight - barHeight - 44;
  const scale = Math.min(1, availW / preset.w, availH / preset.h);

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "flex-start",
      justifyContent: "center", paddingTop: "22px",
    }}>
      <div style={{
        transformOrigin: "top center",
        transform: `scale(${scale})`,
        width: preset.w, height: preset.h, flexShrink: 0,
        boxShadow: "0 0 0 2px #334155, 0 20px 60px rgba(0,0,0,.6)",
        borderRadius: "8px", overflow: "hidden",
      }}>
        <iframe
          key={`${preset.label}-${path}`}
          src={path}
          style={{ width: preset.w, height: preset.h, border: "none", display: "block" }}
          title={`${preset.label} preview`}
        />
      </div>
    </div>
  );
}

// ── DevViewportBar ─────────────────────────────────────────────────────────

function DevViewportBar() {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<typeof PRESETS[number] | null>(null);
  const [iframePath, setIframePath] = useState("/");
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    document.body.style.paddingBottom = `${BAR_HEIGHT}px`;
    return () => { document.body.style.paddingBottom = ""; };
  }, [mounted]);

  if (!mounted || process.env.NODE_ENV !== "development") return null;

  const currentRole = session?.user?.role ?? "NONE";
  const isDevSession = !!(session?.user?.email?.endsWith("@dev.local"));
  const pages = PAGES_BY_ROLE[currentRole] ?? PAGES_BY_ROLE.NONE;

  const navigate = (path: string) => {
    if (active) {
      setIframePath(path);
    } else {
      router.push(path);
    }
  };

  const handleRoleSelect = async (role: string) => {
    setActive(null);
    setSigningIn(role);
    const startPath = role === "CLINIC" ? "/dashboard/clinic" : "/dashboard/browse";
    const result = await signIn("dev", { role, redirect: false });
    if (result?.ok || result === undefined || result === null) {
      // router.refresh() invalidates the Next.js server-component cache so the
      // new JWT cookie is picked up, then push to the destination.
      router.refresh();
      router.push(startPath);
    }
    setSigningIn(null);
  };

  const handleSignOut = async () => {
    setActive(null);
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  const roleColor = DEV_ROLES.find(r => r.role === currentRole)?.color ?? "#64748b";

  // Shared button style helper
  const btn = (bg: string, active_ = false): React.CSSProperties => ({
    background: active_ ? bg : "#334155",
    border: active_ ? `1px solid ${bg}` : "1px solid transparent",
    color: "#e2e8f0", padding: "2px 8px", borderRadius: "4px",
    fontSize: "11px", cursor: "pointer", fontFamily: "monospace",
    whiteSpace: "nowrap" as const,
  });

  return (
    <>
      {/* Iframe overlay */}
      {active && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "#0f172a", display: "flex", flexDirection: "column",
          paddingBottom: BAR_HEIGHT,
        }}>
          <ScaledIframe preset={active} barHeight={BAR_HEIGHT} path={iframePath} />
        </div>
      )}

      {/* Dev toolbar — two rows */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        height: BAR_HEIGHT, background: "#0f172a",
        borderTop: "1px solid #1e293b",
        display: "flex", flexDirection: "column",
        fontFamily: "monospace",
      }}>

        {/* Row 1: Role selector + viewport presets */}
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "4px 10px", borderBottom: "1px solid #1e293b", flex: "0 0 auto",
        }}>
          <span style={{ color: "#475569", fontSize: "10px", marginRight: "2px" }}>ROLE</span>

          {/* Current role badge */}
          {status === "authenticated" ? (
            <span style={{
              background: roleColor + "33", border: `1px solid ${roleColor}66`,
              color: roleColor, padding: "1px 7px", borderRadius: "4px", fontSize: "10px",
            }}>
              {currentRole}{isDevSession ? " (dev)" : ""}
            </span>
          ) : (
            <span style={{ color: "#475569", fontSize: "10px" }}>
              {status === "loading" ? "loading…" : "not signed in"}
            </span>
          )}

          {/* Role switcher buttons */}
          {DEV_ROLES.map(({ label, role, color }) => (
            <button key={role} onClick={() => handleRoleSelect(role)}
              disabled={signingIn !== null}
              style={{ ...btn(color, currentRole === role && isDevSession), opacity: signingIn === role ? 0.5 : 1 }}>
              {signingIn === role ? "…" : label}
            </button>
          ))}

          {status === "authenticated" && (
            <button onClick={handleSignOut} style={{ ...btn("#ef4444"), marginLeft: "2px" }}>
              Sign out
            </button>
          )}

          {/* Separator */}
          <span style={{ color: "#1e293b", marginLeft: "4px", marginRight: "4px" }}>│</span>
          <span style={{ color: "#475569", fontSize: "10px" }}>VIEW</span>

          {/* Viewport presets */}
          {PRESETS.map((p) => (
            <button key={p.label}
              onClick={() => setActive(active?.label === p.label ? null : p)}
              style={btn("#3b82f6", active?.label === p.label)}>
              {p.label}
            </button>
          ))}

          {active && (
            <button onClick={() => setActive(null)} style={{ ...btn("#ef4444"), marginLeft: "2px" }}>
              ✕ Exit
            </button>
          )}

          <span style={{ color: "#334155", fontSize: "10px", marginLeft: "auto" }}>
            {active ? `${active.w}×${active.h} · scaled to fit` : "dev mode"}
          </span>
        </div>

        {/* Row 2: Page navigation */}
        <div style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: "3px 10px", overflowX: "auto",
          scrollbarWidth: "none",
        }}>
          <span style={{ color: "#475569", fontSize: "10px", marginRight: "2px", flexShrink: 0 }}>PAGES</span>
          {pages.map(({ label, path }) => {
            const currentPath = active ? iframePath : (typeof window !== "undefined" ? window.location.pathname : "/");
            const isActive = currentPath === path;
            return (
              <button key={path} onClick={() => navigate(path)}
                style={btn("#64748b", isActive)}>
                {label}
              </button>
            );
          })}
        </div>
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
