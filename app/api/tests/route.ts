import { NextResponse } from "next/server";
import { saveDiscTest } from "@/lib/disc-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const saved = await saveDiscTest(body);
    return NextResponse.json({ test: saved });
  } catch (error) {
    console.error("Save test error", error);
    return NextResponse.json({ error: "Não foi possível salvar o teste." }, { status: 500 });
  }
}
