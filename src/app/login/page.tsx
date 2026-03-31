"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  DomainNotAllowed: "Sign-in not allowed. Please contact your coordinator.",
  OAuthAccountNotLinked: "An account with this email already exists. Use your original sign-in method.",
  Default: "Something went wrong. Please try again.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error") ?? "";

  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [clinicError, setClinicError] = useState("");
  const [clinicLoading, setClinicLoading] = useState(false);

  const handleClinicSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setClinicError("");
    setClinicLoading(true);

    const lookupRes = await fetch("/api/clinic-pin-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (!lookupRes.ok) {
      setClinicError("Invalid PIN. Please check your PIN and try again.");
      setPin("");
      setClinicLoading(false);
      return;
    }

    const { token } = await lookupRes.json();

    const result = await signIn("credentials", { token, pin, redirect: false });
    setClinicLoading(false);

    if (result?.ok) {
      window.location.href = "/dashboard";
    } else {
      setClinicError("Sign in failed. Please try again.");
      setPin("");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>

      {/* Brand */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="GMI" style={{ width: "48px", height: "48px", borderRadius: "11px", margin: "0 auto 12px", display: "block" }} />
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#000", letterSpacing: "-0.02em" }}>Georgetown Medical Interpreters</h1>
      </div>

      {/* Card */}
      <div style={{
        background: "var(--card-bg)", border: "1.5px solid var(--card-border)",
        borderRadius: "16px", padding: "28px", width: "100%", maxWidth: "400px",
        boxShadow: "0 4px 20px rgba(0,0,0,.08)",
      }}>
        {errorKey && (
          <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", fontSize: "0.875rem", color: "#DC2626" }}>
            {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.Default}
          </div>
        )}

        {/* Google sign-in */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
            width: "100%", padding: "15px 20px",
            background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
            border: "none", borderRadius: "12px",
            fontFamily: "inherit", fontSize: "1.05rem", fontWeight: 600,
            color: "#fff", cursor: "pointer",
            boxShadow: "0 4px 14px rgba(37,99,235,.35)",
            transition: "box-shadow .15s, transform .1s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(37,99,235,.45)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(37,99,235,.35)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
        >
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
              <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"/>
              <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
              <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
            </svg>
          </div>
          Volunteer &amp; Admin Login
        </button>

        {/* Separator */}
        <div style={{ height: "1px", background: "var(--card-border)", margin: "20px 0" }} />

        {/* Clinic PIN */}
        {clinicError && (
          <div style={{ marginBottom: "12px", padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", fontSize: "0.875rem", color: "#DC2626" }}>
            {clinicError}
          </div>
        )}

        <form onSubmit={handleClinicSignIn} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "1rem", fontWeight: 700, color: "#000" }}>Clinic PIN</label>
            <div style={{ position: "relative" }}>
              <input
                type={pinVisible ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]{6,8}"
                maxLength={8}
                placeholder="# # # # # # # # #"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                disabled={clinicLoading}
                autoFocus={false}
                style={{
                  width: "100%", padding: "11px 44px 11px 14px",
                  border: "1.5px solid var(--card-border)", borderRadius: "10px",
                  fontFamily: "inherit", fontSize: "1.05rem", color: "#000",
                  background: "#fff", outline: "none", boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setPinVisible(!pinVisible)}
                tabIndex={-1}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", display: "flex", alignItems: "center", padding: 0 }}
              >
                {pinVisible ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={pin.length < 6 || clinicLoading}
            style={{
              width: "100%", padding: "13px", border: "none", borderRadius: "10px",
              background: "var(--blue)", color: "#fff", fontFamily: "inherit",
              fontSize: "1.05rem", fontWeight: 600, cursor: "pointer",
              opacity: pin.length < 6 || clinicLoading ? 0.5 : 1,
              transition: "all .18s",
            }}
          >
            {clinicLoading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>

      {/* Footer — outside card */}
      <p style={{ textAlign: "center", marginTop: "20px", fontSize: "0.8rem", color: "var(--gray-600)", lineHeight: 1.7 }}>
        By signing in you agree to our{" "}
        <a href="/terms" style={{ color: "var(--blue)", textDecoration: "none" }}>Terms of Service</a>
        {" "}and{" "}
        <a href="/privacy" style={{ color: "var(--blue)", textDecoration: "none" }}>Privacy Policy</a>.
        <br />
        Questions?{" "}
        <a href="mailto:georgetownmedicalinterpreters@gmail.com" style={{ color: "var(--blue)", textDecoration: "none" }}>Contact Us</a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
