"use client";
import { useState } from "react";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async () => {
    if (!form.name.trim() || !form.message.trim()) return;
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setStatus("sent");
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-3">✓</div>
        <p className="text-white font-medium">Message sent!</p>
        <p className="text-blue-200 text-sm mt-1">We&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Your name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full px-4 py-3 rounded-lg bg-blue-900/60 border border-blue-700/50 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="email"
          placeholder="Email (optional)"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-blue-900/60 border border-blue-700/50 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
        />
        <input
          type="tel"
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-blue-900/60 border border-blue-700/50 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
        />
      </div>
      <textarea
        placeholder="Your message *"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        rows={4}
        className="w-full px-4 py-3 rounded-lg bg-blue-900/60 border border-blue-700/50 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm resize-none"
      />
      {status === "error" && (
        <p className="text-red-300 text-sm">{errorMsg}</p>
      )}
      <button
        disabled={status === "sending" || !form.name.trim() || !form.message.trim()}
        onClick={submit}
        className="w-full py-3 bg-white text-blue-900 hover:bg-blue-50 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Send Message"}
      </button>
    </div>
  );
}
