import { formatUnits } from "viem";

/** USDC on Arc uses 6 decimal places; on-chain balances are in smallest units (micro-USDC). */
export const USDC_DECIMALS = 6;
export const USDC_MICRO = BigInt(1_000_000);

/** Convert raw on-chain balance (smallest USDC units) to a human-readable decimal string. */
export function rawUsdcToAmount(raw: bigint): string {
  // Arc testnet RPC sometimes returns 18-decimal wei; detect over-scaled values.
  if (raw > BigInt(10) ** BigInt(15)) {
    return formatUnits(raw, 18);
  }
  return formatUnits(raw, USDC_DECIMALS);
}

/** Format a balance for UI (always 2 decimal places, e.g. "20.00"). */
export function formatUsdcDisplay(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}
