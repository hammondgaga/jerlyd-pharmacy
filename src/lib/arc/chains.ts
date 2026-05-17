import { defineChain } from "viem";

/** Arc testnet USDC ERC-20 interface (6 decimals) — shares balance with native USDC. */
export const arcTestnetUsdcAddress =
  "0x3600000000000000000000000000000000000000" as const;

/** Arc testnet — chain ID 5042002 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  // Native gas accounting uses 18 decimals; app balances use the ERC-20 interface (6 decimals).
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});
