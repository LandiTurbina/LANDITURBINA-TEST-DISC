import { NextResponse } from "next/server";
import { createAdminSession, validateAdminLogin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const valid = await validateAdminLogin(email || "", password || "");

    if (!valid) {
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    await createAdminSession(email || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin login error", error);
    return NextResponse.json({ error: "Não foi possível entrar." }, { status: 500 });
  }
}
