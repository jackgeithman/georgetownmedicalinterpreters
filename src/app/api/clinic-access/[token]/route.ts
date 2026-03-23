import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — returns only the clinic name so the login page can greet the user.
// Never returns the PIN.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const clinic = await prisma.clinic.findUnique({
    where: { loginToken: token },
    select: { name: true },
  });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ name: clinic.name });
}
