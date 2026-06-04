"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

type WalletApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

type StoredWallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
};

export function isWalletAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function isPrivateKey(key: string): key is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(key);
}

/**
 * Load wallet from localStorage using simplified key format.
 * Key format: arc_wallet_${userId}
 */
function loadStoredWallet(userId: number): StoredWallet | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(`arc_wallet_${userId}`);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    if (
      parsed.address &&
      isWalletAddress(parsed.address) &&
      parsed.privateKey &&
      isPrivateKey(parsed.privateKey)
    ) {
      return { address: parsed.address, privateKey: parsed.privateKey };
    }
  } catch (e) {
    console.warn("[loadStoredWallet] Failed to parse stored wallet:", e);
  }
  
  return null;
}

/**
 * Save wallet to localStorage using simplified key format.
 * Key format: arc_wallet_${userId}
 */
function saveStoredWallet(userId: number, wallet: StoredWallet): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(`arc_wallet_${userId}`, JSON.stringify(wallet));
  } catch (e) {
    console.error("[saveStoredWallet] Failed to save wallet:", e);
  }
}

function createNewWallet(): { privateKey: `0x${string}`; address: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}

/** Read the canonical wallet address from the database (never generates). */
export async function fetchPatientWalletAddress(api: WalletApi): Promise<`0x${string}` | null> {
  try {
    const data = await api<{ walletAddress: string | null }>("/patient/wallet");
    const addr = data.walletAddress?.trim() || "";
    return isWalletAddress(addr) ? addr : null;
  } catch (e) {
    console.error("[fetchPatientWalletAddress] Error:", e);
    return null;
  }
}

/**
 * Ensure patient has a wallet with both address and private key.
 * Production-ready cross-device support:
 * 1. Check localStorage first (fast path)
 * 2. Fetch encrypted key from server (cross-device recovery)
 * 3. Generate new wallet if none exists
 * 4. Always save to localStorage after retrieval
 */
export async function ensurePatientWallet(
  api: WalletApi,
  userId: number,
  email: string
): Promise<{ privateKey: `0x${string}`; address: `0x${string}`; created: boolean; replaced?: boolean }> {
  // Step 1: Check localStorage first (fastest path)
  const stored = loadStoredWallet(userId);
  if (stored) {
    return { privateKey: stored.privateKey, address: stored.address, created: false };
  }

  // Step 2: Fetch from server (works on any device)
  try {
    const serverData = await api<{
      walletAddress: string | null;
      privateKey: string | null;
    }>("/patient/wallet");

    if (serverData.walletAddress && serverData.privateKey) {
      const wallet: StoredWallet = {
        address: serverData.walletAddress as `0x${string}`,
        privateKey: serverData.privateKey as `0x${string}`,
      };
      // Save to localStorage for future use
      saveStoredWallet(userId, wallet);
      return { privateKey: wallet.privateKey, address: wallet.address, created: false };
    }
  } catch (e) {
    console.warn("[ensurePatientWallet] Server fetch failed:", e);
    // Continue to generate new wallet if server fetch fails
  }

  // Step 3: Generate new wallet if none exists on server
  const { privateKey, address } = createNewWallet();

  try {
    const patchResp = await api<{ walletAddress: string; replaced?: boolean }>("/patient/wallet", {
      method: "PATCH",
      body: JSON.stringify({
        walletAddress: address,
        privateKey, // Server will encrypt and store this
      }),
    });

    // Save to localStorage for future use
    saveStoredWallet(userId, { address, privateKey });

    return {
      privateKey,
      address,
      created: true,
      replaced: patchResp.replaced === true,
    };
  } catch (e) {
    console.error("[ensurePatientWallet] Failed to save wallet to server:", e);
    // Still allow use even if save fails - it's in localStorage now
    saveStoredWallet(userId, { address, privateKey });
    throw new Error(
      "Wallet was generated locally but could not be saved to the server. Please refresh and try again."
    );
  }
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}
