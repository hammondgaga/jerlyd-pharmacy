"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchArcUsdcBalance, formatUsdcDisplay } from "@/lib/arc/usdc-balance";
import {
  ensurePatientWallet,
  fetchPatientWalletAddress,
  truncateAddress,
} from "@/lib/arc/patient-wallet";
import type { MarketplaceOrder } from "@/components/StockMarketplace";

// ─── MetaMask helpers ────────────────────────────────────────────────────────

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

async function connectMetaMask(): Promise<string | null> {
  if (!window.ethereum) return null;
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  return accounts[0] ?? null;
}

async function getMetaMaskUsdcBalance(address: string): Promise<string> {
  const USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
  const RPC_URL =
    process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

  const data = `0x70a08231000000000000000000000000${address.slice(2)}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: USDC_CONTRACT, data }, "latest"],
  });

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = (await res.json()) as { result?: string };
  if (!json.result || json.result === "0x") return "0.00";
  const raw = BigInt(json.result);
  return (Number(raw) / 1e6).toFixed(2);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  orders: MarketplaceOrder[];
}

type Tab = "balance" | "withdraw" | "metamask";

// ─── Component ───────────────────────────────────────────────────────────────

export function PatientWalletPanel(props: Props) {
  return <PatientWalletPanelInner {...props} />;
}

function PatientWalletPanelInner({ token, orders }: Props) {
  const [tab, setTab] = useState<Tab>("balance");

  // Auto wallet
  const [autoAddress, setAutoAddress] = useState<string | null>(null);
  const [autoBalance, setAutoBalance] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(true);

  // Withdraw
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [withdrawMsg, setWithdrawMsg] = useState("");

  // MetaMask
  const [mmAddress, setMmAddress] = useState<string | null>(null);
  const [mmBalance, setMmBalance] = useState<string | null>(null);
  const [mmConnecting, setMmConnecting] = useState(false);
  const [mmError, setMmError] = useState("");

  // ── API helper ──
  const api = useCallback(async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, [token]);

  // ── Load auto wallet ──
  const loadAutoWallet = useCallback(async () => {
    setAutoLoading(true);
    try {
      const addr = await fetchPatientWalletAddress(api);
      if (addr) {
        setAutoAddress(addr);
        const bal = await fetchArcUsdcBalance(addr);
        setAutoBalance(formatUsdcDisplay(bal));
      } else {
        // Fetch user info to get userId and email
        const me = await api<{ user: { id: number; email: string } }>("/api/me");
        await ensurePatientWallet(api, me.user.id, me.user.email);
        const addr2 = await fetchPatientWalletAddress(api);
        setAutoAddress(addr2);
        if (addr2) {
          const bal = await fetchArcUsdcBalance(addr2);
          setAutoBalance(formatUsdcDisplay(bal));
        }
      }
    } catch {
      setAutoBalance("—");
    }
    setAutoLoading(false);
  }, [api]);

  useEffect(() => {
    loadAutoWallet();
  }, [loadAutoWallet]);

  // ── Withdraw ──
  async function handleWithdraw() {
    setWithdrawStatus("pending");
    setWithdrawMsg("");
    try {
      const keyRaw = localStorage.getItem("arcPrivateKey");
      if (!keyRaw) throw new Error("Signing key not found in this browser.");

      const res = await fetch("/api/patient/withdraw-usdc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          privateKey: keyRaw,
          amountUsdc: withdrawAmount,
          recipientAddress: withdrawTo,
        }),
      });
      const data = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Withdrawal failed.");

      setWithdrawStatus("success");
      setWithdrawMsg(`Sent! Tx: ${data.txHash?.slice(0, 18)}…`);
      setWithdrawTo("");
      setWithdrawAmount("");
      // refresh balance
      if (autoAddress) {
        const bal = await fetchArcUsdcBalance(autoAddress as `0x${string}`);
        setAutoBalance(formatUsdcDisplay(bal));
      }
    } catch (e) {
      setWithdrawStatus("error");
      setWithdrawMsg(e instanceof Error ? e.message : "Withdrawal failed.");
    }
  }

  // ── MetaMask ──
  async function handleConnectMetaMask() {
    setMmError("");
    setMmConnecting(true);
    try {
      if (!window.ethereum) {
        setMmError("MetaMask not detected. Please install the MetaMask browser extension.");
        setMmConnecting(false);
        return;
      }
      const addr = await connectMetaMask();
      if (!addr) throw new Error("No account returned.");
      setMmAddress(addr);
      const bal = await getMetaMaskUsdcBalance(addr);
      setMmBalance(bal);
    } catch (e) {
      setMmError(e instanceof Error ? e.message : "Could not connect MetaMask.");
    }
    setMmConnecting(false);
  }

  async function refreshMmBalance() {
    if (!mmAddress) return;
    const bal = await getMetaMaskUsdcBalance(mmAddress);
    setMmBalance(bal);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="wallet-panel">
      {/* Tab bar */}
      <div className="wallet-tabs">
        <button
          className={`wallet-tab${tab === "balance" ? " active" : ""}`}
          onClick={() => setTab("balance")}
        >
          My wallet
        </button>
        <button
          className={`wallet-tab${tab === "withdraw" ? " active" : ""}`}
          onClick={() => setTab("withdraw")}
        >
          Withdraw
        </button>
        <button
          className={`wallet-tab${tab === "metamask" ? " active" : ""}`}
          onClick={() => setTab("metamask")}
        >
          MetaMask
        </button>
      </div>

      {/* ── Balance tab ── */}
      {tab === "balance" && (
        <div className="wallet-section">
          {autoLoading ? (
            <p className="wallet-muted">Loading wallet…</p>
          ) : autoAddress ? (
            <>
              <div className="wallet-balance-card">
                <span className="wallet-label">USDC balance (Arc Testnet)</span>
                <span className="wallet-amount">{autoBalance ?? "—"} USDC</span>
                <span className="wallet-address">{truncateAddress(autoAddress)}</span>
              </div>
              <button
                className="wallet-btn-outline"
                onClick={loadAutoWallet}
                style={{ marginTop: "0.75rem" }}
              >
                Refresh
              </button>
            </>
          ) : (
            <p className="wallet-muted">No wallet found.</p>
          )}

          {orders.length > 0 && (
            <>
              <h3 className="wallet-section-title" style={{ marginTop: "1.5rem" }}>
                Order history
              </h3>
              <ul className="wallet-order-list">
                {orders.map((o) => (
                  <li key={o.id} className="wallet-order-item">
                    <span>{o.drugName}</span>
                    <span className="wallet-muted">{o.totalUsdc} USDC</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── Withdraw tab ── */}
      {tab === "withdraw" && (
        <div className="wallet-section">
          <p className="wallet-muted" style={{ marginBottom: "1rem" }}>
            Send USDC from your auto-generated wallet to any external address.
          </p>

          {!localStorage.getItem("arcPrivateKey") && (
            <div className="wallet-warning">
              ⚠ Signing key not found in this browser. You can only withdraw from the
              browser where you first created your wallet.
            </div>
          )}

          <label className="wallet-field-label">Recipient address</label>
          <input
            className="wallet-input"
            type="text"
            placeholder="0x…"
            value={withdrawTo}
            onChange={(e) => setWithdrawTo(e.target.value)}
          />

          <label className="wallet-field-label" style={{ marginTop: "0.75rem" }}>
            Amount (USDC)
          </label>
          <input
            className="wallet-input"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />

          <button
            className="wallet-btn-primary"
            style={{ marginTop: "1rem" }}
            disabled={withdrawStatus === "pending" || !withdrawTo || !withdrawAmount}
            onClick={handleWithdraw}
          >
            {withdrawStatus === "pending" ? "Sending…" : "Send USDC"}
          </button>

          {withdrawMsg && (
            <p
              className={withdrawStatus === "success" ? "wallet-success" : "wallet-error"}
              style={{ marginTop: "0.75rem" }}
            >
              {withdrawMsg}
            </p>
          )}
        </div>
      )}

      {/* ── MetaMask tab ── */}
      {tab === "metamask" && (
        <div className="wallet-section">
          {!mmAddress ? (
            <>
              <p className="wallet-muted" style={{ marginBottom: "1rem" }}>
                Connect your MetaMask wallet to pay for orders from any browser or device.
              </p>
              <button
                className="wallet-btn-metamask"
                onClick={handleConnectMetaMask}
                disabled={mmConnecting}
              >
                {mmConnecting ? "Connecting…" : "🦊 Connect MetaMask"}
              </button>
              {mmError && <p className="wallet-error" style={{ marginTop: "0.75rem" }}>{mmError}</p>}
            </>
          ) : (
            <>
              <div className="wallet-balance-card">
                <span className="wallet-label">MetaMask wallet</span>
                <span className="wallet-amount">{mmBalance ?? "—"} USDC</span>
                <span className="wallet-address">{truncateAddress(mmAddress)}</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button className="wallet-btn-outline" onClick={refreshMmBalance}>
                  Refresh balance
                </button>
                <button
                  className="wallet-btn-outline"
                  onClick={() => {
                    setMmAddress(null);
                    setMmBalance(null);
                  }}
                >
                  Disconnect
                </button>
              </div>
              <p className="wallet-muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                MetaMask is connected. When you check out, you'll be prompted to sign
                the transaction in MetaMask.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}