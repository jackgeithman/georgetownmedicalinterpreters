import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      roles: string[];
      status: string;
      clinicId: string | null;
    };
  }
}
