"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNaira, formatUsdc, nairaToUsdc } from "@/lib/exchange-rate";
import { payUsdcWithArc } from "@/lib/arc/pay-usdc";
import { fetchArcUsdcBalance } from "@/lib/arc/usdc-balance";
import { ensurePatientWallet, fetchPatientWalletAddress } from "@/lib/arc/patient-wallet";
import { formatUsdcDisplay } from "@/lib/arc/usdc-balance";

export type MarketplaceItem = {
  id: number;
  drugName: string;
  description: string;
  quantityOnHand: number;
  unit: string;
  priceNaira: number;
  priceUsdc: number;
  inStock: boolean;
};

export type MarketplaceOrder = {
  id: number;
  drugName: string;
  quantity: number;
  unit: string;
  status: string;
  paymentMethod: string;
  txHash: string | null;
  totalNaira: number;
  totalUsdc: number;
  patientNote: string;
  pharmacistNote: string;
  createdAt: string;
};

type Props = {
  userId: number;
  userEmail: string;
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  onFlash: (msg: string, kind: "success" | "error" | "info") => void;
  onOrdersChanged: () => void;
};

type CheckoutItem = MarketplaceItem;

export function StockMarketplace({ userId, userEmail, api, onFlash, onOrdersChanged }: Props) {
  const [items, setItems] = useState<MarketplaceItem[] | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[] | null>(null);
  const [rateLabel, setRateLabel] = useState<string>("");
  const [ngnPerUsd, setNgnPerUsd] = useState(1580);
  const [query, setQuery] = useState("");
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"card_naira" | "usdc">("card_naira");
  const [paying, setPaying] = useState(false);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [stockRes, ordersRes, rateRes] = await Promise.all([
      api<{ items: MarketplaceItem[] }>("/patient/stock"),
      api<{ orders: MarketplaceOrder[] }>("/patient/orders"),
      fetch("/api/exchange-rate").then((r) => r.json()),
    ]);
    setItems(stockRes.items || []);
    setOrders(ordersRes.orders || []);
    if (rateRes.label) setRateLabel(rateRes.label);
    if (rateRes.ngnPerUsd) setNgnPerUsd(Number(rateRes.ngnPerUsd));
  }, [api]);

  useEffect(() => {
    void load().catch(() => {
      setItems([]);
      setOrders([]);
    });
  }, [load]);

  const refreshBalance = useCallback(async () => {
    try {
      const address = await fetchPatientWalletAddress(api);
      if (!address) {
        setWalletBalance(null);
        return;
      }
      const bal = await fetchArcUsdcBalance(address);
      setWalletBalance(bal);
    } catch {
      setWalletBalance(null);
    }
  }, [api]);

  useEffect(() => {
    if (payment === "usdc") void refreshBalance();
  }, [payment, refreshBalance]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.drugName.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    );
  }, [items, query]);

  const totals = useMemo(() => {
    if (!checkout) return { naira: 0, usdc: 0 };
    const naira = Math.round(checkout.priceNaira * qty * 100) / 100;
    const usdc =
      checkout.priceUsdc > 0
        ? checkout.priceUsdc * qty
        : nairaToUsdc(checkout.priceNaira, ngnPerUsd) * qty;
    return {
      naira,
      usdc: Math.round(usdc * 1_000_000) / 1_000_000,
    };
  }, [checkout, qty, ngnPerUsd]);

  const placeOrder = async () => {
    if (!checkout || !checkout.inStock) return;
    if (qty < 1 || qty > checkout.quantityOnHand) {
      onFlash(`Enter a quantity between 1 and ${checkout.quantityOnHand}.`, "error");
      return;
    }

    setPaying(true);
    try {
      let txHash = "";

      if (payment === "usdc") {
        const { privateKey, address } = await ensurePatientWallet(api, userId, userEmail);
        const bal = Number(await fetchArcUsdcBalance(address));
        if (bal < totals.usdc) {
          onFlash(
            `Insufficient USDC balance (${bal.toFixed(2)} USDC). Need ${totals.usdc.toFixed(2)} USDC. Use the Arc testnet faucet.`,
            "error"
          );
          setPaying(false);
          return;
        }
        if (!confirm(`Pay ${totals.usdc.toFixed(2)} USDC from your Arc wallet?`)) {
          setPaying(false);
          return;
        }
        const pay = await payUsdcWithArc(privateKey, totals.usdc.toFixed(6), "");
        txHash = pay.txHash;
      }

      await api("/patient/orders", {
        method: "POST",
        body: JSON.stringify({
          stockItemId: checkout.id,
          quantity: qty,
          patientNote: note,
          paymentMethod: payment,
          txHash: payment === "usdc" ? txHash : undefined,
        }),
      });

      setCheckout(null);
      setQty(1);
      setNote("");
      onFlash(
        payment === "usdc"
          ? "Payment sent and order placed."
          : "Order placed. Pay at the pharmacy with your card (Naira).",
        "success"
      );
      await load();
      onOrdersChanged();
      if (payment === "usdc") await refreshBalance();
    } catch (err) {
      onFlash((err as Error).message, "error");
    } finally {
      setPaying(false);
    }
  };

  if (items === null || orders === null) {
    return <p className="muted">Loading marketplace…</p>;
  }

  return (
    <div className="marketplace">
      <div className="marketplace-toolbar">
        <input
          type="search"
          className="marketplace-search"
          placeholder="Search medications…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search stock"
        />
        {rateLabel ? <p className="muted marketplace-rate">{rateLabel}</p> : null}
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state muted">No medications match your search.</p>
      ) : (
        <div className="stock-grid">
          {filtered.map((item) => (
            <article key={item.id} className={`stock-card${!item.inStock ? " stock-card--out" : ""}`}>
              <h3>{item.drugName}</h3>
              {item.description ? <p className="muted">{item.description}</p> : null}
              <p className="stock-prices">
                <strong>{formatNaira(item.priceNaira)}</strong>
                <span className="price-sep"> · </span>
                <strong>{formatUsdc(item.priceUsdc || nairaToUsdc(item.priceNaira, ngnPerUsd))}</strong>
                <span className="muted"> / {item.unit}</span>
              </p>
              <p className="muted" style={{ fontSize: "0.88rem" }}>
                {item.inStock ? (
                  <>
                    <strong>{item.quantityOnHand}</strong> available
                  </>
                ) : (
                  <strong>Out of stock</strong>
                )}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!item.inStock}
                onClick={() => {
                  setCheckout(item);
                  setQty(1);
                  setNote("");
                  setPayment("card_naira");
                }}
              >
                Order
              </button>
            </article>
          ))}
        </div>
      )}

      {checkout ? (
        <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="checkout-panel panel">
            <h3 id="checkout-title">Checkout — {checkout.drugName}</h3>
            <div className="form-grid">
              <div>
                <label htmlFor="co-qty">Quantity</label>
                <input
                  id="co-qty"
                  type="number"
                  min={1}
                  max={checkout.quantityOnHand}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="co-note">Note (optional)</label>
                <input id="co-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <p className="checkout-total">
              Total: <strong>{formatNaira(totals.naira)}</strong> · <strong>{formatUsdc(totals.usdc)}</strong>
            </p>
            <fieldset className="payment-methods">
              <legend className="sr-only">Payment method</legend>
              <label className="payment-option">
                <input
                  type="radio"
                  name="pay"
                  checked={payment === "card_naira"}
                  onChange={() => setPayment("card_naira")}
                />
                Pay with Card (Naira) — pay at pharmacy
              </label>
              <label className="payment-option">
                <input
                  type="radio"
                  name="pay"
                  checked={payment === "usdc"}
                  onChange={() => setPayment("usdc")}
                />
                Pay with USDC (ARC Wallet)
                {walletBalance !== null ? (
                  <span className="muted"> — Balance: {formatUsdcDisplay(walletBalance)} USDC</span>
                ) : null}
              </label>
            </fieldset>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" disabled={paying} onClick={() => void placeOrder()}>
                {paying ? "Processing…" : "Confirm order"}
              </button>
              <button type="button" className="btn btn-secondary" disabled={paying} onClick={() => setCheckout(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <h3 style={{ marginTop: "2rem" }}>Your orders</h3>
      {orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.drugName} × {o.quantity}
                  </td>
                  <td>
                    {formatNaira(o.totalNaira)}
                    <br />
                    <span className="muted">{formatUsdc(o.totalUsdc)}</span>
                  </td>
                  <td>
                    {o.paymentMethod === "usdc" ? "USDC" : "Card (₦)"}
                    {o.txHash ? (
                      <div className="muted" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
                        {o.txHash.slice(0, 18)}…
                      </div>
                    ) : null}
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
    </div>
  );
}
