"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role) {
      const role = session.user.role;
      if (role === "ADMIN" || role === "SUPER_ADMIN") router.push("/dashboard/admin");
      else if (role === "CLINIC") router.push("/dashboard/clinic");
      else if (role === "VOLUNTEER") router.push("/dashboard/volunteer");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-500 text-lg">Loading...</p>
      </div>
    );
  }

  if (session?.user?.status === "PENDING_APPROVAL") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-200 max-w-md text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-amber-600 text-xl">⏳</span>
          </div>
          <h2 className="text-xl font-semibold text-stone-800 mb-2">Pending Approval</h2>
          <p className="text-stone-500 mb-6">Your account is awaiting admin approval. You&apos;ll receive an email when approved.</p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-stone-400 hover:text-stone-600 underline"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return null;
}
