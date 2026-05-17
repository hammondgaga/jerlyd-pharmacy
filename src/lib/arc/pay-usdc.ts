"use client";

import { fetchArcUsdcBalance } from "@/lib/arc/usdc-balance";

export { fetchArcUsdcBalance };

export type UsdcPayResult = {
  txHash: string;
  explorerUrl?: string;
};

type PayApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

/** Pay USDC on Arc testnet via server route (avoids browser CORS / Gateway errors). */
export async function payUsdcWithArc(
  api: PayApi,
  privateKey: `0x${string}`,
  amountUsdc: string,
  recipientAddress: string
): Promise<UsdcPayResult> {
  return api<UsdcPayResult>("/patient/pay-usdc", {
    method: "POST",
    body: JSON.stringify({
      privateKey,
      amountUsdc,
      recipientAddress: recipientAddress || undefined,
    }),
  });
}
