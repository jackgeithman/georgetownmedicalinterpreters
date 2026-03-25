"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  DomainNotAllowed: "Sign-in not allowed. Please contact your coordinator.",
  OAuthAccountNotLinked: "An account with this email already exists. Use your original sign-in method.",
  Default: "Something went wrong. Please try again.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error") ?? "";

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-stone-800 tracking-tight">
            Georgetown Medical Interpreters
          </h1>
          <p className="text-sm text-stone-400 mt-1">GMI Volunteer Platform</p>
        </div>

        {errorKey && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.Default}
          </div>
        )}

        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Volunteers</p>
          <p className="text-sm text-stone-400 mb-4">Sign in with your Google account.</p>
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
          <p className="text-xs text-stone-400 mt-3 text-center">
            Clinic staff: use your unique clinic login link.
          </p>
        </div>
      </div>
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
