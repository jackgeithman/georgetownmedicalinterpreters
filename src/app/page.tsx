"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  DomainNotAllowed: "Only Georgetown (@georgetown.edu) accounts are permitted. If you need access, contact your coordinator.",
  OAuthAccountNotLinked: "An account with this email already exists. Use your original sign-in method.",
  Default: "Something went wrong. Please try again.",
};

const CAROUSEL_IMAGES = [
  { src: "/gmi-spanish-class-2.jpg", alt: "Spanish interpreting class" },
  { src: "/gmi-spanish-class-1.jpg", alt: "Spanish interpreting class" },
  { src: "/gmi-board-meeting.jpg", alt: "GMI board meeting" },
];

function Carousel() {
  const [current, setCurrent] = useState(0);

  const prev = useCallback(() =>
    setCurrent((c) => (c - 1 + CAROUSEL_IMAGES.length) % CAROUSEL_IMAGES.length), []);
  const next = useCallback(() =>
    setCurrent((c) => (c + 1) % CAROUSEL_IMAGES.length), []);

  useEffect(() => {
    const id = setInterval(next, 5000);
    return () => clearInterval(id);
  }, [next]);

  return (
    <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", width: "100%" }}>
      <div style={{ position: "relative", paddingTop: "56%", background: "#1a1a1a" }}>
        {CAROUSEL_IMAGES.map((img, i) => (
          <img
            key={i}
            src={img.src}
            alt={img.alt}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover",
              opacity: i === current ? 1 : 0,
              transition: "opacity 0.6s ease",
            }}
          />
        ))}
      </div>
      <button onClick={prev} aria-label="Previous" style={{
        position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
        background: "rgba(0,0,0,.45)", border: "none", borderRadius: "50%",
        width: "36px", height: "36px", color: "#fff", fontSize: "18px",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>‹</button>
      <button onClick={next} aria-label="Next" style={{
        position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
        background: "rgba(0,0,0,.45)", border: "none", borderRadius: "50%",
        width: "36px", height: "36px", color: "#fff", fontSize: "18px",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>›</button>
      <div style={{ position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "7px" }}>
        {CAROUSEL_IMAGES.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} aria-label={`Slide ${i + 1}`} style={{
            width: i === current ? "22px" : "7px", height: "7px",
            borderRadius: "4px", border: "none",
            background: i === current ? "#fff" : "rgba(255,255,255,.55)",
            cursor: "pointer", padding: 0, transition: "all 0.3s ease",
          }} />
        ))}
      </div>
    </div>
  );
}

function SignInCard() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error") ?? "";

  return (
    <div style={{
      background: "var(--card-bg)", border: "1.5px solid var(--card-border)",
      borderRadius: "16px", padding: "28px",
      boxShadow: "0 4px 20px rgba(0,0,0,.08)",
    }}>
      {errorKey && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", fontSize: "0.875rem", color: "#DC2626" }}>
          {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.Default}
        </div>
      )}

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
          width: "100%", padding: "15px 20px",
          background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
          border: "none", borderRadius: "12px",
          fontFamily: "inherit", fontSize: "1.2rem", fontWeight: 700,
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
        Volunteer Login Here!
      </button>

      <div style={{ height: "1px", background: "var(--card-border)", margin: "24px 0" }} />

      <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0D1F3C", marginBottom: "10px" }}>Are You a Clinic?</p>
      <p style={{ color: "#111827", lineHeight: 1.6, marginBottom: "16px", fontSize: "0.95rem" }}>
        Simply let us know when you need volunteers and which languages are required, and we will send our trained interpreters to your clinic.
      </p>
      <a
        href="mailto:georgetownmedicalinterpreters@gmail.com"
        style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          background: "var(--green)", color: "#fff", padding: "12px 20px",
          borderRadius: "10px", fontWeight: 600, fontSize: "1rem", textDecoration: "none",
        }}
      >
        Contact Us →
      </a>

      <p style={{ textAlign: "center", marginTop: "16px", fontSize: "0.78rem", color: "#111827", lineHeight: 1.7 }}>
        By signing in you agree to our{" "}
        <a href="/terms" style={{ color: "var(--blue)", textDecoration: "none" }}>Terms of Service</a>
        {" "}and{" "}
        <a href="/privacy" style={{ color: "var(--blue)", textDecoration: "none" }}>Privacy Policy</a>.
      </p>
    </div>
  );
}

function LandingContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Don't auto-redirect dev sessions — they navigate themselves via the toolbar.
    if (status === "authenticated" && !session?.user?.email?.endsWith("@dev.local")) {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Navbar */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--navy)", height: "68px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "44px", height: "44px", borderRadius: "10px", flexShrink: 0 }} />
          <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
        </div>
      </nav>

      {/* Hero — two columns on desktop, stacked on mobile */}
      <section className="landing-hero">

        {/* Left: what we do */}
        <div className="landing-hero-left">
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#0D1F3C", marginBottom: "16px", lineHeight: 1.25, letterSpacing: "-0.02em" }}>
            Connecting bilingual volunteers with patients who need language support
          </h1>
          <p style={{ fontSize: "1.05rem", color: "#111827", lineHeight: 1.65 }}>
            Founded in 2026, Georgetown Medical Interpreters partners with clinics across the DMV area to provide
            free medical interpretation services by trained Georgetown students. We currently offer interpretation
            services in Spanish, Mandarin and Korean.
          </p>
        </div>

        {/* Right: sign-in card */}
        <div className="landing-hero-right">
          <Suspense>
            <SignInCard />
          </Suspense>
        </div>
      </section>

      {/* Full-width carousel */}
      <section style={{ padding: "0 32px 48px", maxWidth: "1100px", margin: "0 auto" }}>
        <Carousel />
      </section>

      {/* How It Works */}
      <section style={{ padding: "48px 32px", maxWidth: "720px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "#0D1F3C", marginBottom: "36px" }}>How It Works</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {[
            { n: "1", title: "We train interpreters", desc: "Bilingual Georgetown students complete our training program to become medical interpreters." },
            { n: "2", title: "Clinics contact us", desc: "Partner clinics reach out to let us know when they need volunteers and for which languages." },
            { n: "3", title: "Patients get language support", desc: "Volunteers arrive at the clinic and provide real-time interpretation so patients can communicate with their care team." },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--blue)", color: "#fff", fontWeight: 700, fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0D1F3C", marginBottom: "6px" }}>{title}</div>
                <div style={{ color: "#111827", fontSize: "1rem", lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section style={{ padding: "48px 32px", maxWidth: "960px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0D1F3C", marginBottom: "32px", textAlign: "center" }}>
          Get Involved
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
          {/* Volunteer card */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", padding: "28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0D1F3C", margin: 0 }}>Want to Volunteer?</h3>
            <p style={{ fontSize: "0.97rem", color: "#111827", lineHeight: 1.6, margin: 0 }}>
              We welcome bilingual Georgetown students who want to make a difference in their community. Join our training program and start interpreting at partner clinics across the DMV area.
            </p>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--blue)", color: "#fff", padding: "12px 22px", borderRadius: "10px", fontWeight: 700, fontSize: "1rem", textDecoration: "none", marginTop: "auto" }}
            >
              Contact Us →
            </a>
          </div>
          {/* Clinic card */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", padding: "28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0D1F3C", margin: 0 }}>Are You a Clinic?</h3>
            <p style={{ fontSize: "0.97rem", color: "#111827", lineHeight: 1.6, margin: 0 }}>
              Simply let us know when you need interpreters and which languages are required. We will coordinate and send trained volunteers directly to your clinic at no cost.
            </p>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--green)", color: "#fff", padding: "12px 22px", borderRadius: "10px", fontWeight: 700, fontSize: "1rem", textDecoration: "none", marginTop: "auto" }}
            >
              Contact Us →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1.5px solid var(--card-border)", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginTop: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "28px", height: "28px", borderRadius: "6px" }} />
          <span style={{ color: "#111827", fontSize: "0.9rem" }}>Georgetown Medical Interpreters 2026</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {[{ label: "Terms", href: "/terms" }, { label: "Privacy", href: "/privacy" }, { label: "Contact", href: "mailto:georgetownmedicalinterpreters@gmail.com" }].map(({ label, href }) => (
            <a key={label} href={href} style={{ color: "var(--blue)", fontSize: "0.9rem", textDecoration: "none" }}>{label}</a>
          ))}
          <a
            href="https://www.instagram.com/gumedicalinterpreters/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            style={{ display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
                  <stop offset="0%" stopColor="#fdf497"/>
                  <stop offset="5%" stopColor="#fdf497"/>
                  <stop offset="45%" stopColor="#fd5949"/>
                  <stop offset="60%" stopColor="#d6249f"/>
                  <stop offset="90%" stopColor="#285AEB"/>
                </radialGradient>
              </defs>
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#ig-grad)"/>
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="none"/>
              <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8"/>
              <circle cx="17.5" cy="6.5" r="1.2" fill="#fff"/>
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
