import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// POST /api/clinic-pin-lookup
// Accepts an 8-digit PIN, compares against all clinic hashes, returns the matching
// clinic's loginToken so the client can call signIn("credentials", { token, pin }).
// Never returns the hashed PIN.
export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  if (!pin || !/^\d{8}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }

  const clinics = await prisma.clinic.findMany({
    select: { loginToken: true, loginPin: true, name: true },
  });

  for (const clinic of clinics) {
    const match = clinic.loginPin.startsWith("$2")
      ? await bcrypt.compare(pin, clinic.loginPin)
      : pin === clinic.loginPin;
    if (match) {
      return NextResponse.json({ token: clinic.loginToken, name: clinic.name });
    }
  }

  return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
}
