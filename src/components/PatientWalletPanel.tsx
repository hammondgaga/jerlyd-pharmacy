"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletAddressRow } from "@/components/WalletAddressRow";
import { WithdrawModal } from "@/components/WithdrawModal";
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
  const [refreshing, setRefreshing] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [hasSigningKey, setHasSigningKey] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<"idle" | "pending" | "success" | "error">(
    "idle"
  );
  const [withdrawMsg, setWithdrawMsg] = useState("");

  const [mmAddress, setMmAddress] = useState<string | null>(null);
  const [mmBalance, setMmBalance] = useState<string | null>(null);
  const [mmConnecting, setMmConnecting] = useState(false);
  const [mmError, setMmError] = useState("");

  const [paymentWallet, setPaymentWalletState] = useState<PaymentWallet>("auto");

  const maxBalance = useMemo(() => {
    if (!autoBalance) return 0;
    const n = parseFloat(autoBalance);
    return Number.isFinite(n) ? n : 0;
  }, [autoBalance]);

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    setRefreshing(true);
    try {
      const silent = builtInStatus === "ready" && Boolean(autoAddress);
      await loadAutoWallet({ silent });
    } finally {
      setRefreshing(false);
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setToast("Address copied to clipboard");
    } catch {
      setToast("Could not copy address");
    }
  }

  function openWithdrawModal() {
    setWithdrawStatus("idle");
    setWithdrawMsg("");
    setWithdrawModalOpen(true);
  }

  function closeWithdrawModal() {
    if (withdrawStatus === "pending") return;
    setWithdrawModalOpen(false);
    setWithdrawStatus("idle");
    setWithdrawMsg("");
  }

  async function handleWithdrawSubmit(amount: string, destination: string) {
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
          amountUsdc: amount,
          recipientAddress: destination,
        }),
      });
      const data = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Withdrawal failed.");

      setWithdrawStatus("success");
      setWithdrawMsg(`Sent! Transaction: ${data.txHash?.slice(0, 18)}…`);
      if (autoAddress) await loadBalance(autoAddress as `0x${string}`);
      window.setTimeout(() => {
        setWithdrawModalOpen(false);
        setWithdrawStatus("idle");
        setWithdrawMsg("");
        setToast("Withdrawal submitted successfully");
      }, 1200);
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

  const builtInStatusMessage =
    builtInStatus === "generating"
      ? "Generating wallet…"
      : builtInStatus === "loading"
        ? "Loading wallet…"
        : null;

  const refreshLabel = refreshing
    ? "Refreshing…"
    : builtInStatus === "loading" || builtInStatus === "generating"
      ? "Please wait…"
      : "Refresh wallet";

  return (
    <div className="wallet-panel">
      {toast ? (
        <div className="wallet-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <section
        className="wallet-section-card wallet-section-card--builtin"
        aria-labelledby="built-in-wallet-title"
      >
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
          <span className="wallet-label">Balance</span>

          {builtInStatusMessage ? (
            <span className="wallet-status-text">{builtInStatusMessage}</span>
          ) : null}

          <span className="wallet-amount" aria-live="polite">
            {balanceLoading ? (
              <span className="wallet-inline-loading">Loading balance…</span>
            ) : autoBalance !== null ? (
              `${autoBalance} USDC`
            ) : builtInStatus === "ready" ? (
              "— USDC"
            ) : (
              "—"
            )}
          </span>

          {autoAddress && builtInStatus === "ready" ? (
            <WalletAddressRow address={autoAddress} onCopy={copyAddress} />
          ) : builtInStatus === "error" ? (
            <p className="wallet-muted">No wallet loaded yet.</p>
          ) : null}

          {balanceError ? (
            <p className="wallet-error" role="alert">
              {balanceError}
            </p>
          ) : null}
        </div>

        <p className="wallet-faucet">
          <span className="wallet-muted">Need more test USDC? </span>
          <a
            href={ARC_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="wallet-faucet-link"
          >
            Claim from Faucet
          </a>
          <span className="wallet-muted wallet-faucet-hint">
            {" "}
            (select <strong>Arc Testnet</strong> on Circle&apos;s faucet)
          </span>
        </p>

        <div className="wallet-actions">
          <button
            type="button"
            className={`wallet-btn-outline${refreshing ? " is-loading" : ""}`}
            disabled={
              refreshing || builtInStatus === "loading" || builtInStatus === "generating"
            }
            onClick={() => void handleRefreshWallet()}
          >
            {refreshLabel}
          </button>
          {autoAddress && builtInStatus === "ready" ? (
            <button
              type="button"
              className="wallet-btn-primary"
              disabled={!hasSigningKey}
              onClick={openWithdrawModal}
            >
              Withdraw USDC
            </button>
          ) : null}
        </div>
      </section>

      <section
        className="wallet-section-card wallet-section-card--external"
        aria-labelledby="external-wallet-title"
      >
        <h3 id="external-wallet-title" className="wallet-section-title">
          External wallet (MetaMask)
        </h3>
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
              <WalletAddressRow address={mmAddress} onCopy={copyAddress} />
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

      <section className="wallet-section-card wallet-section-card--pref">
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
                  — {truncateAddress(mmAddress, 4, 5)}
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
        <section className="wallet-section-card">
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

      <WithdrawModal
        open={withdrawModalOpen}
        onClose={closeWithdrawModal}
        balanceDisplay={autoBalance ?? "0.00"}
        maxBalance={maxBalance}
        defaultDestination={mmAddress}
        hasSigningKey={hasSigningKey}
        status={withdrawStatus}
        statusMessage={withdrawMsg}
        onSubmit={handleWithdrawSubmit}
      />
    </div>
  );
}
