import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

// Emails outside @georgetown.edu that are explicitly allowed
const ALLOWED_EMAILS = ["jackgeithman2005@gmail.com"];

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
      async authorize(credentials) {
        if (!credentials?.token || !credentials?.pin) return null;
        const clinic = await prisma.clinic.findUnique({
          where: { loginToken: credentials.token },
        });
        if (!clinic || clinic.loginPin !== credentials.pin) return null;
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
        const allowed =
          user.email.endsWith("@georgetown.edu") ||
          ALLOWED_EMAILS.includes(user.email);
        if (!allowed) return "/login?error=DomainNotAllowed";

        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing?.status === "SUSPENDED") return false;

        if (!existing) {
          // First admin: promote if no admins exist yet
          const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name ?? user.email,
              role: adminCount === 0 ? "ADMIN" : "PENDING",
              status: adminCount === 0 ? "ACTIVE" : "PENDING_APPROVAL",
            },
          });
        }

        return true;
      }

      return false;
    },

    async jwt({ token, user, account }) {
      // On credentials sign-in, embed clinic info directly in the token
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
          session.user.status = dbUser.status;
          session.user.id = dbUser.id;
          session.user.clinicId = dbUser.clinicId;
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
