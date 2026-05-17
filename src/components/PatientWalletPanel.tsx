"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchArcUsdcBalance, formatUsdcDisplay } from "@/lib/arc/usdc-balance";
import { ensurePatientWallet, fetchPatientWalletAddress, truncateAddress } from "@/lib/arc/patient-wallet";
import type { MarketplaceOrder } from "@/components/StockMarketplace";

type Props = {
  userId: number;
  email: string;
  walletAddress: string | null | undefined;
  orders: MarketplaceOrder[];
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  onWalletLinked: () => void;
};

export function PatientWalletPanel({ userId, email, walletAddress, orders, api, onWalletLinked }: Props) {
  const [address, setAddress] = useState<string | null>(walletAddress || null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadBalance = useCallback(async (addr: `0x${string}`) => {
    setBalanceLoading(true);
    try {
      const bal = await fetchArcUsdcBalance(addr);
      setBalance(bal);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const syncWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dbAddress = await fetchPatientWalletAddress(api);

      if (dbAddress) {
        setAddress(dbAddress);
        await loadBalance(dbAddress);
        return;
      }

      const { address: addr, created } = await ensurePatientWallet(api, userId, email);
      setAddress(addr);
      await loadBalance(addr);
      if (created) onWalletLinked();
    } catch (err) {
      setError((err as Error).message);
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [userId, email, api, onWalletLinked, loadBalance]);

  useEffect(() => {
    void syncWallet();
  }, [syncWallet]);

  useEffect(() => {
    if (!address || loading) return;
    void loadBalance(address as `0x${string}`);
  }, [orders, address, loading, loadBalance]);

  const usdcOrders = orders.filter((o) => o.paymentMethod === "usdc");

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const balanceLabel =
    balance !== null
      ? `${formatUsdcDisplay(balance)} USDC`
      : balanceLoading
        ? "Updating…"
        : "—";

  return (
    <section className="panel wallet-panel">
      <h2>My Arc wallet</h2>
      <p className="panel-sub">
        Testnet wallet linked to your account ({email}). Fund it from the{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Circle faucet
        </a>{" "}
        to pay with USDC.
      </p>
      {error ? (
        <p className="flash flash--error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="muted">Loading wallet…</p>
      ) : (
        <>
          <dl className="wallet-stats">
            <div>
              <dt>Address</dt>
              <dd>
                <code>{address ? truncateAddress(address) : "—"}</code>
                {address ? (
                  <button type="button" className="btn-small" style={{ marginLeft: "0.5rem" }} onClick={() => void copyAddress()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>USDC balance (Arc testnet)</dt>
              <dd>
                <strong>{balanceLabel}</strong>
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!address || balanceLoading}
            onClick={() => {
              if (address) void loadBalance(address as `0x${string}`);
            }}
          >
            {balanceLoading ? "Refreshing…" : "Refresh balance"}
          </button>
        </>
      )}
      <h3 style={{ marginTop: "1.5rem" }}>USDC payment history</h3>
      {usdcOrders.length === 0 ? (
        <p className="muted">No USDC orders yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Amount</th>
                <th>Transaction</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {usdcOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.drugName} × {o.quantity}
                  </td>
                  <td>{Number(o.totalUsdc).toFixed(2)} USDC</td>
                  <td className="muted" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
                    {o.txHash || "—"}
                  </td>
                  <td>
                    <span className={`status-pill status-pill--${o.status}`}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
