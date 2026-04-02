"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LANGUAGE_MAP } from "@/lib/languages";

const ROLE_LABELS: Record<string, string> = {
  VOLUNTEER_PENDING: "Volunteer",
  INSTRUCTOR_PENDING: "Instructor",
  ADMIN_PENDING: "Admin",
};

export default function PendingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      if (!session.user.onboardingComplete) {
        router.push("/onboarding");
        return;
      }
      if (session.user.status === "ACTIVE") {
        router.push("/dashboard");
        return;
      }
      if (session.user.status === "SUSPENDED") {
        router.push("/login?error=Suspended");
        return;
      }
    }
  }, [status, session, router]);

  if (status === "loading" || !session) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "#111827" }}>Loading…</p>
      </div>
    );
  }

  const roles = (session.user.roles ?? []).filter((r) => r.endsWith("_PENDING"));
  const langs = (session.user.roles ?? [])
    .filter((r) => r.startsWith("LANG_") && !r.includes("_CLEARED") && !r.includes("_DENIED"))
    .map((r) => r.replace("LANG_", ""));

  const email = session.user.email ?? "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* Header */}
      <div style={{ width: "100%", background: "#0D1F3C", padding: "20px 32px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fff", letterSpacing: "-0.01em" }}>
          Georgetown Medical Interpreters
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: "560px", padding: "0 20px" }}>

        {/* Status card */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)", marginBottom: "24px" }}>
          <div style={{ padding: "32px 28px 24px", textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", background: "#FEF3C7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "1.4rem" }}>
              ⏳
            </div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
              Your account is under review
            </h1>
            <p style={{ fontSize: "0.9rem", color: "#111827", lineHeight: 1.6, maxWidth: "380px", margin: "0 auto" }}>
              An admin will review your request shortly. You&apos;ll receive an email at <strong>{email}</strong> when your access has been cleared.
            </p>
          </div>

          {/* Pending roles */}
          {roles.length > 0 && (
            <div style={{ padding: "20px 28px", borderTop: "1.5px solid #F3F4F6" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", marginBottom: "12px" }}>
                Roles pending approval
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {roles.map((r) => (
                  <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "99px", fontSize: "0.78rem", fontWeight: 600, background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                    {ROLE_LABELS[r] ?? r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pending languages */}
          {langs.length > 0 && (
            <div style={{ padding: "20px 28px", borderTop: "1.5px solid #F3F4F6" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#111827", marginBottom: "12px" }}>
                Languages pending clearance
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {langs.map((code) => (
                  <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "99px", fontSize: "0.78rem", fontWeight: 600, background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                    {LANGUAGE_MAP[code] ?? code}
                    <span style={{ fontSize: "0.68rem", opacity: 0.75 }}>· Pending</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ background: "none", border: "none", fontSize: "0.82rem", color: "#111827", cursor: "pointer", textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}
          >
            Sign out
          </button>
        </div>

      </div>
    </div>
  );
}
