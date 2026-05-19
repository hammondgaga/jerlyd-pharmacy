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

const ARC_FAUCET_URL = "https://faucet.circle.com/";

interface Props {
  token: string;
  userId: number;
  userEmail: string;
  orders: MarketplaceOrder[];
}

type BuiltInWalletStatus = "loading" | "generating" | "ready" | "error";

function apiPath(path: string): string {
  if (path.startsWith("/api")) return path;
  return `/api${path.startsWith("/") ? path : `/${path}`}`;
}

export function PatientWalletPanel({ token, userId, userEmail, orders }: Props) {
  const [autoAddress, setAutoAddress] = useState<string | null>(null);
  const [autoBalance, setAutoBalance] = useState<string | null>(null);
  const [builtInStatus, setBuiltInStatus] = useState<BuiltInWalletStatus>("loading");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
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
      const res = await fetch(apiPath(path), {
        ...init,
        headers: {
          Accept: "application/json",
          ...init?.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await res.text();
      let data: { error?: string } & Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        data = { error: text || res.statusText };
      }
      if (!res.ok) {
        throw new Error((data.error as string) || res.statusText || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [token]
  );

  const loadBalance = useCallback(async (addr: `0x${string}`) => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const bal = await fetchArcUsdcBalance(addr);
      setAutoBalance(formatUsdcDisplay(bal));
    } catch (e) {
      setAutoBalance(null);
      setBalanceError(e instanceof Error ? e.message : "Could not load USDC balance.");
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const loadAutoWallet = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setBuiltInStatus("loading");
        setWalletError(null);
        setBalanceError(null);
      }

      try {
        let addr = await fetchPatientWalletAddress(api);

        if (!addr) {
          setBuiltInStatus("generating");
          const created = await ensurePatientWallet(api, userId, userEmail);
          addr = created.address;
          setHasSigningKey(true);
        } else {
          try {
            await ensurePatientWallet(api, userId, userEmail);
            setHasSigningKey(true);
          } catch {
            setHasSigningKey(false);
          }
        }

        if (!addr) {
          throw new Error("Wallet address could not be loaded. Try refreshing.");
        }

        setAutoAddress(addr);
        setBuiltInStatus("ready");
        await loadBalance(addr);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load your in-built wallet.";
        setWalletError(message);
        setBuiltInStatus("error");
        setAutoAddress(null);
        setAutoBalance(null);
        setHasSigningKey(false);
      }
    },
    [api, userId, userEmail, loadBalance]
  );

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

  async function handleRefreshWallet() {
    await loadAutoWallet();
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
      const res = await fetch(apiPath("/patient/withdraw-usdc"), {
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
      if (autoAddress) await loadBalance(autoAddress as `0x${string}`);
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

  const showFaucet =
    builtInStatus === "error" ||
    builtInStatus === "generating" ||
    builtInStatus === "loading" ||
    !autoAddress ||
    autoBalance === "0.00";

  const builtInStatusMessage =
    builtInStatus === "generating"
      ? "Generating wallet…"
      : builtInStatus === "loading"
        ? "Loading wallet…"
        : null;

  return (
    <div className="wallet-panel">
      <section className="wallet-section wallet-built-in" aria-labelledby="built-in-wallet-title">
        <h3 id="built-in-wallet-title" className="wallet-section-title">
          In-built wallet
        </h3>
        <p className="wallet-muted">Arc Testnet · USDC for pharmacy checkout</p>

        {walletError ? (
          <div className="wallet-error-banner" role="alert">
            {walletError}
          </div>
        ) : null}

        <div className="wallet-balance-card">
          <span className="wallet-label">In-built wallet · Arc Testnet</span>

          {builtInStatusMessage ? (
            <span className="wallet-status-text">{builtInStatusMessage}</span>
          ) : null}

          {autoAddress && builtInStatus === "ready" ? (
            <>
              <span className="wallet-amount" aria-live="polite">
                {balanceLoading ? (
                  <span className="wallet-inline-loading">Loading balance…</span>
                ) : autoBalance !== null ? (
                  `${autoBalance} USDC`
                ) : (
                  "— USDC"
                )}
              </span>
              <span className="wallet-address" title={autoAddress}>
                {truncateAddress(autoAddress)}
              </span>
              <span className="wallet-address-full">{autoAddress}</span>
            </>
          ) : builtInStatus === "error" ? (
            <p className="wallet-muted">No wallet loaded yet.</p>
          ) : null}

          {balanceError ? (
            <p className="wallet-error" role="alert">
              {balanceError}
            </p>
          ) : null}
        </div>

        {showFaucet ? (
          <p className="wallet-faucet">
            <a
              href={ARC_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="wallet-faucet-link"
            >
              Claim free USDC from Faucet
            </a>
            <span className="wallet-muted wallet-faucet-hint">
              {" "}
              — select <strong>Arc Testnet</strong> on Circle&apos;s faucet, then paste your address
              above.
            </span>
          </p>
        ) : null}

        <div className="wallet-actions">
          <button
            type="button"
            className="wallet-btn-outline"
            disabled={builtInStatus === "loading" || builtInStatus === "generating"}
            onClick={() => void handleRefreshWallet()}
          >
            {builtInStatus === "loading" || builtInStatus === "generating"
              ? "Refreshing…"
              : "Refresh wallet"}
          </button>
          {autoAddress && builtInStatus === "ready" ? (
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
          ) : null}
        </div>
      </section>

      {withdrawOpen && autoAddress ? (
        <section className="wallet-section wallet-withdraw">
          <p className="wallet-muted">
            Send USDC from your in-built wallet to any external address on Arc testnet.
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
              <span className="wallet-address" title={mmAddress}>
                {truncateAddress(mmAddress)}
              </span>
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
              <strong>In-built wallet</strong>
              {autoBalance && builtInStatus === "ready" ? (
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
                <span className="wallet-muted">{formatUsdcDisplay(o.totalUsdc)} USDC</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
