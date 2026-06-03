"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const STORAGE_PREFIX = "jerlyd-arc-wallet-v1";

type WalletApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

function storageKey(userId: number, email: string) {
  return `${STORAGE_PREFIX}:${userId}:${email.toLowerCase()}`;
}

export function isWalletAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function loadStoredPrivateKey(userId: number, email: string): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  const existing = localStorage.getItem(storageKey(userId, email));
  if (existing && /^0x[a-fA-F0-9]{64}$/.test(existing)) {
    return existing as `0x${string}`;
  }
  return null;
}

function storePrivateKey(userId: number, email: string, privateKey: `0x${string}`) {
  localStorage.setItem(storageKey(userId, email), privateKey);
}

function createNewWallet(): { privateKey: `0x${string}`; address: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}

/** Read the canonical wallet address from the database (never generates). */
export async function fetchPatientWalletAddress(api: WalletApi): Promise<`0x${string}` | null> {
  const data = await api<{ walletAddress: string | null }>("/patient/wallet");
  const addr = data.walletAddress?.trim() || "";
  return isWalletAddress(addr) ? addr : null;
}

/**
 * Resolve the patient's wallet: load address from DB when present; otherwise create once and PATCH.
 * Private keys are stored in localStorage, but also backed up encrypted on the server for cross-device access.
 * On a new device, if the address exists but localStorage is empty, fetch the encrypted key from the server.
 * If the key can't be recovered from DB, auto-regenerate a new one.
 */
export async function ensurePatientWallet(
  api: WalletApi,
  userId: number,
  email: string
): Promise<{ privateKey: `0x${string}`; address: `0x${string}`; created: boolean }> {
  const existingAddress = await fetchPatientWalletAddress(api);

  if (existingAddress) {
    // Try to load private key from localStorage first
    let privateKey = loadStoredPrivateKey(userId, email);

    // If not in localStorage, fetch from server (cross-device recovery)
    if (!privateKey) {
      try {
        const data = await api<{
          walletAddress: string | null;
          privateKey: string | null;
          walletType?: string;
        }>("/patient/wallet");

        if (data.privateKey) {
          privateKey = data.privateKey as `0x${string}`;
          // Save to localStorage for future use
          storePrivateKey(userId, email, privateKey);
        } else {
          // The server has no key stored - try to regenerate a new one
          console.warn(
            "[ensurePatientWallet] No private key found on server, regenerating new wallet"
          );
          const { privateKey: newKey, address: newAddr } = createNewWallet();
          storePrivateKey(userId, email, newKey);

          try {
            await api("/patient/wallet", {
              method: "PATCH",
              body: JSON.stringify({ 
                walletAddress: newAddr, 
                privateKey: newKey,
              }),
            });
          } catch (saveErr) {
            console.error("[ensurePatientWallet] Failed to save regenerated key:", saveErr);
            // Still allow use even if save fails - it's already in localStorage
          }

          return { privateKey: newKey, address: newAddr, created: true };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not retrieve wallet from server";
        console.error("[ensurePatientWallet] Server retrieval failed:", msg);
        throw new Error(
          "Your wallet address is saved, but the signing key could not be recovered from our servers. Try refreshing, or contact support if this persists."
        );
      }
    }

    if (!privateKey) {
      throw new Error(
        "Your wallet address is saved on your account, but this browser does not have the signing key. Try using the device where you first created the wallet."
      );
    }

    const derivedAddress = privateKeyToAccount(privateKey).address;
    if (derivedAddress.toLowerCase() !== existingAddress.toLowerCase()) {
      throw new Error(
        "This browser has a different wallet than your account. Use the device where you first opened My wallet to pay with USDC."
      );
    }
    return { privateKey, address: existingAddress, created: false };
  }

  // No existing wallet - create a new one
  const { privateKey, address } = createNewWallet();
  storePrivateKey(userId, email, privateKey);

  await api("/patient/wallet", {
    method: "PATCH",
    body: JSON.stringify({ walletAddress: address, privateKey }),
  });

  return { privateKey, address, created: true };
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}
