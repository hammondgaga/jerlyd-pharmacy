"use client";

import { createPublicClient, http } from "viem";
import { arcTestnet } from "@/lib/arc/chains";
import { rawUsdcToAmount } from "@/lib/arc/usdc-balance";

const ARC_CHAIN = "Arc_Testnet" as const;

export async function fetchArcUsdcBalance(address: `0x${string}`): Promise<string> {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });
  const raw = await client.getBalance({ address });
  return rawUsdcToAmount(raw);
}

export type UsdcPayResult = {
  txHash: string;
  raw: unknown;
};

/** Pay USDC on Arc testnet via App Kit Unified Balance. */
export async function payUsdcWithArc(
  privateKey: `0x${string}`,
  amountUsdc: string,
  recipientAddress: string
): Promise<UsdcPayResult> {
  const treasury = process.env.NEXT_PUBLIC_PHARMACY_USDC_WALLET?.trim();
  if (!treasury || !/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
    throw new Error("Pharmacy USDC wallet is not configured (NEXT_PUBLIC_PHARMACY_USDC_WALLET).");
  }

  const to = recipientAddress || treasury;

  const [{ AppKit }, { createViemAdapterFromPrivateKey }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
  ]);

  const adapter = createViemAdapterFromPrivateKey({ privateKey });
  const kit = new AppKit();

  const result = await kit.unifiedBalance.spend({
    from: {
      adapter,
      allocations: { amount: amountUsdc, chain: ARC_CHAIN },
    },
    to: {
      adapter,
      chain: ARC_CHAIN,
      recipientAddress: to,
    },
    amount: amountUsdc,
    token: "USDC",
  });

  const txHash = result.txHash || extractTxHash(result);
  if (!txHash) {
    throw new Error("Payment submitted but no transaction hash was returned. Check your wallet activity.");
  }

  return { txHash, raw: result };
}

function extractTxHash(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (typeof r.txHash === "string") return r.txHash;
  if (typeof r.transactionHash === "string") return r.transactionHash;
  if (typeof r.hash === "string") return r.hash;
  const steps = r.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (step && typeof step === "object") {
        const s = step as Record<string, unknown>;
        if (typeof s.txHash === "string") return s.txHash;
        if (typeof s.transactionHash === "string") return s.transactionHash;
      }
    }
  }
  return null;
}
