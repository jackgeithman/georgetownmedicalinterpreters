import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const DEV_EMAIL = process.env.DEV_EMAIL ?? "jackgeithman2005@gmail.com";

// In-memory rate limiter: max 10 PIN attempts per IP per 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    // ── Dev-only role impersonation (never runs in production) ──────────────
    CredentialsProvider({
      id: "dev",
      name: "Dev Role",
      credentials: { role: { label: "Role", type: "text" } },
      async authorize(credentials) {
        if (process.env.NODE_ENV !== "development") return null;
        const role = credentials?.role ?? "ADMIN";
        const email = `dev-${role.toLowerCase()}@dev.local`;
        // Pick up language clearances (etc.) from the seeded DB user if present
        const dbUser = await prisma.user.findUnique({ where: { email }, select: { roles: true } }).catch(() => null);
        return {
          id: `dev-${role}`,
          name: `Dev ${role.charAt(0) + role.slice(1).toLowerCase()}`,
          email,
          role,
          roles: dbUser?.roles ?? [role],
          status: "ACTIVE",
          onboardingComplete: true,
          clinicId: role === "CLINIC" ? "dev-clinic" : null,
        } as never;
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: "georgetown.edu",
        },
      },
    }),
    // Open Google login — no domain hint, used by the secret admin entry point
    GoogleProvider({
      id: "google-open",
      name: "Google (Open)",
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Clinic PIN",
      credentials: {
        token: { label: "Token", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.token || !credentials?.pin) return null;

        const ip =
          (req.headers as Record<string, string | undefined>)["x-forwarded-for"]?.split(",")[0].trim() ??
          "unknown";

        if (isRateLimited(ip)) return null;

        const clinic = await prisma.clinic.findUnique({
          where: { loginToken: credentials.token },
        });
        if (!clinic) return null;

        // Support both bcrypt hashes and legacy plain-text pins
        let pinMatches = false;
        if (clinic.loginPin.startsWith("$2")) {
          pinMatches = await bcrypt.compare(credentials.pin, clinic.loginPin);
        } else {
          pinMatches = credentials.pin === clinic.loginPin;
        }
        if (!pinMatches) return null;

        return {
          id: clinic.id,
          name: clinic.name,
          email: null,
          role: "CLINIC",
          clinicId: clinic.id,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      if (account?.provider === "dev") return process.env.NODE_ENV === "development";

      if (!user.email) return false;

      if (account?.provider === "google" || account?.provider === "google-open") {
        const emailLower = user.email.toLowerCase();
        const isGeorgetown = emailLower.endsWith("@georgetown.edu");
        const isDevEmail = emailLower === DEV_EMAIL.toLowerCase();

        if (!isDevEmail) {
          // Single DB lookup for any email rule
          const rule = await prisma.emailRule.findUnique({ where: { email: emailLower } });
          // BLOCK rule overrides everything
          if (rule?.type === "BLOCK") return "/login?error=DomainNotAllowed";
          // Non-Georgetown emails need an explicit ALLOW rule
          if (!isGeorgetown && rule?.type !== "ALLOW") return "/login?error=DomainNotAllowed";
        }

        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing?.status === "SUSPENDED") return false;

        if (existing) {
          if (user.email === DEV_EMAIL && (existing.role !== "ADMIN" || !existing.roles?.includes("DEV"))) {
            // Only update if role or DEV capability is missing (not on every sign-in)
            await prisma.user.update({
              where: { email: user.email },
              data: {
                role: "ADMIN",
                roles: existing.roles?.includes("DEV")
                  ? existing.roles
                  : [...(existing.roles ?? []), "DEV"]
              }
            });
          }
        } else {
          if (user.email === DEV_EMAIL) {
            await prisma.user.create({
              data: { email: user.email, name: user.name ?? user.email, role: "ADMIN", roles: ["DEV"], status: "ACTIVE", onboardingComplete: true },
            });
          } else {
            const adminCount = await prisma.user.count({
              where: { role: "ADMIN" },
            });
            const isFirstAdmin = adminCount === 0;
            await prisma.user.create({
              data: {
                email: user.email,
                name: user.name ?? user.email,
                role: isFirstAdmin ? "ADMIN" : "PENDING",
                roles: isFirstAdmin ? ["ADMIN"] : ["PENDING"],
                status: isFirstAdmin ? "ACTIVE" : "PENDING_APPROVAL",
                onboardingComplete: isFirstAdmin, // first admin bypasses onboarding, everyone else must complete it
              },
            });
          }
        }

        return true;
      }

      return false;
    },

    async jwt({ token, user, account }) {
      if (account?.provider === "dev" && user) {
        const u = user as unknown as { role: string; roles: string[]; clinicId: string | null };
        token.isDevSession = true;
        token.role = u.role;
        token.roles = u.roles;
        token.clinicId = u.clinicId;
        token.id = user.id;
        token.name = user.name;
        token.onboardingComplete = true;
        return token;
      }
      if (account?.provider === "credentials" && user) {
        token.isClinicSession = true;
        token.role = (user as unknown as { role: string }).role;
        token.clinicId = (user as unknown as { clinicId: string }).clinicId;
        token.id = user.id;
        token.name = user.name;
      }
      // On initial sign-in, fetch onboardingComplete so the JWT is never stale
      if (account && user?.email && account.provider === "google") {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email }, select: { onboardingComplete: true } });
        token.onboardingComplete = dbUser?.onboardingComplete ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.isDevSession) {
        session.user.role = token.role as string;
        session.user.roles = (token.roles ?? [token.role]) as string[];
        session.user.status = "ACTIVE";
        session.user.id = token.id as string;
        session.user.clinicId = (token.clinicId ?? null) as string | null;
        session.user.onboardingComplete = true;
        return session;
      }
      if (token.isClinicSession) {
        session.user.role = token.role as string;
        session.user.clinicId = token.clinicId as string;
        session.user.id = token.id as string;
        session.user.status = "ACTIVE";
        session.user.name = token.name as string;
        session.user.onboardingComplete = true;
      } else if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: { clinic: true, volunteer: true },
        });
        if (dbUser) {
          session.user.role = dbUser.role;
          session.user.roles = dbUser.roles ?? [];
          session.user.status = dbUser.status;
          session.user.id = dbUser.id;
          session.user.clinicId = dbUser.clinicId;
          session.user.onboardingComplete = dbUser.onboardingComplete;
        } else {
          // User was deleted — invalidate the session so they hit the login page
          console.warn(`[AUTH] User not found in database: ${session.user.email} — treating as unauthenticated`);
          session.user.status = "DELETED";
          session.user.role = "PENDING";
          session.user.roles = [];
          session.user.onboardingComplete = false;
        }
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
};
