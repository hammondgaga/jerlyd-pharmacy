"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const STORAGE_PREFIX = "jerlyd-arc-wallet-v1";

function storageKey(userId: number, email: string) {
  return `${STORAGE_PREFIX}:${userId}:${email.toLowerCase()}`;
}

/** Testnet-only: create or load a local Arc wallet keyed by patient id + email. */
export function getOrCreatePatientWallet(userId: number, email: string): {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  created: boolean;
} {
  const key = storageKey(userId, email);
  const existing = localStorage.getItem(key);
  if (existing && /^0x[a-fA-F0-9]{64}$/.test(existing)) {
    const privateKey = existing as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    return { privateKey, address: account.address, created: false };
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  localStorage.setItem(key, privateKey);
  return { privateKey, address: account.address, created: true };
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}
