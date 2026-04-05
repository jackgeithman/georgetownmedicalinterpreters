"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [showClearanceRibbon, setShowClearanceRibbon] = useState(false);
  const [ribbonEventIds, setRibbonEventIds] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const folderRef = useRef<HTMLDivElement>(null);
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
          if (Array.isArray(events) && events.length > 0) {
            setShowClearanceRibbon(true);
            setRibbonEventIds(events.map((e) => e.id));
          }
        })
        .catch(() => {});
    }
    if (role === "ADMIN" || role === "INSTRUCTOR") {
      fetch("/api/admin/users")
        .then((r) => {
          if (!r.ok) { console.warn("[GMI] /api/admin/users returned", r.status); return []; }
          return r.json();
        })
        .then((data: { status: string; roles: string[] }[]) => {
          const count = Array.isArray(data) ? data.filter((u) =>
            u.status === "PENDING_APPROVAL" ||
            (u.roles ?? []).some((r) => r.startsWith("LANG_") && !r.endsWith("_CLEARED") && !r.endsWith("_DENIED"))
          ).length : 0;
          setPendingCount(count);
        })
        .catch((e) => console.error("[GMI] users fetch error:", e));
    }
    if (role === "ADMIN") {
      fetch("/api/suggestions")
        .then((r) => {
          if (!r.ok) { console.warn("[GMI] /api/suggestions returned", r.status); return []; }
          return r.json();
        })
        .then((data: { status: string }[]) => {
          const count = Array.isArray(data) ? data.filter((s) => s.status === "OPEN").length : 0;
          setUnreadMessages(count);
        })
        .catch((e) => console.error("[GMI] suggestions fetch error:", e));
    }
  }, [session, pathname]);

  // Close folder dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setOpenFolder(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  // Flat tabs for non-admin roles
  const volunteerTabs = [
    { path: "/dashboard/browse", label: "Browse Slots" },
    { path: "/dashboard/signups", label: "My Signups" },
    { path: "/dashboard/profile", label: "Profile" },
    { path: "/dashboard/training", label: "Training" },
    { path: "/dashboard/messages", label: "Messages" },
  ];

  const tabActive = (path: string) => pathname === path || pathname?.startsWith(path + "/");

  const tabStyle = (path: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: "5px",
    padding: "14px 18px", fontSize: "0.875rem",
    fontWeight: tabActive(path) ? 600 : 500,
    color: tabActive(path) ? "var(--blue)" : "#111827",
    textDecoration: "none",
    borderBottom: tabActive(path) ? "2.5px solid var(--blue)" : "2.5px solid transparent",
    whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif",
    transition: "color 0.1s, border-color 0.1s",
  });

  const adminFolders = [
    {
      id: "volunteering", label: "Volunteering", badge: 0,
      items: [
        { path: "/dashboard/browse", label: "Browse Slots" },
        { path: "/dashboard/signups", label: "My Signups" },
        { path: "/dashboard/profile", label: "My Profile" },
        { path: "/dashboard/training", label: "Training" },
      ],
    },
    {
      id: "administration", label: "Administration", badge: pendingCount + unreadMessages,
      items: [
        { path: "/dashboard/users", label: "All Users", badge: pendingCount },
        { path: "/dashboard/metrics", label: "Metrics" },
        { path: "/dashboard/activity", label: "Activity Log" },
        { path: "/dashboard/messages", label: "Messages", badge: unreadMessages },
        { path: "/dashboard/notes", label: "Notes" },
        ...(isDev ? [{ path: "/dashboard/access", label: "Access Control" }] : []),
      ],
    },
    {
      id: "lang-clinics", label: "Languages & Clinics", badge: 0,
      items: [
        { path: "/dashboard/languages", label: "Languages" },
        { path: "/dashboard/clinics", label: "Clinics" },
      ],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--gray-900)" }}>
      {/* Header — hidden for clinic sessions which render their own */}
      {role !== "CLINIC" && <header className="dash-header" style={{ background: "var(--navy)", height: "64px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0 }} />
          <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
          <Link
            href="/dashboard/messages"
            className="dash-header-contact"
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 500, padding: "7px 16px", borderRadius: "8px", cursor: "pointer", textDecoration: "none" }}
          >
            Contact Us
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span className="dash-header-email" style={{ color: "#CBD5E1", fontSize: "0.82rem" }}>{session?.user?.email}</span>
          {role && (
            <span className="dash-header-rolebadge" style={{ fontSize: "0.72rem", padding: "2px 10px", borderRadius: "99px", background: "rgba(59,130,246,.2)", color: "#bfdbfe", fontWeight: 600 }}>
              {role}
            </span>
          )}
          {isDev && (
            <span className="dash-header-devbadge" style={{ fontSize: "0.72rem", padding: "2px 10px", borderRadius: "99px", background: "rgba(167,139,250,.2)", color: "#ddd6fe", fontWeight: 600 }}>
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
              setShowClearanceRibbon(false);
              fetch("/api/volunteer/lang-clearance-events", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: ribbonEventIds }),
              }).catch(() => {});
            }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#1D4ED8", opacity: 0.6, fontSize: "1.1rem", lineHeight: 1, flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}
          >×</button>
        </div>
      )}

      {/* Tab ribbon — hidden for clinic sessions */}
      {role !== "CLINIC" && <div style={{ background: "var(--card-bg)", borderBottom: "1.5px solid var(--card-border)", padding: "0 32px" }}>
        <div ref={folderRef} className="tab-ribbon-scroll" style={{ display: "flex", gap: "2px", maxWidth: "1100px", margin: "0 auto", alignItems: "stretch" }}>
          {(isAdmin || isDev) ? (
            <>
              {/* Folder tabs only — Browse Slots and All Users live inside folders */}
              {adminFolders.map((folder) => {
                const folderActive = folder.items.some((item) => tabActive(item.path));
                const isOpen = openFolder === folder.id;
                return (
                  <div key={folder.id} style={{ position: "relative", display: "flex", alignItems: "stretch" }}>
                    <button
                      onClick={() => setOpenFolder(isOpen ? null : folder.id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        padding: "14px 18px", fontSize: "0.875rem",
                        fontWeight: folderActive || isOpen ? 600 : 500,
                        color: folderActive || isOpen ? "var(--blue)" : "#111827",
                        background: "none", border: "none",
                        borderBottom: folderActive || isOpen ? "2.5px solid var(--blue)" : "2.5px solid transparent",
                        whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif",
                        cursor: "pointer", transition: "color 0.1s, border-color 0.1s",
                      }}
                    >
                      {folder.label}
                      {!isOpen && folder.badge > 0 && (
                        <span style={{ background: "#EF4444", color: "#fff", fontSize: "0.65rem", fontWeight: 700, minWidth: "18px", height: "18px", borderRadius: "99px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                          {folder.badge}
                        </span>
                      )}
                      <span style={{ fontSize: "0.6rem", opacity: 0.5, marginLeft: "1px" }}>{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && (
                      <div style={{ position: "absolute", top: "calc(100% + 1px)", left: 0, background: "var(--card-bg)", borderRadius: "8px", padding: "4px", zIndex: 200, minWidth: "180px", boxShadow: "0 4px 20px rgba(0,0,0,.14)" }}>
                        {folder.items.map((item) => (
                          <Link
                            key={item.path}
                            href={item.path}
                            onClick={() => setOpenFolder(null)}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "9px 14px", fontSize: "0.875rem",
                              fontWeight: tabActive(item.path) ? 600 : 400,
                              color: tabActive(item.path) ? "var(--blue)" : "#111827",
                              textDecoration: "none", borderRadius: "7px",
                              background: tabActive(item.path) ? "#EFF6FF" : "transparent",
                              fontFamily: "'DM Sans', sans-serif", gap: "8px",
                            }}
                          >
                            {item.label}
                            {"badge" in item && (item as { badge: number }).badge > 0 && (
                              <span style={{ background: "#EF4444", color: "#fff", fontSize: "0.6rem", fontWeight: 700, minWidth: "17px", height: "17px", borderRadius: "99px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0 }}>
                                {(item as { badge: number }).badge}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            // Flat ribbon for volunteers / instructors
            (isInstructor
              ? [
                  { path: "/dashboard/browse", label: "Browse Slots" },
                  { path: "/dashboard/signups", label: "My Signups" },
                  { path: "/dashboard/profile", label: "Profile" },
                  { path: "/dashboard/users", label: "All Users" },
                  { path: "/dashboard/training", label: "Training" },
                  { path: "/dashboard/messages", label: "Messages" },
                ]
              : volunteerTabs
            ).map((tab) => (
              <Link key={tab.path} href={tab.path} style={tabStyle(tab.path)}>{tab.label}</Link>
            ))
          )}
        </div>
      </div>}

      {/* Page content — clinic manages its own layout */}
      {role === "CLINIC" ? children : (
        <div className="dash-content" style={{ maxWidth: "1100px", margin: "0 auto", padding: "36px 32px" }}>
          {children}
        </div>
      )}
    </div>
  );
}
