import { NextResponse } from "next/server";
import { createAdminSession, validateAdminPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const valid = await validateAdminPassword(password || "");

    if (!valid) {
      return NextResponse.json({ error: "Senha inválida." }, { status: 401 });
    }

    await createAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin login error", error);
    return NextResponse.json({ error: "Não foi possível entrar." }, { status: 500 });
  }
}
