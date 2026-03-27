import Link from "next/link";
import ContactForm from "./_components/ContactForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold tracking-tight">Georgetown Medical Interpreters</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="mailto:georgetownmedicalinterpreters@gmail.com"
            className="text-blue-200 hover:text-white text-sm transition-colors"
          >
            Contact Us
          </a>
          <Link
            href="/login"
            className="px-4 py-2 text-sm bg-white text-blue-900 hover:bg-blue-50 rounded-lg font-medium transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-800/60 border border-blue-700/50 text-blue-200 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Georgetown University · Student-Run Organization
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight leading-tight mb-6">
            Medical Interpretation<br />
            <span className="text-blue-300">for Everyone</span>
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed mb-10 max-w-lg mx-auto">
            We connect trained student volunteers with community clinics to provide free medical interpretation services in multiple languages.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/login"
              className="px-6 py-3 bg-white text-blue-900 hover:bg-blue-50 rounded-lg font-medium text-sm transition-colors shadow-lg"
            >
              Volunteer Portal →
            </Link>
            <a
              href="#contact"
              className="px-6 py-3 bg-blue-800/60 border border-blue-700/50 text-white hover:bg-blue-700/60 rounded-lg font-medium text-sm transition-colors"
            >
              Partner with Us
            </a>
          </div>
        </div>
      </main>

      {/* Stats */}
      <section className="border-t border-blue-800/50 py-10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-8 text-center">
          {[
            { value: "500+", label: "Interpretation Hours" },
            { value: "10+", label: "Partner Clinics" },
            { value: "5+", label: "Languages Supported" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              <p className="text-blue-300 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-blue-800/50 py-16">
        <div className="max-w-lg mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Get in Touch</h2>
            <p className="text-blue-200 text-sm">
              Partner clinic, student, or just curious? Leave us a message.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-blue-800/50 py-6 px-6 text-center">
        <p className="text-blue-400 text-xs">
          © {new Date().getFullYear()} Georgetown Medical Interpreters ·{" "}
          <a href="mailto:georgetownmedicalinterpreters@gmail.com" className="hover:text-blue-300 transition-colors">
            georgetownmedicalinterpreters@gmail.com
          </a>
        </p>
      </footer>
    </div>
  );
}
