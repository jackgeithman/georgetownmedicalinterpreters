"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

export default function ClinicLoginPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/clinic-access/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.name) setClinicName(data.name);
        else setNotFound(true);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      token,
      pin,
      redirect: false,
    });
    setLoading(false);
    if (result?.ok) {
      router.push("/dashboard");
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-600 font-medium">Link not found</p>
          <p className="text-gray-400 text-sm mt-1">
            This login link is invalid or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-black tracking-tight">
            Georgetown Medical Interpreters
          </h1>
          {clinicName ? (
            <p className="text-sm text-gray-400 mt-1">{clinicName}</p>
          ) : (
            <p className="text-sm text-gray-300 mt-1">Loading...</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Clinic Sign In
          </p>
          <p className="text-sm text-gray-400 mb-4">Enter your 8-digit PIN to continue.</p>

          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type={pinVisible ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]{8}"
                maxLength={8}
                placeholder="8-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                disabled={!clinicName || loading}
                className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A90D9] tracking-widest text-center disabled:bg-gray-50"
              />
              <button
                type="button"
                onClick={() => setPinVisible(!pinVisible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {pinVisible ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            <button
              type="submit"
              disabled={pin.length !== 8 || loading || !clinicName}
              className="w-full px-4 py-2.5 bg-[#4A90D9] hover:bg-[#357ABD] text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
