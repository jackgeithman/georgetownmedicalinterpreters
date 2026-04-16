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
    { label: "Browse", path: "/dashboard/browse" },
    { label: "Signups", path: "/dashboard/signups" },
    { label: "Profile", path: "/dashboard/profile" },
    { label: "Training", path: "/dashboard/training" },
    { label: "Messages", path: "/dashboard/messages" },
  ],
  INSTRUCTOR: [
    { label: "Home", path: "/" },
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

const BAR_HEIGHT = 56;

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
        boxShadow: "0 0 0 1px #334155, 0 24px 64px rgba(0,0,0,.7)",
        borderRadius: "10px", overflow: "hidden",
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
    await signIn("dev", { role, redirect: false });
    // Use a hard navigation instead of router.refresh() + router.push().
    // router.refresh() was causing a render loop: it fights with router.push()
    // mid-navigation, creating 60+ /api/auth/session calls that ended in
    // a redirect to /login. A full reload cleanly picks up the new JWT cookie.
    window.location.href = startPath;
  };

  const handleSignOut = async () => {
    setActive(null);
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  const roleColor = DEV_ROLES.find(r => r.role === currentRole)?.color ?? "#64748b";

  const pill = (color: string, isActive = false): React.CSSProperties => ({
    background: isActive ? color + "22" : "transparent",
    border: `1px solid ${isActive ? color + "88" : "#2d3748"}`,
    color: isActive ? color : "#94a3b8",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: isActive ? 600 : 400,
    cursor: "pointer",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    whiteSpace: "nowrap" as const,
    letterSpacing: "0.01em",
    transition: "all 0.1s ease",
  });

  const divider: React.CSSProperties = {
    width: "1px", height: "14px", background: "#2d3748",
    flexShrink: 0, margin: "0 4px",
  };

  const label: React.CSSProperties = {
    color: "#475569", fontSize: "9px", fontWeight: 600,
    letterSpacing: "0.08em", textTransform: "uppercase" as const,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    flexShrink: 0,
  };

  return (
    <>
      {/* Iframe overlay */}
      {active && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "#090e1a", display: "flex", flexDirection: "column",
          paddingBottom: BAR_HEIGHT,
        }}>
          <ScaledIframe preset={active} barHeight={BAR_HEIGHT} path={iframePath} />
        </div>
      )}

      {/* Dev toolbar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        height: BAR_HEIGHT,
        background: "rgba(10, 14, 26, 0.97)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid #1e293b",
        display: "flex", flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

        {/* Row 1: Role + Viewport */}
        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "5px 12px 3px", flex: "0 0 auto",
        }}>

          {/* Role section */}
          <span style={label}>Role</span>

          {status === "authenticated" ? (
            <span style={{
              background: roleColor + "18",
              border: `1px solid ${roleColor}55`,
              color: roleColor,
              padding: "1px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 600,
              letterSpacing: "0.02em",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}>
              {currentRole}{isDevSession ? " (dev)" : ""}
            </span>
          ) : (
            <span style={{ color: "#475569", fontSize: "10px" }}>
              {status === "loading" ? "…" : "signed out"}
            </span>
          )}

          {DEV_ROLES.map(({ label: lbl, role, color }) => (
            <button key={role} onClick={() => handleRoleSelect(role)}
              disabled={signingIn !== null}
              style={{ ...pill(color, currentRole === role && isDevSession), opacity: signingIn === role ? 0.4 : 1 }}>
              {signingIn === role ? "…" : lbl}
            </button>
          ))}

          {status === "authenticated" && (
            <button onClick={handleSignOut}
              style={pill("#f87171")}>
              Sign out
            </button>
          )}

          <div style={divider} />
          <span style={label}>View</span>

          {PRESETS.map((p) => (
            <button key={p.label}
              onClick={() => setActive(active?.label === p.label ? null : p)}
              style={pill("#60a5fa", active?.label === p.label)}>
              {p.label}
            </button>
          ))}

          {active && (
            <button onClick={() => setActive(null)}
              style={{ ...pill("#f87171"), marginLeft: "2px" }}>
              ✕ Exit
            </button>
          )}

          <span style={{
            marginLeft: "auto", fontSize: "10px", color: "#334155",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            letterSpacing: "0.02em",
          }}>
            {active ? `${active.w}×${active.h}` : "dev"}
          </span>
        </div>

        {/* Row 2: Pages */}
        <div style={{
          display: "flex", alignItems: "center", gap: "3px",
          padding: "2px 12px 4px", overflowX: "auto",
          scrollbarWidth: "none",
        }}>
          <span style={{ ...label, marginRight: "2px" }}>Pages</span>
          {pages.map(({ label: lbl, path }) => {
            const currentPath = active ? iframePath : (typeof window !== "undefined" ? window.location.pathname : "/");
            const isActive = currentPath === path;
            return (
              <button key={path} onClick={() => navigate(path)}
                style={pill("#94a3b8", isActive)}>
                {lbl}
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
