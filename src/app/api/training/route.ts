import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user;
}

function canUpload(role: string) {
  return role === "ADMIN" || role === "INSTRUCTOR";
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const materials = await prisma.trainingMaterial.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(materials);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUpload(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, type, url, fileName, languageCode, category } = body as {
    title: string;
    description?: string;
    type: "FILE" | "LINK";
    url: string;
    fileName?: string;
    languageCode?: string;
    category?: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!url?.trim()) return NextResponse.json({ error: "URL is required" }, { status: 400 });
  if (type !== "FILE" && type !== "LINK") return NextResponse.json({ error: "Type must be FILE or LINK" }, { status: 400 });

  const material = await prisma.trainingMaterial.create({
    data: {
      title: title.trim(),
      description: description?.trim() ?? null,
      type,
      url,
      fileName: fileName ?? null,
      languageCode: languageCode?.trim() || null,
      category: category?.trim() || "General",
      uploadedById: user.id,
    },
    include: {
      uploadedBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(material, { status: 201 });
}
