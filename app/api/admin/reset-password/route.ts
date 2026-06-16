import { NextResponse } from "next/server";
import { resetAdminPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, recoveryCode, password } = await request.json();
    await resetAdminPassword(email || "", recoveryCode || "", password || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível redefinir a senha.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
