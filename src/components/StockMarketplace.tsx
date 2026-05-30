"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { MedicationCard } from "@/components/MedicationCard";
import { formatNaira, formatUsdc, nairaToUsdc } from "@/lib/exchange-rate";
import { getCategoryMeta } from "@/lib/marketplace-categories";
import type { StockItemDto, StockPackDto } from "@/lib/stock-catalog";
import {
  connectMetaMask,
  fetchMetaMaskUsdcBalance,
  hasMetaMask,
  sendMetaMaskUsdc,
} from "@/lib/arc/metamask-client";
import { payUsdcWithArc } from "@/lib/arc/pay-usdc";
import { fetchArcUsdcBalance, formatUsdcDisplay } from "@/lib/arc/usdc-balance";
import { ensurePatientWallet, fetchPatientWalletAddress } from "@/lib/arc/patient-wallet";
import {
  getPaymentWallet,
  getStoredMetaMaskAddress,
  setPaymentWallet,
  setStoredMetaMaskAddress,
} from "@/lib/arc/payment-preference";
import {
  executeCrossChainCheckout,
  type CctpBridgeToken,
  type CrossChainProgress,
} from "@/lib/arc/cctp-bridge-client";
import { CrossChainPaymentProgress } from "@/components/CrossChainPaymentProgress";

export type MarketplaceItem = StockItemDto;

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
  packLabel?: string;
  createdAt: string;
};

type CategorySummary = {
  id: string;
  label: string;
  color: string;
  accent: string;
  count: number;
};

type CartLine = {
  stockItemId: number;
  packId: number;
  packLabel: string;
  drugName: string;
  unit: string;
  priceNaira: number;
  priceUsdc: number;
  maxQty: number;
  quantity: number;
};

type OrderConfirmation = {
  paymentMethod: "card_naira" | "usdc" | "metamask" | "cctp";
  txHash?: string;
  cctpToken?: CctpBridgeToken;
  lines: { drugName: string; packLabel: string; quantity: number; totalNaira: number; totalUsdc: number }[];
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

function unitUsdc(pack: { priceNaira: number; priceUsdc: number }, ngnPerUsd: number): number {
  return pack.priceUsdc > 0 ? pack.priceUsdc : nairaToUsdc(pack.priceNaira, ngnPerUsd);
}

function lineTotals(line: CartLine, ngnPerUsd: number) {
  const naira = Math.round(line.priceNaira * line.quantity * 100) / 100;
  const usdc = Math.round(unitUsdc(line, ngnPerUsd) * line.quantity * 1_000_000) / 1_000_000;
  return { naira, usdc };
}

function defaultPackId(item: MarketplaceItem): number {
  return item.packs[0]?.id ?? 0;
}

function getPack(item: MarketplaceItem, packId: number): StockPackDto {
  return item.packs.find((p) => p.id === packId) ?? item.packs[0];
}

export function StockMarketplace({ userId, userEmail, api, onFlash, onOrdersChanged }: Props) {
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [items, setItems] = useState<MarketplaceItem[] | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[] | null>(null);
  const [view, setView] = useState<"home" | string>("home");
  const [rateLabel, setRateLabel] = useState("");
  const [ngnPerUsd, setNgnPerUsd] = useState(1580);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedPack, setSelectedPack] = useState<Record<number, number>>({});
  const [addQty, setAddQty] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"card_naira" | "usdc" | "metamask" | "cctp">("card_naira");
  const [paying, setPaying] = useState(false);
  const [cctpToken, setCctpToken] = useState<CctpBridgeToken>("USDC");
  const [cctpProgress, setCctpProgress] = useState<CrossChainProgress | null>(null);
  const [cctpError, setCctpError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [metaMaskAddress, setMetaMaskAddress] = useState<string | null>(null);
  const [metaMaskBalance, setMetaMaskBalance] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [stockRes, ordersRes, rateRes] = await Promise.all([
      api<{ categories: CategorySummary[]; items: MarketplaceItem[] }>("/patient/stock"),
      api<{ orders: MarketplaceOrder[] }>("/patient/orders"),
      fetch("/api/exchange-rate").then((r) => r.json()),
    ]);
    const stock = stockRes.items || [];
    setCategories(stockRes.categories || []);
    setItems(stock);
    setOrders(ordersRes.orders || []);
    if (rateRes.label) setRateLabel(rateRes.label);
    if (rateRes.ngnPerUsd) setNgnPerUsd(Number(rateRes.ngnPerUsd));

    setCart((prev) =>
      prev
        .map((line) => {
          const item = stock.find((i) => i.id === line.stockItemId);
          if (!item || !item.inStock) return null;
          const pack = item.packs.find((p) => p.id === line.packId) ?? item.packs[0];
          if (!pack) return null;
          return {
            ...line,
            packLabel: pack.label,
            maxQty: item.quantityOnHand,
            quantity: Math.min(line.quantity, item.quantityOnHand),
            priceNaira: pack.priceNaira,
            priceUsdc: pack.priceUsdc,
          };
        })
        .filter((l): l is CartLine => l !== null)
    );
  }, [api]);

  useEffect(() => {
    void load().catch(() => {
      setCategories([]);
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
    const stored = getStoredMetaMaskAddress();
    if (stored) setMetaMaskAddress(stored);
    const pref = getPaymentWallet();
    if (pref === "metamask" && stored) setPayment("metamask");
  }, []);

  useEffect(() => {
    const onPref = () => {
      const pref = getPaymentWallet();
      if (pref === "metamask" && getStoredMetaMaskAddress()) {
        setPayment("metamask");
      } else if (pref === "auto") {
        setPayment((p) => (p === "metamask" ? "usdc" : p));
      }
    };
    const onMm = () => {
      const stored = getStoredMetaMaskAddress();
      setMetaMaskAddress(stored);
      if (stored) void fetchMetaMaskUsdcBalance(stored).then(setMetaMaskBalance).catch(() => {});
      else setMetaMaskBalance(null);
    };
    window.addEventListener("jerlyd-payment-wallet", onPref);
    window.addEventListener("jerlyd-metamask-address", onMm);
    return () => {
      window.removeEventListener("jerlyd-payment-wallet", onPref);
      window.removeEventListener("jerlyd-metamask-address", onMm);
    };
  }, []);

  // Fetch MetaMask USDC balance when cart opens and MetaMask is connected
  useEffect(() => {
    if (!metaMaskAddress || !cartOpen) return;
    fetchMetaMaskUsdcBalance(metaMaskAddress)
      .then(setMetaMaskBalance)
      .catch(() => setMetaMaskBalance(null));
  }, [metaMaskAddress, cartOpen]);

  useEffect(() => {
    if (cartOpen && payment === "usdc") void refreshBalance();
  }, [cartOpen, payment, refreshBalance]);

  const activeCategory = view === "home" ? null : getCategoryMeta(view);

  const categoryItems = useMemo(() => {
    if (!items || view === "home") return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.category === view && i.inStock)
      .filter(
        (i) =>
          !q ||
          i.drugName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.packs.some((p) => p.label.toLowerCase().includes(q))
      );
  }, [items, view, query]);

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.label.toLowerCase().includes(q));
  }, [categories, query]);

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

  const getSelectedPackId = (item: MarketplaceItem) => selectedPack[item.id] ?? defaultPackId(item);
  const getAddQty = (id: number) => addQty[id] ?? 1;

  const addToCart = (item: MarketplaceItem) => {
    const packId = getSelectedPackId(item);
    const pack = getPack(item, packId);
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
      const existing = prev.find((l) => l.stockItemId === item.id && l.packId === packId);
      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, item.quantityOnHand);
        return prev.map((l) =>
          l.stockItemId === item.id && l.packId === packId
            ? { ...l, quantity: nextQty, maxQty: item.quantityOnHand }
            : l
        );
      }
      return [
        ...prev,
        {
          stockItemId: item.id,
          packId,
          packLabel: pack.label,
          drugName: item.drugName,
          unit: item.unit,
          priceNaira: pack.priceNaira,
          priceUsdc: pack.priceUsdc,
          maxQty: item.quantityOnHand,
          quantity: qty,
        },
      ];
    });
    onFlash(`${item.drugName} (${pack.label}) added to cart.`, "success");
    setAddQty((prev) => ({ ...prev, [item.id]: 1 }));
  };

  const updateCartQty = (stockItemId: number, packId: number, quantity: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.stockItemId === stockItemId && l.packId === packId
          ? { ...l, quantity: Math.max(1, Math.min(quantity, l.maxQty)) }
          : l
      )
    );
  };

  const removeFromCart = (stockItemId: number, packId: number) => {
    setCart((prev) => prev.filter((l) => !(l.stockItemId === stockItemId && l.packId === packId)));
  };

  const incrementQty = (stockItemId: number, packId: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.stockItemId === stockItemId && l.packId === packId) {
          const newQty = l.quantity + 1;
          if (newQty > l.maxQty) {
            onFlash(`Max stock reached (${l.maxQty} ${l.unit} available)`, "error");
            return l;
          }
          return { ...l, quantity: newQty };
        }
        return l;
      })
    );
  };

  const decrementQty = (stockItemId: number, packId: number) => {
    setCart((prev) => {
      const line = prev.find((l) => l.stockItemId === stockItemId && l.packId === packId);
      if (!line) return prev;
      if (line.quantity <= 1) {
        return prev.filter((l) => !(l.stockItemId === stockItemId && l.packId === packId));
      }
      return prev.map((l) =>
        l.stockItemId === stockItemId && l.packId === packId
          ? { ...l, quantity: l.quantity - 1 }
          : l
      );
    });
  };

  const connectMetaMaskWallet = async () => {
    if (!hasMetaMask()) {
      onFlash("MetaMask not found. Please install the MetaMask browser extension.", "error");
      return;
    }
    try {
      const addr = await connectMetaMask();
      setMetaMaskAddress(addr);
      setStoredMetaMaskAddress(addr);
      setPayment("metamask");
      setPaymentWallet("metamask");
      const bal = await fetchMetaMaskUsdcBalance(addr);
      setMetaMaskBalance(bal);
    } catch {
      onFlash("MetaMask connection was rejected.", "error");
    }
  };

  const checkoutCart = async () => {
    if (cart.length === 0) {
      onFlash("Your cart is empty.", "error");
      return;
    }

    setPaying(true);
    try {
      let txHash = "";

      if (payment === "metamask") {
        if (!metaMaskAddress) {
          throw new Error("MetaMask is not connected. Connect it under My wallet or below.");
        }
        if (
          !confirm(
            `Pay ${cartTotalsRounded.usdc.toFixed(2)} USDC via MetaMask for ${cart.length} medication(s)?`
          )
        ) {
          setPaying(false);
          return;
        }
        txHash = await sendMetaMaskUsdc(metaMaskAddress, cartTotalsRounded.usdc);
      } else if (payment === "usdc") {
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
      } else if (payment === "cctp") {
        if (!metaMaskAddress && !hasMetaMask()) {
          throw new Error("Connect MetaMask on Ethereum Sepolia to pay from another chain.");
        }
        setCctpError(null);
        setCctpProgress({
          step: "initiated",
          detail: "Starting cross-chain checkout…",
        });
        const result = await executeCrossChainCheckout({
          api,
          userId,
          userEmail,
          amountUsdc: cartTotalsRounded.usdc,
          token: cctpToken,
          onProgress: setCctpProgress,
        });
        txHash = result.paymentTxHash;
      }

      await api("/patient/orders/batch", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((l) => ({
            stockItemId: l.stockItemId,
            packId: l.packId,
            quantity: l.quantity,
          })),
          patientNote: note,
          paymentMethod: payment,
          txHash:
            payment === "usdc" || payment === "metamask" || payment === "cctp" ? txHash : undefined,
        }),
      });

      const confirmLines = cart.map((l) => {
        const t = lineTotals(l, ngnPerUsd);
        return {
          drugName: l.drugName,
          packLabel: l.packLabel,
          quantity: l.quantity,
          totalNaira: t.naira,
          totalUsdc: t.usdc,
        };
      });

      setConfirmation({
        paymentMethod: payment,
        txHash:
          payment === "usdc" || payment === "metamask" || payment === "cctp" ? txHash : undefined,
        cctpToken: payment === "cctp" ? cctpToken : undefined,
        lines: confirmLines,
        totalNaira: cartTotalsRounded.naira,
        totalUsdc: cartTotalsRounded.usdc,
      });

      setCart([]);
      setCartOpen(false);
      setNote("");
      setCctpProgress(null);
      setCctpError(null);
      await load();
      onOrdersChanged();
      if (payment === "usdc") await refreshBalance();
      if (payment === "metamask" && metaMaskAddress) {
        fetchMetaMaskUsdcBalance(metaMaskAddress).then(setMetaMaskBalance).catch(() => {});
      }
    } catch (err) {
      const message = (err as Error).message;
      if (payment === "cctp") {
        setCctpError(message);
      }
      onFlash(message, "error");
    } finally {
      setPaying(false);
    }
  };

  if (categories === null || items === null || orders === null) {
    return <p className="muted">Loading marketplace…</p>;
  }

  const goBackToCategories = () => {
    setView("home");
    setQuery("");
  };

  const categoryProductCount =
    view !== "home" ? (categories.find((c) => c.id === view)?.count ?? categoryItems.length) : 0;

  return (
    <div className="marketplace">
      <div className="marketplace-toolbar">
        <input
          type="search"
          className="marketplace-search"
          placeholder={view === "home" ? "Search categories…" : "Search in this category…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={view === "home" ? "Search categories" : "Search medications"}
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

      {view === "home" ? (
        <>
          <p className="marketplace-intro muted">Browse medications by category.</p>
          {filteredCategories.length === 0 ? (
            <p className="empty-state muted">No categories match your search.</p>
          ) : (
            <div className="category-grid">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="category-card"
                  style={{ "--cat-color": cat.color, "--cat-accent": cat.accent } as CSSProperties}
                  onClick={() => {
                    setView(cat.id);
                    setQuery("");
                  }}
                >
                  <span className="category-card-icon" style={{ color: cat.color }}>
                    <CategoryIcon categoryId={cat.id} />
                  </span>
                  <span className="category-card-body">
                    <strong>{cat.label}</strong>
                    <span className="muted">
                      {cat.count} {cat.count === 1 ? "product" : "products"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="category-page-shell">
            <button
              type="button"
              className="category-page-back"
              onClick={goBackToCategories}
              aria-label="Back to category list"
            >
              ← Back to Categories
            </button>
            {activeCategory ? (
              <header
                className="category-page-header"
                style={{ "--cat-color": activeCategory.color, "--cat-accent": activeCategory.accent } as CSSProperties}
              >
                <span className="category-page-icon" style={{ color: activeCategory.color }}>
                  <CategoryIcon categoryId={activeCategory.id} />
                </span>
                <div className="category-page-heading">
                  <h2 className="category-page-title">{activeCategory.label}</h2>
                  <p className="category-page-count">
                    {query.trim()
                      ? `${categoryItems.length} ${categoryItems.length === 1 ? "result" : "results"}`
                      : `${categoryProductCount} ${categoryProductCount === 1 ? "product" : "products"}`}
                  </p>
                </div>
              </header>
            ) : null}
          </div>

          {categoryItems.length === 0 ? (
            <p className="empty-state muted">No medications in this category right now.</p>
          ) : (
            <div className="med-grid">
              {categoryItems.map((item) => {
                const packId = getSelectedPackId(item);
                const pack = getPack(item, packId);
                return (
                  <MedicationCard
                    key={item.id}
                    item={item}
                    packId={packId}
                    pack={pack}
                    quantity={getAddQty(item.id)}
                    ngnPerUsd={ngnPerUsd}
                    onPackChange={(id) => setSelectedPack((prev) => ({ ...prev, [item.id]: id }))}
                    onQuantityChange={(qty) => setAddQty((prev) => ({ ...prev, [item.id]: qty }))}
                    onAddToCart={() => addToCart(item)}
                  />
                );
              })}
            </div>
          )}
        </>
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
              <h3 id="cart-title">
                Your cart
                <span className="cart-item-count">
                  {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
              </h3>
              <button type="button" className="btn-small cart-close" onClick={() => setCartOpen(false)}>
                Close
              </button>
            </header>

            {cart.length === 0 ? (
              <div className="cart-empty-state">
                <div className="cart-empty-icon" aria-hidden>
                  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
                    <rect x="20" y="24" width="24" height="16" rx="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />
                    <circle cx="44" cy="40" r="2" fill="currentColor" fillOpacity="0.3" />
                    <path d="M32 28v8M28 32h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
                  </svg>
                </div>
                <p className="cart-empty-text">Your cart is empty</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCartOpen(false)}
                >
                  Browse medications
                </button>
              </div>
            ) : (
              <>
                <ul className="cart-lines">
                  {cart.map((line) => {
                    const t = lineTotals(line, ngnPerUsd);
                    return (
                      <li key={`${line.stockItemId}-${line.packId}`} className="cart-line">
                        <div className="cart-line-head">
                          <strong>{line.drugName}</strong>
                          <button
                            type="button"
                            className="btn-small cart-line-remove"
                            onClick={() => removeFromCart(line.stockItemId, line.packId)}
                          >
                            Remove
                          </button>
                        </div>
                        <p className="muted cart-line-unit">
                          {line.packLabel} · {formatNaira(line.priceNaira)} ·{" "}
                          {formatUsdc(unitUsdc(line, ngnPerUsd))} / {line.unit}
                        </p>
                        <div className="cart-line-qty">
                          <button
                            type="button"
                            className="qty-stepper-btn qty-stepper-btn--minus"
                            aria-label="Decrease quantity"
                            onClick={() => {
                              if (line.quantity === 1) {
                                removeFromCart(line.stockItemId, line.packId);
                              } else {
                                updateCartQty(line.stockItemId, line.packId, line.quantity - 1);
                              }
                            }}
                          >
                            −
                          </button>
                          <span className="qty-display">{line.quantity}</span>
                          <button
                            type="button"
                            className="qty-stepper-btn qty-stepper-btn--plus"
                            aria-label="Increase quantity"
                            disabled={line.quantity >= line.maxQty}
                            onClick={() => {
                              updateCartQty(line.stockItemId, line.packId, Math.min(line.quantity + 1, line.maxQty));
                            }}
                          >
                            +
                          </button>
                          <span className="muted qty-max-label">max {line.maxQty}</span>
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

                  <div className="cart-summary">
                    <p className="cart-summary-count">
                      {cartCount} {cartCount === 1 ? "item" : "items"} in your cart
                    </p>
                    <p className="cart-grand-total">
                      Total: <strong>{formatNaira(cartTotalsRounded.naira)}</strong>
                      <br />
                      <strong>{formatUsdc(cartTotalsRounded.usdc)}</strong>
                    </p>
                  </div>

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
                        onChange={() => {
                          setPayment("usdc");
                          setPaymentWallet("auto");
                        }}
                      />
                      Pay with USDC (auto wallet)
                      {walletBalance !== null ? (
                        <span className="muted"> — Balance: {formatUsdcDisplay(walletBalance)} USDC</span>
                      ) : null}
                    </label>
                    <label className="payment-option">
                      <input
                        type="radio"
                        name="cart-pay"
                        checked={payment === "metamask"}
                        disabled={!metaMaskAddress}
                        onChange={() => {
                          setPayment("metamask");
                          setPaymentWallet("metamask");
                        }}
                      />
                      Pay with USDC (MetaMask)
                      {metaMaskAddress ? (
                        <span className="muted">
                          {" "}
                          — {metaMaskAddress.slice(0, 6)}…{metaMaskAddress.slice(-4)}
                          {metaMaskBalance !== null ? ` · ${metaMaskBalance} USDC` : ""}
                        </span>
                      ) : (
                        <span className="muted"> — connect MetaMask first</span>
                      )}
                    </label>
                    {!metaMaskAddress ? (
                      <button
                        type="button"
                        className="wallet-btn-metamask cart-metamask-connect"
                        onClick={() => void connectMetaMaskWallet()}
                      >
                        Connect MetaMask
                      </button>
                    ) : null}
                    <label className="payment-option payment-option--cctp">
                      <input
                        type="radio"
                        name="cart-pay"
                        checked={payment === "cctp"}
                        onChange={() => {
                          setPayment("cctp");
                          setCctpError(null);
                        }}
                      />
                      <span>
                        <strong>Pay from another chain</strong>
                        <span className="muted">
                          {" "}
                          — Bridge {formatUsdc(cartTotalsRounded.usdc)} via CCTP (Sepolia → Arc)
                        </span>
                      </span>
                    </label>
                    {payment === "cctp" ? (
                      <div className="cctp-checkout-options">
                        <p className="wallet-muted cctp-checkout-hint">
                          Uses Circle Bridge Kit (CCTP). MetaMask on{" "}
                          <strong>Ethereum Sepolia</strong> must hold enough{" "}
                          {cctpToken} plus gas. Funds mint to your in-built Arc wallet, then USDC
                          is sent to the pharmacy.
                        </p>
                        <fieldset className="cctp-token-picker">
                          <legend className="sr-only">Bridge token</legend>
                          <label className="cctp-token-option">
                            <input
                              type="radio"
                              name="cctp-token"
                              checked={cctpToken === "USDC"}
                              onChange={() => setCctpToken("USDC")}
                              disabled={paying}
                            />
                            USDC
                          </label>
                          <label className="cctp-token-option">
                            <input
                              type="radio"
                              name="cctp-token"
                              checked={cctpToken === "EURC"}
                              onChange={() => setCctpToken("EURC")}
                              disabled={paying}
                            />
                            EURC
                          </label>
                        </fieldset>
                        {!metaMaskAddress ? (
                          <button
                            type="button"
                            className="wallet-btn-metamask cart-metamask-connect"
                            onClick={() => void connectMetaMaskWallet()}
                          >
                            Connect MetaMask (Sepolia)
                          </button>
                        ) : null}
                        {(paying || cctpProgress) && (
                          <CrossChainPaymentProgress progress={cctpProgress} error={cctpError} />
                        )}
                      </div>
                    ) : null}
                  </fieldset>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    disabled={paying}
                    onClick={() => void checkoutCart()}
                  >
                    {paying
                      ? payment === "cctp"
                        ? "Bridging & paying…"
                        : "Processing…"
                      : "Checkout"}
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
              {confirmation.paymentMethod === "cctp"
                ? `Your cross-chain CCTP payment (${confirmation.cctpToken ?? "USDC"}) was bridged from Ethereum Sepolia to Arc and your order is confirmed.`
                : confirmation.paymentMethod === "usdc" || confirmation.paymentMethod === "metamask"
                  ? `Your USDC payment was received${confirmation.paymentMethod === "metamask" ? " via MetaMask" : ""} and your order is confirmed.`
                  : "Your order was placed. Pay with your card (Naira) at the pharmacy."}
            </p>
            <ul className="confirm-lines">
              {confirmation.lines.map((line) => (
                <li key={`${line.drugName}-${line.packLabel}-${line.quantity}`}>
                  <strong>{line.drugName}</strong> ({line.packLabel}) × {line.quantity} —{" "}
                  {formatNaira(line.totalNaira)} · {formatUsdc(line.totalUsdc)}
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
                    {o.drugName}
                    {o.packLabel ? <span className="muted"> · {o.packLabel}</span> : null} × {o.quantity}
                  </td>
                  <td>
                    {formatNaira(o.totalNaira)}
                    <br />
                    <span className="muted">{formatUsdc(o.totalUsdc)}</span>
                  </td>
                  <td>
                    {o.paymentMethod === "usdc"
                      ? "USDC (auto)"
                      : o.paymentMethod === "metamask"
                        ? "MetaMask"
                        : o.paymentMethod === "cctp"
                          ? "CCTP (cross-chain)"
                          : "Card (₦)"}
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