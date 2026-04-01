import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/volunteer/lang-role?code=ES
// Allows a volunteer to remove their own pending (uncleared) LANG_XX role.
// Cleared roles (LANG_XX_CLEARED) cannot be self-removed.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pendingRole = `LANG_${code}`;
  const clearedRole = `LANG_${code}_CLEARED`;

  if (!user.roles.includes(pendingRole)) {
    // Either doesn't have it, or it's already cleared — don't allow removal of cleared
    if (user.roles.includes(clearedRole)) {
      return NextResponse.json({ error: "Cannot remove a cleared language" }, { status: 403 });
    }
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const newRoles = user.roles.filter((r) => r !== pendingRole);
  await prisma.user.update({ where: { id: user.id }, data: { roles: newRoles } });

  return NextResponse.json({ ok: true, roles: newRoles });
}
