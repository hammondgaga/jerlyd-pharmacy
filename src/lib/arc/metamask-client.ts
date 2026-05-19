"use client";

import { arcTestnetUsdcAddress } from "@/lib/arc/chains";
import { fetchArcUsdcBalance, formatUsdcDisplay } from "@/lib/arc/usdc-balance";

export function pharmacyTreasuryAddress(): `0x${string}` {
  const treasury = process.env.NEXT_PUBLIC_PHARMACY_USDC_WALLET?.trim();
  if (!treasury || !/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
    throw new Error(
      "Pharmacy USDC wallet is not configured (NEXT_PUBLIC_PHARMACY_USDC_WALLET)."
    );
  }
  return treasury as `0x${string}`;
}

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectMetaMask(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("MetaMask not detected. Install the MetaMask browser extension.");
  }
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  const addr = accounts[0];
  if (!addr) throw new Error("No account returned from MetaMask.");
  return addr;
}

export async function fetchMetaMaskUsdcBalance(address: string): Promise<string> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return "0.00";
  const raw = await fetchArcUsdcBalance(address as `0x${string}`);
  return formatUsdcDisplay(raw);
}

/** ERC-20 transfer USDC to the pharmacy treasury via MetaMask. */
export async function sendMetaMaskUsdc(from: string, amountUsdc: number): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask is not available.");
  const to = pharmacyTreasuryAddress();
  const microUsdc = BigInt(Math.round(amountUsdc * 1_000_000));
  const amountHex = microUsdc.toString(16).padStart(64, "0");
  const recipientPadded = to.slice(2).padStart(40, "0");
  const data = `0xa9059cbb${recipientPadded}${amountHex}`;

  const rawHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: arcTestnetUsdcAddress,
        data,
        gas: "0x15F90",
      },
    ],
  });
  return rawHash as string;
}
