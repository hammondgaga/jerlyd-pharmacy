import { NextResponse } from "next/server";
import { payUsdcOnArcServer } from "@/lib/arc/pay-usdc-server";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      amountUsdc?: string;
      privateKey?: string;
      recipientAddress?: string;
    };

    const privateKey = String(body.privateKey || "").trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
      return NextResponse.json({ error: "Invalid wallet signing key." }, { status: 400 });
    }

    const amountUsdc = String(body.amountUsdc || "").trim();
    if (!amountUsdc || !/^\d+(\.\d+)?$/.test(amountUsdc) || Number(amountUsdc) <= 0) {
      return NextResponse.json({ error: "Invalid USDC amount." }, { status: 400 });
    }

    const recipientAddress = body.recipientAddress?.trim();
    if (recipientAddress && !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      return NextResponse.json({ error: "Invalid recipient address." }, { status: 400 });
    }

    const result = await payUsdcOnArcServer({
      privateKey: privateKey as `0x${string}`,
      amountUsdc,
      recipientAddress,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "USDC payment failed.";
    console.error("[pay-usdc]", msg, e);
    const status =
      msg.includes("authorization") || msg.includes("jwt")
        ? 401
        : msg.includes("not configured")
          ? 503
          : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
