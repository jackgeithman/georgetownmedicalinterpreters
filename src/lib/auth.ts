import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const DEV_EMAIL = process.env.DEV_EMAIL ?? "jackgeithman2005@gmail.com";
const ALLOWED_EMAILS = (process.env.ALLOWED_EXTRA_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

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
    GoogleProvider({
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

      if (!user.email) return false;

      if (account?.provider === "google") {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing?.status === "SUSPENDED") return false;

        if (existing) {
          if (user.email === DEV_EMAIL) {
            // Ensure DEV user always has ADMIN role and DEV capability
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
              data: { email: user.email, name: user.name ?? user.email, role: "ADMIN", roles: ["DEV"], status: "ACTIVE" },
            });
          } else {
            const adminCount = await prisma.user.count({
              where: { role: "ADMIN" },
            });
            await prisma.user.create({
              data: {
                email: user.email,
                name: user.name ?? user.email,
                role: adminCount === 0 ? "ADMIN" : "PENDING",
                roles: adminCount === 0 ? ["ADMIN"] : ["PENDING"],
                status: adminCount === 0 ? "ACTIVE" : "PENDING_APPROVAL",
              },
            });
          }
        }

        return true;
      }

      return false;
    },

    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user) {
        token.isClinicSession = true;
        token.role = (user as unknown as { role: string }).role;
        token.clinicId = (user as unknown as { clinicId: string }).clinicId;
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.isClinicSession) {
        session.user.role = token.role as string;
        session.user.clinicId = token.clinicId as string;
        session.user.id = token.id as string;
        session.user.status = "ACTIVE";
        session.user.name = token.name as string;
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
        } else {
          console.warn(`[AUTH] User not found in database: ${session.user.email}`);
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
