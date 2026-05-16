import { NextResponse } from "next/server";
import { formatNaira, getNgnPerUsd } from "@/lib/exchange-rate";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ngnPerUsd = await getNgnPerUsd();
    return NextResponse.json({
      ngnPerUsd,
      label: `1 USDC ≈ ${formatNaira(ngnPerUsd)}`,
      usdcPerNgn: 1 / ngnPerUsd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not fetch exchange rate.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
