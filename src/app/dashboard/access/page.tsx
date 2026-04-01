"use client";

import { useEffect, useState, useCallback } from "react";

type EmailRule = { id: string; email: string; type: "ALLOW" | "BLOCK"; note: string | null };
type FeatureFlag = { id: string; key: string; label: string; description: string | null; enabled: boolean };

export default function AccessPage() {
  const [emailRules, setEmailRules] = useState<EmailRule[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [ruleEmail, setRuleEmail] = useState("");
  const [ruleType, setRuleType] = useState<"ALLOW" | "BLOCK">("ALLOW");
  const [ruleNote, setRuleNote] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailStatus, setTestEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const fetchData = useCallback(async () => {
    const [rulesRes, flagsRes] = await Promise.all([
      fetch("/api/admin/email-rules"),
      fetch("/api/admin/feature-flags"),
    ]);
    if (rulesRes.ok) setEmailRules(await rulesRes.json());
    if (flagsRes.ok) setFeatureFlags(await flagsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const addEmailRule = async () => {
    if (!ruleEmail.trim()) return;
    setActionLoading("email-rule");
    const res = await fetch("/api/admin/email-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ruleEmail.trim(), type: ruleType, note: ruleNote.trim() || null }),
    });
    if (res.ok) {
      const rule = await res.json();
      setEmailRules((prev) => [rule, ...prev.filter((r) => r.email !== (rule as EmailRule).email)]);
      setRuleEmail(""); setRuleNote("");
    }
    setActionLoading(null);
  };

  const removeEmailRule = async (id: string) => {
    setActionLoading(`rule-${id}`);
    const res = await fetch(`/api/admin/email-rules/${id}`, { method: "DELETE" });
    if (res.ok) setEmailRules((prev) => prev.filter((r) => r.id !== id));
    setActionLoading(null);
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    const res = await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFeatureFlags((prev) => prev.map((f) => (f.key === key ? (updated as FeatureFlag) : f)));
    }
  };

  const sendTestEmail = async () => {
    if (!testEmailTo.trim()) return;
    setTestEmailStatus("sending");
    const res = await fetch("/api/admin/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testEmailTo.trim() }),
    });
    if (res.ok) {
      setTestEmailStatus("sent");
      setTimeout(() => setTestEmailStatus("idle"), 3000);
    } else {
      setTestEmailStatus("error");
      setTimeout(() => setTestEmailStatus("idle"), 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: "var(--gray-400)", fontFamily: "'DM Sans', sans-serif" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: "16px" }}>Access Control</h1>

        {/* Email Rules */}
        <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "4px" }}>Add Email Rule</h3>
            <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>
              <strong>Allow</strong> lets a non-Georgetown email sign in. <strong>Block</strong> prevents any email from signing in.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input
                type="email"
                placeholder="user@example.com"
                value={ruleEmail}
                onChange={(e) => setRuleEmail(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "#111827", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                {(["ALLOW", "BLOCK"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRuleType(t)}
                    style={{ flex: 1, padding: "9px", fontSize: "0.875rem", borderRadius: "9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, border: "1.5px solid", background: ruleType === t ? (t === "ALLOW" ? "#15803D" : "#DC2626") : "none", color: ruleType === t ? "#fff" : "#111827", borderColor: ruleType === t ? (t === "ALLOW" ? "#15803D" : "#DC2626") : "var(--card-border)" }}
                  >
                    {t === "ALLOW" ? "Allow" : "Block"}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Note (optional)"
                value={ruleNote}
                onChange={(e) => setRuleNote(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "#111827", outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
              />
              <button
                disabled={!ruleEmail.trim() || actionLoading === "email-rule"}
                onClick={() => void addEmailRule()}
                style={{ width: "100%", padding: "9px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (!ruleEmail.trim() || actionLoading === "email-rule") ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
              >
                {actionLoading === "email-rule" ? "Saving..." : "Add Rule"}
              </button>
            </div>
          </div>

          {emailRules.length > 0 ? (
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
              {emailRules.map((rule, idx) => (
                <div key={rule.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", gap: "12px", borderBottom: idx < emailRules.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <span style={{ flexShrink: 0, fontSize: "0.72rem", padding: "2px 8px", borderRadius: "99px", fontWeight: 600, background: rule.type === "ALLOW" ? "#DCFCE7" : "#FEF2F2", color: rule.type === "ALLOW" ? "#15803D" : "#DC2626" }}>
                      {rule.type}
                    </span>
                    <span style={{ fontSize: "0.875rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.email}</span>
                    {rule.note && <span style={{ fontSize: "0.75rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.note}</span>}
                  </div>
                  <button
                    disabled={actionLoading === `rule-${rule.id}`}
                    onClick={() => void removeEmailRule(rule.id)}
                    style={{ flexShrink: 0, fontSize: "0.75rem", padding: "4px 12px", background: "var(--gray-200)", color: "#111827", border: "none", borderRadius: "8px", cursor: "pointer", opacity: actionLoading === `rule-${rule.id}` ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "32px", textAlign: "center" }}>
              <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>No rules yet. All Georgetown emails can sign in by default.</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>Feature Flags</h2>
        <div style={{ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ fontSize: "0.75rem", color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", padding: "8px 16px" }}>
            Disabled features are hidden from all non-admin users.
          </p>
          {featureFlags.length === 0 ? (
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "32px", textAlign: "center" }}>
              <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>No feature flags configured.</p>
            </div>
          ) : (
            <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", overflow: "hidden" }}>
              {featureFlags.map((flag, idx) => (
                <div key={flag.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", gap: "16px", borderBottom: idx < featureFlags.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827" }}>{flag.label}</p>
                    <p style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "var(--gray-400)" }}>{flag.key}</p>
                    {flag.description && <p style={{ fontSize: "0.75rem", color: "#111827", marginTop: "2px" }}>{flag.description}</p>}
                  </div>
                  <button
                    role="switch"
                    aria-checked={flag.enabled}
                    onClick={() => void toggleFlag(flag.key, !flag.enabled)}
                    style={{ position: "relative", display: "inline-flex", height: "20px", width: "36px", flexShrink: 0, borderRadius: "99px", border: "2px solid transparent", background: flag.enabled ? "var(--blue)" : "var(--gray-200)", cursor: "pointer", outline: "none" }}
                  >
                    <span style={{ display: "inline-block", height: "16px", width: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transform: flag.enabled ? "translateX(16px)" : "translateX(0)", transition: "transform 0.15s" }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1.5px solid var(--card-border)", padding: "24px" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "4px" }}>Test Email</h3>
            <p style={{ fontSize: "0.75rem", color: "#111827", marginBottom: "16px" }}>Send a test email to verify email delivery is working.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="email"
                placeholder="recipient@example.com"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                style={{ flex: 1, padding: "9px 12px", fontSize: "0.875rem", border: "1.5px solid var(--card-border)", borderRadius: "9px", background: "var(--card-bg)", color: "#111827", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
              />
              <button
                disabled={!testEmailTo.trim() || testEmailStatus === "sending"}
                onClick={() => void sendTestEmail()}
                style={{ padding: "9px 22px", fontSize: "0.875rem", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "99px", cursor: "pointer", fontWeight: 600, opacity: (!testEmailTo.trim() || testEmailStatus === "sending") ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}
              >
                {testEmailStatus === "sending" ? "Sending..." : "Send Test Email"}
              </button>
            </div>
            {testEmailStatus === "sent" && <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "#16A34A" }}>Test email sent!</p>}
            {testEmailStatus === "error" && <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "#EF4444" }}>Failed to send test email.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
