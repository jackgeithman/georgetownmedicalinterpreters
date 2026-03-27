import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "INSTRUCTOR") return null;
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "File upload not configured" }, { status: 501 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Sanitize file name
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `public/${Date.now()}-${sanitizedFileName}`;

  const buffer = await file.arrayBuffer();

  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/training-materials/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "Upload failed");
    return NextResponse.json({ error: errText }, { status: 500 });
  }

  const url = `${supabaseUrl}/storage/v1/object/public/training-materials/${path}`;

  return NextResponse.json({ url, fileName: file.name });
}
