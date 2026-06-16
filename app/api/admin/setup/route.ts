import { NextResponse } from "next/server";
import { createAdminSession, setupAdminAccount } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const account = await setupAdminAccount(email || "", password || "");
    await createAdminSession(account.email);
    return NextResponse.json({ ok: true, email: account.email, recoveryCode: account.recoveryCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar a conta administrativa.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
