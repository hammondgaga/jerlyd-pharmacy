"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchArcUsdcBalance, formatUsdcDisplay } from "@/lib/arc/usdc-balance";
import {
  connectMetaMask,
  fetchMetaMaskUsdcBalance,
  hasMetaMask,
} from "@/lib/arc/metamask-client";
import {
  ensurePatientWallet,
  fetchPatientWalletAddress,
  truncateAddress,
} from "@/lib/arc/patient-wallet";
import {
  getPaymentWallet,
  getStoredMetaMaskAddress,
  setPaymentWallet,
  setStoredMetaMaskAddress,
  type PaymentWallet,
} from "@/lib/arc/payment-preference";
import type { MarketplaceOrder } from "@/components/StockMarketplace";

interface Props {
  token: string;
  userId: number;
  userEmail: string;
  orders: MarketplaceOrder[];
}

export function PatientWalletPanel({ token, userId, userEmail, orders }: Props) {
  const [autoAddress, setAutoAddress] = useState<string | null>(null);
  const [autoBalance, setAutoBalance] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(true);
  const [hasSigningKey, setHasSigningKey] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState<"idle" | "pending" | "success" | "error">(
    "idle"
  );
  const [withdrawMsg, setWithdrawMsg] = useState("");

  const [mmAddress, setMmAddress] = useState<string | null>(null);
  const [mmBalance, setMmBalance] = useState<string | null>(null);
  const [mmConnecting, setMmConnecting] = useState(false);
  const [mmError, setMmError] = useState("");

  const [paymentWallet, setPaymentWalletState] = useState<PaymentWallet>("auto");

  const api = useCallback(
    async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API error: ${res.status}`);
      }
      return res.json();
    },
    [token]
  );

  const loadAutoWallet = useCallback(async () => {
    setAutoLoading(true);
    try {
      let addr = await fetchPatientWalletAddress(api);
      if (!addr) {
        await ensurePatientWallet(api, userId, userEmail);
        addr = await fetchPatientWalletAddress(api);
      }
      setAutoAddress(addr);
      if (addr) {
        const bal = await fetchArcUsdcBalance(addr);
        setAutoBalance(formatUsdcDisplay(bal));
      }
      try {
        await ensurePatientWallet(api, userId, userEmail);
        setHasSigningKey(true);
      } catch {
        setHasSigningKey(false);
      }
    } catch {
      setAutoBalance("—");
      setHasSigningKey(false);
    }
    setAutoLoading(false);
  }, [api, userId, userEmail]);

  const refreshMmBalance = useCallback(async (address: string) => {
    const bal = await fetchMetaMaskUsdcBalance(address);
    setMmBalance(bal);
  }, []);

  useEffect(() => {
    void loadAutoWallet();
  }, [loadAutoWallet]);

  useEffect(() => {
    setPaymentWalletState(getPaymentWallet());
    const stored = getStoredMetaMaskAddress();
    if (stored) {
      setMmAddress(stored);
      void refreshMmBalance(stored);
    }
  }, [refreshMmBalance]);

  useEffect(() => {
    const onPref = () => setPaymentWalletState(getPaymentWallet());
    const onMm = () => {
      const stored = getStoredMetaMaskAddress();
      setMmAddress(stored);
      if (stored) void refreshMmBalance(stored);
      else setMmBalance(null);
    };
    window.addEventListener("jerlyd-payment-wallet", onPref);
    window.addEventListener("jerlyd-metamask-address", onMm);
    return () => {
      window.removeEventListener("jerlyd-payment-wallet", onPref);
      window.removeEventListener("jerlyd-metamask-address", onMm);
    };
  }, [refreshMmBalance]);

  function choosePaymentWallet(wallet: PaymentWallet) {
    if (wallet === "metamask" && !mmAddress) return;
    setPaymentWallet(wallet);
    setPaymentWalletState(wallet);
  }

  async function handleWithdraw() {
    const amount = Number(withdrawAmount);
    if (!/^0x[a-fA-F0-9]{40}$/.test(withdrawTo.trim())) {
      setWithdrawStatus("error");
      setWithdrawMsg("Enter a valid recipient address (0x…).");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawStatus("error");
      setWithdrawMsg("Enter a valid USDC amount.");
      return;
    }
    if (
      !confirm(
        `Send ${amount.toFixed(2)} USDC to ${withdrawTo.trim()}?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setWithdrawStatus("pending");
    setWithdrawMsg("");
    try {
      const { privateKey } = await ensurePatientWallet(api, userId, userEmail);
      const res = await fetch("/api/patient/withdraw-usdc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          privateKey,
          amountUsdc: withdrawAmount,
          recipientAddress: withdrawTo.trim(),
        }),
      });
      const data = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Withdrawal failed.");

      setWithdrawStatus("success");
      setWithdrawMsg(`Sent! Transaction: ${data.txHash?.slice(0, 18)}…`);
      setWithdrawTo("");
      setWithdrawAmount("");
      setWithdrawOpen(false);
      await loadAutoWallet();
    } catch (e) {
      setWithdrawStatus("error");
      setWithdrawMsg(e instanceof Error ? e.message : "Withdrawal failed.");
    }
  }

  async function handleConnectMetaMask() {
    setMmError("");
    setMmConnecting(true);
    try {
      if (!hasMetaMask()) {
        setMmError("MetaMask not detected. Please install the MetaMask browser extension.");
        return;
      }
      const addr = await connectMetaMask();
      setMmAddress(addr);
      setStoredMetaMaskAddress(addr);
      const bal = await fetchMetaMaskUsdcBalance(addr);
      setMmBalance(bal);
      choosePaymentWallet("metamask");
    } catch (e) {
      setMmError(e instanceof Error ? e.message : "Could not connect MetaMask.");
    } finally {
      setMmConnecting(false);
    }
  }

  function handleDisconnectMetaMask() {
    setMmAddress(null);
    setMmBalance(null);
    setStoredMetaMaskAddress(null);
    if (paymentWallet === "metamask") {
      choosePaymentWallet("auto");
    }
  }

  return (
    <div className="wallet-panel">
      {autoLoading ? (
        <p className="wallet-muted">Loading wallet…</p>
      ) : autoAddress ? (
        <div className="wallet-balance-card">
          <span className="wallet-label">Auto wallet · Arc Testnet</span>
          <span className="wallet-amount">{autoBalance ?? "—"} USDC</span>
          <span className="wallet-address">{truncateAddress(autoAddress)}</span>
        </div>
      ) : (
        <p className="wallet-muted">No wallet found.</p>
      )}

      {autoAddress ? (
        <div className="wallet-actions">
          <button type="button" className="wallet-btn-outline" onClick={() => void loadAutoWallet()}>
            Refresh balance
          </button>
          <button
            type="button"
            className="wallet-btn-primary"
            onClick={() => {
              setWithdrawOpen((o) => !o);
              setWithdrawStatus("idle");
              setWithdrawMsg("");
            }}
          >
            {withdrawOpen ? "Cancel withdraw" : "Withdraw USDC"}
          </button>
        </div>
      ) : null}

      {withdrawOpen ? (
        <section className="wallet-section wallet-withdraw">
          <p className="wallet-muted">
            Send USDC from your auto-generated wallet to any external address on Arc testnet.
          </p>

          {!hasSigningKey ? (
            <div className="wallet-warning">
              Signing key not found in this browser. Withdraw only works on the device where you
              first opened My wallet.
            </div>
          ) : null}

          <label className="wallet-field-label" htmlFor="withdraw-to">
            Recipient address
          </label>
          <input
            id="withdraw-to"
            className="wallet-input"
            type="text"
            placeholder="0x…"
            value={withdrawTo}
            onChange={(e) => setWithdrawTo(e.target.value)}
          />

          <label className="wallet-field-label" htmlFor="withdraw-amount">
            Amount (USDC)
          </label>
          <input
            id="withdraw-amount"
            className="wallet-input"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />

          <button
            type="button"
            className="wallet-btn-primary"
            disabled={
              withdrawStatus === "pending" || !withdrawTo || !withdrawAmount || !hasSigningKey
            }
            onClick={() => void handleWithdraw()}
          >
            {withdrawStatus === "pending" ? "Sending…" : "Confirm & send"}
          </button>

          {withdrawMsg ? (
            <p className={withdrawStatus === "success" ? "wallet-success" : "wallet-error"}>
              {withdrawMsg}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="wallet-section wallet-metamask">
        <h3 className="wallet-section-title">External wallet (MetaMask)</h3>
        {!mmAddress ? (
          <>
            <p className="wallet-muted">
              Connect MetaMask to pay for orders from any browser, or use a wallet you already
              control.
            </p>
            <button
              type="button"
              className="wallet-btn-metamask"
              onClick={() => void handleConnectMetaMask()}
              disabled={mmConnecting}
            >
              {mmConnecting ? "Connecting…" : "Connect MetaMask"}
            </button>
            {mmError ? <p className="wallet-error">{mmError}</p> : null}
          </>
        ) : (
          <>
            <div className="wallet-balance-card wallet-balance-card--mm">
              <span className="wallet-label">MetaMask · Arc Testnet</span>
              <span className="wallet-amount">{mmBalance ?? "—"} USDC</span>
              <span className="wallet-address">{truncateAddress(mmAddress)}</span>
            </div>
            <div className="wallet-actions">
              <button
                type="button"
                className="wallet-btn-outline"
                onClick={() => void refreshMmBalance(mmAddress)}
              >
                Refresh balance
              </button>
              <button type="button" className="wallet-btn-outline" onClick={handleDisconnectMetaMask}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </section>

      <section className="wallet-section wallet-payment-pref">
        <h3 className="wallet-section-title">Checkout payment source</h3>
        <p className="wallet-muted">Choose which wallet to use when paying with USDC in the marketplace.</p>
        <div className="wallet-payment-options" role="radiogroup" aria-label="Payment wallet">
          <label className="wallet-payment-option">
            <input
              type="radio"
              name="payment-wallet"
              checked={paymentWallet === "auto"}
              onChange={() => choosePaymentWallet("auto")}
            />
            <span>
              <strong>Auto wallet</strong>
              {autoBalance ? (
                <span className="wallet-muted"> — {autoBalance} USDC</span>
              ) : null}
            </span>
          </label>
          <label className={`wallet-payment-option${!mmAddress ? " is-disabled" : ""}`}>
            <input
              type="radio"
              name="payment-wallet"
              checked={paymentWallet === "metamask"}
              disabled={!mmAddress}
              onChange={() => choosePaymentWallet("metamask")}
            />
            <span>
              <strong>MetaMask</strong>
              {mmAddress ? (
                <span className="wallet-muted">
                  {" "}
                  — {truncateAddress(mmAddress)}
                  {mmBalance ? ` · ${mmBalance} USDC` : ""}
                </span>
              ) : (
                <span className="wallet-muted"> — connect MetaMask above</span>
              )}
            </span>
          </label>
        </div>
      </section>

      {orders.length > 0 ? (
        <section className="wallet-section">
          <h3 className="wallet-section-title">Order history</h3>
          <ul className="wallet-order-list">
            {orders.map((o) => (
              <li key={o.id} className="wallet-order-item">
                <span>{o.drugName}</span>
                <span className="wallet-muted">{o.totalUsdc} USDC</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
