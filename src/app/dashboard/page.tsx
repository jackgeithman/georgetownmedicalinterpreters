"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Defer redirect to allow session to hydrate on client-side navigation.
  useEffect(() => {
    if (status !== "unauthenticated") return;
    const t = setTimeout(() => router.push("/login"), 1500);
    return () => clearTimeout(t);
  }, [status, router]);

  useEffect(() => {
    if (!session?.user) return;
    const { role, status, onboardingComplete } = session.user;

    // Account was deleted mid-session — force sign out so they start fresh
    if (status === "DELETED") {
      void signOut({ callbackUrl: "/login" });
      return;
    }

    if (!onboardingComplete) {
      router.push("/onboarding");
      return;
    }
    if (status === "PENDING_APPROVAL") {
      router.push("/pending");
      return;
    }
    if (status === "SUSPENDED") {
      // If they went through onboarding and got rejected, show rejection page
      if (onboardingComplete) router.push("/rejected");
      else router.push("/login?error=Suspended");
      return;
    }
    if (role === "ADMIN" || role === "INSTRUCTOR" || role === "VOLUNTEER") router.push("/dashboard/browse");
    else if (role === "CLINIC") router.push("/dashboard/clinic");
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p style={{ color: "#111827" }} className="text-lg">Loading...</p>
      </div>
    );
  }

  return null;
}
