"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useRef } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [showClearanceRibbon, setShowClearanceRibbon] = useState(false);
  const [ribbonEventIds, setRibbonEventIds] = useState<string[]>([]);
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    if (status === "unauthenticated") {
      redirected.current = true;
      router.push("/login");
      return;
    }
    if (status === "authenticated" && session) {
      if (!session.user.onboardingComplete) {
        redirected.current = true;
        router.push("/onboarding");
        return;
      }
      if (session.user.status === "PENDING_APPROVAL") {
        redirected.current = true;
        router.push("/pending");
        return;
      }
    }
  }, [status, session, router]);

  // Load clearance ribbon for volunteers
  useEffect(() => {
    const role = session?.user?.role;
    if (role === "VOLUNTEER" || role === "ADMIN" || role === "INSTRUCTOR") {
      fetch("/api/volunteer/lang-clearance-events")
        .then((r) => r.json())
        .then((events: { id: string }[]) => {
          if (events.length > 0) {
            const dismissed: string[] = JSON.parse(localStorage.getItem("gmi_dismissed_clearance") ?? "[]");
            const unseen = events.filter((e) => !dismissed.includes(e.id));
            if (unseen.length > 0) {
              setShowClearanceRibbon(true);
              setRibbonEventIds(unseen.map((e) => e.id));
            }
          }
        })
        .catch(() => {});
    }
  }, [session]);

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  const role = session?.user?.role;
  const roles = session?.user?.roles ?? [];
  const isDev = roles.includes("DEV");
  const isAdmin = role === "ADMIN";
  const isInstructor = role === "INSTRUCTOR";

  // Define tabs
  const allTabs = [
    { path: "/dashboard/browse", label: "Browse Slots", show: true },
    { path: "/dashboard/signups", label: "My Signups", show: true },
    { path: "/dashboard/profile", label: "Profile", show: true },
    { path: "/dashboard/users", label: "All Users", show: isInstructor || isAdmin || isDev },
    { path: "/dashboard/training", label: "Training", show: true },
    { path: "/dashboard/messages", label: "Messages", show: true },
    { path: "/dashboard/metrics", label: "Metrics", show: isInstructor || isAdmin || isDev },
    { path: "/dashboard/clinics", label: "Clinics", show: isAdmin || isDev },
    { path: "/dashboard/languages", label: "Languages", show: isAdmin || isDev },
    { path: "/dashboard/activity", label: "Activity Log", show: isAdmin || isDev },
    { path: "/dashboard/notes", label: "Notes", show: isAdmin || isDev },
    { path: "/dashboard/access", label: "Access Control", show: isDev },
  ].filter((t) => t.show);

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--gray-900)" }}>
      {/* Header — hidden for clinic sessions which render their own */}
      {role !== "CLINIC" && <header style={{ background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0 }} />
          <div>
            <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
            <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>
              {isAdmin || isDev ? "Admin Dashboard" : isInstructor ? "Instructor Dashboard" : "Volunteer Dashboard"}
            </div>
          </div>
          <Link
            href="/dashboard/messages"
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer", textDecoration: "none" }}
          >
            Contact Us
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ color: "#CBD5E1", fontSize: "0.82rem" }}>{session?.user?.email}</span>
          {role && (
            <span style={{ fontSize: "0.72rem", padding: "2px 10px", borderRadius: "99px", background: "rgba(59,130,246,.2)", color: "#bfdbfe", fontWeight: 600 }}>
              {role}
            </span>
          )}
          {isDev && (
            <span style={{ fontSize: "0.72rem", padding: "2px 10px", borderRadius: "99px", background: "rgba(167,139,250,.2)", color: "#ddd6fe", fontWeight: 600 }}>
              Developer
            </span>
          )}
          <button
            onClick={() => void signOut({ callbackUrl: "/login" })}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </header>}

      {/* Clearance ribbon */}
      {showClearanceRibbon && (
        <div style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "9px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "#1D4ED8" }}>
            Your language clearance status has been updated —{" "}
            <Link
              href="/dashboard/profile"
              style={{ fontWeight: 700, textDecoration: "underline", color: "#1D4ED8" }}
            >
              see your Profile
            </Link>
            {" "}for details.
          </span>
          <button
            onClick={() => {
              const dismissed: string[] = JSON.parse(localStorage.getItem("gmi_dismissed_clearance") ?? "[]");
              localStorage.setItem("gmi_dismissed_clearance", JSON.stringify([...dismissed, ...ribbonEventIds]));
              setShowClearanceRibbon(false);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#1D4ED8", opacity: 0.6, fontSize: "1.1rem", lineHeight: 1, flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}
          >×</button>
        </div>
      )}

      {/* Tab ribbon — hidden for clinic sessions */}
      {role !== "CLINIC" && <div style={{ background: "var(--card-bg)", borderBottom: "1.5px solid var(--card-border)", padding: "0 32px" }}>
        <div style={{ display: "flex", gap: "2px", maxWidth: "1100px", margin: "0 auto", overflowX: "auto" }}>
          {allTabs.map((tab) => {
            const isActive = pathname === tab.path || pathname?.startsWith(tab.path + "/");
            return (
              <Link
                key={tab.path}
                href={tab.path}
                style={{
                  display: "inline-block",
                  padding: "14px 18px",
                  fontSize: "0.875rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--blue)" : "#111827",
                  textDecoration: "none",
                  borderBottom: isActive ? "2.5px solid var(--blue)" : "2.5px solid transparent",
                  whiteSpace: "nowrap",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "color 0.1s, border-color 0.1s",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>}

      {/* Page content */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "36px 32px" }}>
        {children}
      </div>
    </div>
  );
}
