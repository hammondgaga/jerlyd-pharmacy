import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const ARC_CHAIN = "Arc_Testnet" as const;

function pharmacyTreasuryAddress(): string {
  const treasury =
    process.env.PHARMACY_USDC_WALLET?.trim() || process.env.NEXT_PUBLIC_PHARMACY_USDC_WALLET?.trim();
  if (!treasury || !/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
    throw new Error("Pharmacy USDC wallet is not configured (PHARMACY_USDC_WALLET).");
  }
  return treasury;
}

/**
 * Same-chain USDC transfer on Arc testnet (server-side).
 * Uses App Kit `send` — not Gateway `spend`, which targets cross-chain transfers.
 */
export async function payUsdcOnArcServer(params: {
  privateKey: `0x${string}`;
  amountUsdc: string;
  recipientAddress?: string;
}): Promise<{ txHash: string; explorerUrl?: string }> {
  const amount = params.amountUsdc.trim();
  if (!amount || Number(amount) <= 0) {
    throw new Error("Invalid USDC amount.");
  }

  const to = (params.recipientAddress?.trim() || pharmacyTreasuryAddress()) as `0x${string}`;
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new Error("Invalid recipient wallet address.");
  }

  try {
    console.log("[payUsdcOnArcServer] Initiating transfer:", { amount, to });
    
    const kit = new AppKit({ disableErrorReporting: true });
    const adapter = createViemAdapterFromPrivateKey({ privateKey: params.privateKey });

    const sendParams = {
      from: { adapter, chain: ARC_CHAIN },
      to,
      amount,
      token: "USDC" as const,
    };

    const result = await kit.send(sendParams);

    if (result.state === "error") {
      const errorMsg = `USDC transfer failed (${result.name || "send"}).`;
      console.error("[payUsdcOnArcServer]", errorMsg, result);
      throw new Error(errorMsg);
    }

    const txHash = result.txHash;
    if (!txHash) {
      console.error("[payUsdcOnArcServer] No transaction hash in result:", result);
      throw new Error("Transfer submitted but no transaction hash was returned.");
    }

    console.log("[payUsdcOnArcServer] Transfer successful:", txHash);

    return { txHash, explorerUrl: result.explorerUrl };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Transfer failed";
    console.error("[payUsdcOnArcServer] Error:", errorMsg, e);
    throw e;
  }
}
