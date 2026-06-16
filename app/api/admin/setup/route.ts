import { NextResponse } from "next/server";
import { createAdminSession, setupAdminPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    await setupAdminPassword(password || "");
    await createAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar a senha.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
