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

type CartLine = {
  stockItemId: number;
  drugName: string;
  unit: string;
  priceNaira: number;
  priceUsdc: number;
  maxQty: number;
  quantity: number;
};

type OrderConfirmation = {
  paymentMethod: "card_naira" | "usdc";
  txHash?: string;
  lines: { drugName: string; quantity: number; totalNaira: number; totalUsdc: number }[];
  totalNaira: number;
  totalUsdc: number;
};

type Props = {
  userId: number;
  userEmail: string;
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  onFlash: (msg: string, kind: "success" | "error" | "info") => void;
  onOrdersChanged: () => void;
};

function unitUsdc(item: { priceNaira: number; priceUsdc: number }, ngnPerUsd: number): number {
  return item.priceUsdc > 0 ? item.priceUsdc : nairaToUsdc(item.priceNaira, ngnPerUsd);
}

function lineTotals(line: CartLine, ngnPerUsd: number) {
  const naira = Math.round(line.priceNaira * line.quantity * 100) / 100;
  const usdc = Math.round(unitUsdc(line, ngnPerUsd) * line.quantity * 1_000_000) / 1_000_000;
  return { naira, usdc };
}

export function StockMarketplace({ userId, userEmail, api, onFlash, onOrdersChanged }: Props) {
  const [items, setItems] = useState<MarketplaceItem[] | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[] | null>(null);
  const [rateLabel, setRateLabel] = useState<string>("");
  const [ngnPerUsd, setNgnPerUsd] = useState(1580);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [addQty, setAddQty] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"card_naira" | "usdc">("card_naira");
  const [paying, setPaying] = useState(false);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  const load = useCallback(async () => {
    const [stockRes, ordersRes, rateRes] = await Promise.all([
      api<{ items: MarketplaceItem[] }>("/patient/stock"),
      api<{ orders: MarketplaceOrder[] }>("/patient/orders"),
      fetch("/api/exchange-rate").then((r) => r.json()),
    ]);
    const stock = stockRes.items || [];
    setItems(stock);
    setOrders(ordersRes.orders || []);
    if (rateRes.label) setRateLabel(rateRes.label);
    if (rateRes.ngnPerUsd) setNgnPerUsd(Number(rateRes.ngnPerUsd));

    setCart((prev) =>
      prev
        .map((line) => {
          const item = stock.find((i) => i.id === line.stockItemId);
          if (!item || !item.inStock) return null;
          return {
            ...line,
            maxQty: item.quantityOnHand,
            quantity: Math.min(line.quantity, item.quantityOnHand),
            priceNaira: item.priceNaira,
            priceUsdc: item.priceUsdc,
          };
        })
        .filter((l): l is CartLine => l !== null)
    );
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
    if (cartOpen && payment === "usdc") void refreshBalance();
  }, [cartOpen, payment, refreshBalance]);

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

  const cartCount = useMemo(() => cart.reduce((n, l) => n + l.quantity, 0), [cart]);

  const cartTotals = useMemo(() => {
    return cart.reduce(
      (acc, line) => {
        const t = lineTotals(line, ngnPerUsd);
        acc.naira += t.naira;
        acc.usdc += t.usdc;
        return acc;
      },
      { naira: 0, usdc: 0 }
    );
  }, [cart, ngnPerUsd]);

  const cartTotalsRounded = useMemo(
    () => ({
      naira: Math.round(cartTotals.naira * 100) / 100,
      usdc: Math.round(cartTotals.usdc * 1_000_000) / 1_000_000,
    }),
    [cartTotals]
  );

  const getAddQty = (id: number) => addQty[id] ?? 1;

  const addToCart = (item: MarketplaceItem) => {
    const qty = Math.floor(getAddQty(item.id));
    if (qty < 1) {
      onFlash("Enter a quantity of at least 1.", "error");
      return;
    }
    if (qty > item.quantityOnHand) {
      onFlash(`Only ${item.quantityOnHand} ${item.unit} available.`, "error");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((l) => l.stockItemId === item.id);
      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, item.quantityOnHand);
        return prev.map((l) =>
          l.stockItemId === item.id
            ? { ...l, quantity: nextQty, maxQty: item.quantityOnHand }
            : l
        );
      }
      return [
        ...prev,
        {
          stockItemId: item.id,
          drugName: item.drugName,
          unit: item.unit,
          priceNaira: item.priceNaira,
          priceUsdc: item.priceUsdc,
          maxQty: item.quantityOnHand,
          quantity: qty,
        },
      ];
    });
    onFlash(`${item.drugName} added to cart.`, "success");
    setAddQty((prev) => ({ ...prev, [item.id]: 1 }));
  };

  const updateCartQty = (stockItemId: number, quantity: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.stockItemId === stockItemId
          ? { ...l, quantity: Math.max(1, Math.min(quantity, l.maxQty)) }
          : l
      )
    );
  };

  const removeFromCart = (stockItemId: number) => {
    setCart((prev) => prev.filter((l) => l.stockItemId !== stockItemId));
  };

  const checkoutCart = async () => {
    if (cart.length === 0) {
      onFlash("Your cart is empty.", "error");
      return;
    }

    setPaying(true);
    try {
      let txHash = "";

      if (payment === "usdc") {
        const { privateKey, address } = await ensurePatientWallet(api, userId, userEmail);
        const bal = Number(await fetchArcUsdcBalance(address));
        if (bal < cartTotalsRounded.usdc) {
          onFlash(
            `Insufficient USDC balance (${bal.toFixed(2)} USDC). Need ${cartTotalsRounded.usdc.toFixed(2)} USDC.`,
            "error"
          );
          setPaying(false);
          return;
        }
        if (
          !confirm(
            `Pay ${cartTotalsRounded.usdc.toFixed(2)} USDC for ${cart.length} medication(s) in one transaction?`
          )
        ) {
          setPaying(false);
          return;
        }
        const pay = await payUsdcWithArc(api, privateKey, cartTotalsRounded.usdc.toFixed(6), "");
        txHash = pay.txHash;
      }

      await api("/patient/orders/batch", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })),
          patientNote: note,
          paymentMethod: payment,
          txHash: payment === "usdc" ? txHash : undefined,
        }),
      });

      const confirmLines = cart.map((l) => {
        const t = lineTotals(l, ngnPerUsd);
        return { drugName: l.drugName, quantity: l.quantity, totalNaira: t.naira, totalUsdc: t.usdc };
      });

      setConfirmation({
        paymentMethod: payment,
        txHash: payment === "usdc" ? txHash : undefined,
        lines: confirmLines,
        totalNaira: cartTotalsRounded.naira,
        totalUsdc: cartTotalsRounded.usdc,
      });

      setCart([]);
      setCartOpen(false);
      setNote("");
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
        <button
          type="button"
          className="cart-trigger"
          onClick={() => setCartOpen(true)}
          aria-label={`Open cart, ${cartCount} items`}
        >
          <svg className="cart-trigger-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6h15l-1.5 9h-11L6 6zM6 6l-1-2H2M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {cartCount > 0 ? <span className="cart-badge">{cartCount > 99 ? "99+" : cartCount}</span> : null}
        </button>
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
                <strong>{formatUsdc(unitUsdc(item, ngnPerUsd))}</strong>
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
              {item.inStock ? (
                <div className="add-to-cart-row">
                  <div>
                    <label className="sr-only" htmlFor={`qty-${item.id}`}>
                      Quantity for {item.drugName}
                    </label>
                    <input
                      id={`qty-${item.id}`}
                      type="number"
                      min={1}
                      max={item.quantityOnHand}
                      value={getAddQty(item.id)}
                      onChange={(e) =>
                        setAddQty((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => addToCart(item)}>
                    Add to cart
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {cartOpen ? (
        <div className="cart-overlay" role="presentation" onClick={() => setCartOpen(false)}>
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="cart-drawer-header">
              <h3 id="cart-title">Your cart</h3>
              <button type="button" className="btn-small cart-close" onClick={() => setCartOpen(false)}>
                Close
              </button>
            </header>

            {cart.length === 0 ? (
              <p className="muted cart-empty">Your cart is empty.</p>
            ) : (
              <>
                <ul className="cart-lines">
                  {cart.map((line) => {
                    const t = lineTotals(line, ngnPerUsd);
                    return (
                      <li key={line.stockItemId} className="cart-line">
                        <div className="cart-line-head">
                          <strong>{line.drugName}</strong>
                          <button
                            type="button"
                            className="btn-small cart-line-remove"
                            onClick={() => removeFromCart(line.stockItemId)}
                          >
                            Remove
                          </button>
                        </div>
                        <p className="muted cart-line-unit">
                          {formatNaira(line.priceNaira)} · {formatUsdc(unitUsdc(line, ngnPerUsd))} / {line.unit}
                        </p>
                        <div className="cart-line-qty">
                          <label htmlFor={`cart-qty-${line.stockItemId}`}>Qty</label>
                          <input
                            id={`cart-qty-${line.stockItemId}`}
                            type="number"
                            min={1}
                            max={line.maxQty}
                            value={line.quantity}
                            onChange={(e) => updateCartQty(line.stockItemId, Number(e.target.value))}
                          />
                          <span className="muted">max {line.maxQty}</span>
                        </div>
                        <p className="cart-line-total">
                          {formatNaira(t.naira)} · {formatUsdc(t.usdc)}
                        </p>
                      </li>
                    );
                  })}
                </ul>

                <div className="cart-checkout">
                  <label htmlFor="cart-note">Note for pharmacist (optional)</label>
                  <input id="cart-note" value={note} onChange={(e) => setNote(e.target.value)} />

                  <p className="cart-grand-total">
                    Total: <strong>{formatNaira(cartTotalsRounded.naira)}</strong>
                    <br />
                    <strong>{formatUsdc(cartTotalsRounded.usdc)}</strong>
                  </p>

                  <fieldset className="payment-methods">
                    <legend className="sr-only">Payment method</legend>
                    <label className="payment-option">
                      <input
                        type="radio"
                        name="cart-pay"
                        checked={payment === "card_naira"}
                        onChange={() => setPayment("card_naira")}
                      />
                      Pay with Card (Naira) — pay at pharmacy
                    </label>
                    <label className="payment-option">
                      <input
                        type="radio"
                        name="cart-pay"
                        checked={payment === "usdc"}
                        onChange={() => setPayment("usdc")}
                      />
                      Pay with USDC (one transaction for all items)
                      {walletBalance !== null ? (
                        <span className="muted"> — Balance: {formatUsdcDisplay(walletBalance)} USDC</span>
                      ) : null}
                    </label>
                  </fieldset>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    disabled={paying}
                    onClick={() => void checkoutCart()}
                  >
                    {paying ? "Processing…" : "Checkout"}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {confirmation ? (
        <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="checkout-panel panel order-confirmation">
            <h3 id="confirm-title">Order confirmed</h3>
            <p className="panel-sub">
              {confirmation.paymentMethod === "usdc"
                ? "Your USDC payment was received and your order is confirmed."
                : "Your order was placed. Pay with your card (Naira) at the pharmacy."}
            </p>
            <ul className="confirm-lines">
              {confirmation.lines.map((line) => (
                <li key={`${line.drugName}-${line.quantity}`}>
                  <strong>{line.drugName}</strong> × {line.quantity} — {formatNaira(line.totalNaira)} ·{" "}
                  {formatUsdc(line.totalUsdc)}
                </li>
              ))}
            </ul>
            <p className="checkout-total">
              Total paid: <strong>{formatNaira(confirmation.totalNaira)}</strong>
              <br />
              <strong>{formatUsdc(confirmation.totalUsdc)}</strong>
            </p>
            {confirmation.txHash ? (
              <p className="muted confirm-tx" style={{ wordBreak: "break-all", fontSize: "0.82rem" }}>
                Transaction: {confirmation.txHash}
              </p>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => setConfirmation(null)}>
              Continue shopping
            </button>
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
