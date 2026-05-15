import { NextResponse } from "next/server";
import { getUserRow, verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    const user = await getUserRow(auth.sub);
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Session expired or invalid. Please sign in again." }, { status: 401 });
  }
}
