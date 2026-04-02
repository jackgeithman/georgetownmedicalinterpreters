"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RejectedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      // If they somehow got approved or are still pending, redirect away
      if (session.user.status === "ACTIVE") {
        router.push("/dashboard");
        return;
      }
      if (session.user.status === "PENDING_APPROVAL") {
        router.push("/pending");
        return;
      }
    }
  }, [status, session, router]);

  const handleSend = async () => {
    if (!message.trim()) {
      setError("Please write a message before sending.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page-bg)" }}>
        <p style={{ color: "#111827" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* Header */}
      <div style={{ width: "100%", background: "#0D1F3C", padding: "20px 32px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fff", letterSpacing: "-0.01em" }}>
          Georgetown Medical Interpreters
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: "520px", padding: "0 20px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Status card */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", padding: "32px 28px", boxShadow: "0 1px 4px rgba(0,0,0,.04)", textAlign: "center" }}>
          <div style={{ width: "52px", height: "52px", background: "#FEF2F2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "1.3rem" }}>
            ✕
          </div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
            Your account request was not approved
          </h1>
          <p style={{ fontSize: "0.9rem", color: "#111827", lineHeight: 1.6, maxWidth: "360px", margin: "0 auto" }}>
            We were unable to approve your access to Georgetown Medical Interpreters at this time.
            If you think this is a mistake, you can reach out below.
          </p>
        </div>

        {/* Contact form */}
        <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1.5px solid var(--card-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px 14px", borderBottom: "1.5px solid #F3F4F6" }}>
            <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Contact Us</h2>
          </div>
          <div style={{ padding: "20px" }}>
            {sent ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ width: "40px", height: "40px", background: "#DCFCE7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "1.1rem" }}>✓</div>
                <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>Message sent</p>
                <p style={{ fontSize: "0.82rem", color: "#111827" }}>
                  We&apos;ll review your appeal and be in touch at <strong>{session?.user?.email}</strong>.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: "0.82rem", color: "#111827", marginBottom: "14px", lineHeight: 1.5 }}>
                  Explain your situation and we&apos;ll review it. You can send one message per 24 hours.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Explain why you should have access to GMI…"
                  maxLength={1000}
                  rows={5}
                  style={{ width: "100%", padding: "10px 13px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", fontFamily: "'DM Sans', sans-serif", color: "#111827", outline: "none", background: "#fff", boxSizing: "border-box", resize: "vertical" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "0.72rem", color: "#111827" }}>{message.length}/1000</span>
                </div>
                {error && (
                  <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "0.82rem", color: "#DC2626" }}>
                    {error}
                  </div>
                )}
                <button
                  onClick={handleSend}
                  disabled={submitting}
                  style={{ width: "100%", padding: "11px", background: submitting ? "#D1D5DB" : "#0D1F3C", color: "#fff", border: "none", borderRadius: "9px", fontSize: "0.9rem", fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: submitting ? "not-allowed" : "pointer" }}
                >
                  {submitting ? "Sending…" : "Send message"}
                </button>
              </>
            )}
          </div>
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
