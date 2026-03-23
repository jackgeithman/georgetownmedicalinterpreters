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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-stone-600 font-medium">Link not found</p>
          <p className="text-stone-400 text-sm mt-1">
            This login link is invalid or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-stone-800 tracking-tight">
            Georgetown Medical Interpreters
          </h1>
          {clinicName ? (
            <p className="text-sm text-stone-400 mt-1">{clinicName}</p>
          ) : (
            <p className="text-sm text-stone-300 mt-1">Loading...</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
            Clinic Sign In
          </p>
          <p className="text-sm text-stone-400 mb-4">Enter your 6-digit PIN to continue.</p>

          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              disabled={!clinicName || loading}
              className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tracking-widest text-center disabled:bg-stone-50"
            />
            <button
              type="submit"
              disabled={pin.length !== 6 || loading || !clinicName}
              className="w-full px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
