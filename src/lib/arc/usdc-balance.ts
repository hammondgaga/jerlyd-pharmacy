import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { arcTestnet, arcTestnetUsdcAddress } from "@/lib/arc/chains";

/** USDC ERC-20 interface on Arc testnet uses 6 decimal places. */
export const USDC_DECIMALS = 6;
export const USDC_MICRO = BigInt(1_000_000);

function arcPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });
}

/**
 * Read spendable USDC for an address on Arc testnet.
 * Uses the official USDC ERC-20 `balanceOf` (6 decimals), per Arc docs.
 */
export async function fetchArcUsdcBalance(address: `0x${string}`): Promise<string> {
  const rpcUrl = arcTestnet.rpcUrls.default.http[0];
  const client = arcPublicClient();

  console.log("[Arc USDC balance] wallet address:", address);
  console.log("[Arc USDC balance] USDC contract:", arcTestnetUsdcAddress);
  console.log("[Arc USDC balance] RPC:", rpcUrl);

  const erc20Raw = await client.readContract({
    address: arcTestnetUsdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  const formatted = formatUnits(erc20Raw, USDC_DECIMALS);
  console.log("[Arc USDC balance] raw balanceOf response:", erc20Raw.toString());
  console.log("[Arc USDC balance] formatted (6 decimals):", formatted);

  return formatted;
}

/** @deprecated Use fetchArcUsdcBalance; kept for callers passing pre-fetched raw units. */
export function rawUsdcToAmount(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

/** Format a human USDC amount for UI (always 2 decimal places, e.g. "20.00"). */
export function formatUsdcDisplay(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}
