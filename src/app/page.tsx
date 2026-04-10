"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const CAROUSEL_IMAGES = [
  { src: "/stock1.jpg", alt: "Medical team at nursing station" },
  { src: "/stock2.webp", alt: "Medical interpretation in clinic" },
  { src: "https://picsum.photos/seed/clinic1/1200/600", alt: "Clinic volunteers" },
  { src: "https://picsum.photos/seed/medical2/1200/600", alt: "Patient care" },
  { src: "https://picsum.photos/seed/hospital3/1200/600", alt: "Healthcare team" },
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
    <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", width: "100%", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ position: "relative", paddingTop: "52%", background: "#1a1a1a" }}>
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

      {/* Arrows */}
      <button onClick={prev} aria-label="Previous" style={{
        position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)",
        background: "rgba(0,0,0,.45)", border: "none", borderRadius: "50%",
        width: "40px", height: "40px", color: "#fff", fontSize: "18px",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>‹</button>
      <button onClick={next} aria-label="Next" style={{
        position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)",
        background: "rgba(0,0,0,.45)", border: "none", borderRadius: "50%",
        width: "40px", height: "40px", color: "#fff", fontSize: "18px",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>›</button>

      {/* Dots */}
      <div style={{ position: "absolute", bottom: "14px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "8px" }}>
        {CAROUSEL_IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: i === current ? "24px" : "8px", height: "8px",
              borderRadius: "4px", border: "none",
              background: i === current ? "#fff" : "rgba(255,255,255,.55)",
              cursor: "pointer", padding: 0,
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Navbar */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--navy)", height: "64px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0 }} />
          <div>
            <div style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Georgetown Medical Interpreters</div>
            <div style={{ color: "#94A3B8", fontSize: "0.72rem" }}>Volunteer Platform</div>
          </div>
        </div>
        <Link href="/login" style={{
          background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
          color: "#fff", padding: "7px 16px", borderRadius: "8px",
          fontWeight: 500, fontSize: "0.8rem", textDecoration: "none",
        }}>
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ padding: "56px 24px 48px", textAlign: "center" }}>
        <p style={{ fontSize: "1.25rem", color: "#111827", maxWidth: "640px", margin: "0 auto 36px", lineHeight: 1.6, fontWeight: 500 }}>
          Georgetown Medical Interpreters connects bilingual volunteers with patients
          who need language support at local clinics across the DMV area.
        </p>
        <Carousel />
      </section>

      {/* How It Works */}
      <section style={{ padding: "48px 24px", maxWidth: "680px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "#0D1F3C", marginBottom: "36px" }}>
          How It Works
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {[
            {
              n: "1",
              title: "We train interpreters",
              desc: "Bilingual Georgetown students complete our training program to become medical interpreters.",
            },
            {
              n: "2",
              title: "Clinics request support",
              desc: "Partner clinics submit interpretation requests and our volunteers sign up for shifts.",
            },
            {
              n: "3",
              title: "Patients get language support",
              desc: "Volunteers arrive at the clinic and provide real-time interpretation so patients can communicate with their care team.",
            },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
              <div style={{
                width: "44px", height: "44px", borderRadius: "50%", background: "var(--blue)",
                color: "#fff", fontWeight: 700, fontSize: "1.1rem",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>{n}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0D1F3C", marginBottom: "6px" }}>{title}</div>
                <div style={{ color: "#111827", fontSize: "1rem", lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Second photo */}
        <div style={{ marginTop: "40px", borderRadius: "16px", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/stock2.webp" alt="Medical interpretation session" style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: "400px" }} />
        </div>
      </section>

      {/* Get Involved */}
      <section style={{ padding: "48px 24px", maxWidth: "960px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "#0D1F3C", marginBottom: "32px", textAlign: "center" }}>
          Get Involved
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          {/* Volunteer card */}
          <div style={{
            background: "var(--card-bg)", border: "1.5px solid var(--card-border)",
            borderRadius: "16px", padding: "28px",
            display: "flex", flexDirection: "column",
          }}>
            <h3 style={{ fontWeight: 700, fontSize: "1.25rem", color: "#0D1F3C", marginBottom: "12px" }}>
              Want to Volunteer?
            </h3>
            <p style={{ color: "#111827", lineHeight: 1.6, marginBottom: "24px", fontSize: "1rem", flex: 1 }}>
              We welcome bilingual Georgetown students to serve as medical interpreters.
              No prior medical experience required. We provide full training.
            </p>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", alignSelf: "flex-start",
                background: "var(--blue)", color: "#fff",
                padding: "12px 20px", borderRadius: "10px",
                fontWeight: 600, fontSize: "1rem", textDecoration: "none",
              }}
            >
              Contact Us →
            </a>
          </div>

          {/* Clinic card */}
          <div style={{
            background: "var(--card-bg)", border: "1.5px solid var(--card-border)",
            borderRadius: "16px", padding: "28px",
            display: "flex", flexDirection: "column",
          }}>
            <h3 style={{ fontWeight: 700, fontSize: "1.25rem", color: "#0D1F3C", marginBottom: "12px" }}>
              Are You a Clinic?
            </h3>
            <p style={{ color: "#111827", lineHeight: 1.6, marginBottom: "24px", fontSize: "1rem", flex: 1 }}>
              We partner with clinics in the DC area to provide interpretation services to
              your patients at no cost to you or them.
            </p>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", alignSelf: "flex-start",
                background: "var(--green)", color: "#fff",
                padding: "12px 20px", borderRadius: "10px",
                fontWeight: 600, fontSize: "1rem", textDecoration: "none",
              }}
            >
              Contact Us →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1.5px solid var(--card-border)",
        padding: "24px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "12px",
        marginTop: "32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="GMI" style={{ width: "28px", height: "28px", borderRadius: "6px" }} />
          <span style={{ color: "#111827", fontSize: "0.9rem" }}>Georgetown Medical Interpreters 2026</span>
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          {[
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
            { label: "Contact", href: "mailto:georgetownmedicalinterpreters@gmail.com" },
          ].map(({ label, href }) => (
            <a key={label} href={href} style={{ color: "var(--blue)", fontSize: "0.9rem", textDecoration: "none" }}>
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
