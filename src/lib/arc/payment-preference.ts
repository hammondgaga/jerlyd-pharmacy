"use client";

const PAYMENT_WALLET_KEY = "jerlyd-payment-wallet-v1";
const METAMASK_ADDRESS_KEY = "jerlyd-metamask-address-v1";

export type PaymentWallet = "auto" | "metamask";

export function getPaymentWallet(): PaymentWallet {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(PAYMENT_WALLET_KEY);
  return v === "metamask" ? "metamask" : "auto";
}

export function setPaymentWallet(wallet: PaymentWallet) {
  localStorage.setItem(PAYMENT_WALLET_KEY, wallet);
  window.dispatchEvent(new CustomEvent("jerlyd-payment-wallet"));
}

export function getStoredMetaMaskAddress(): string | null {
  if (typeof window === "undefined") return null;
  const addr = localStorage.getItem(METAMASK_ADDRESS_KEY)?.trim() || "";
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
}

export function setStoredMetaMaskAddress(address: string | null) {
  if (address) {
    localStorage.setItem(METAMASK_ADDRESS_KEY, address);
  } else {
    localStorage.removeItem(METAMASK_ADDRESS_KEY);
    if (getPaymentWallet() === "metamask") {
      setPaymentWallet("auto");
    }
  }
  window.dispatchEvent(new CustomEvent("jerlyd-metamask-address"));
}
