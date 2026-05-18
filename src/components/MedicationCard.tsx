"use client";

import { PillPlaceholder } from "@/components/CategoryIcon";
import { formatNaira, formatUsdc, nairaToUsdc } from "@/lib/exchange-rate";
import type { StockItemDto, StockPackDto } from "@/lib/stock-catalog";

export type MedicationCardItem = StockItemDto;

type Props = {
  item: MedicationCardItem;
  packId: number;
  pack: StockPackDto;
  quantity: number;
  ngnPerUsd: number;
  onPackChange: (packId: number) => void;
  onQuantityChange: (quantity: number) => void;
  onAddToCart: () => void;
};

function unitUsdc(pack: { priceNaira: number; priceUsdc: number }, ngnPerUsd: number): number {
  return pack.priceUsdc > 0 ? pack.priceUsdc : nairaToUsdc(pack.priceNaira, ngnPerUsd);
}

function stockLevel(qty: number): "high" | "low" {
  return qty >= 10 ? "high" : "low";
}

export function MedicationCard({
  item,
  packId,
  pack,
  quantity,
  ngnPerUsd,
  onPackChange,
  onQuantityChange,
  onAddToCart,
}: Props) {
  const usdcPrice = unitUsdc(pack, ngnPerUsd);
  const hasPackOptions = item.packs.length > 1 || (item.packs[0] && item.packs[0].id !== 0);
  const stock = stockLevel(item.quantityOnHand);

  return (
    <article className="med-card">
      <div className="med-card-media">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="med-card-img" />
        ) : (
          <div className="med-card-media-fallback" aria-hidden>
            <PillPlaceholder className="med-card-placeholder" />
          </div>
        )}
      </div>

      <div className="med-card-body">
        <h3 className="med-card-name">{item.drugName}</h3>

        {item.description ? <p className="med-card-desc">{item.description}</p> : null}

        <p className="med-card-pack-badge">
          <span className="med-card-pack-badge-label">Pack</span>
          <span className="med-card-pack-badge-value">{pack.label}</span>
        </p>

        <div className="med-card-pricing">
          <span className="med-card-price-main">{formatNaira(pack.priceNaira)}</span>
          <span className="med-card-price-usdc">{formatUsdc(usdcPrice)} USDC</span>
        </div>

        <p className={`med-card-stock med-card-stock--${stock}`}>
          <span className="med-card-stock-dot" aria-hidden />
          <span>
            <strong>{item.quantityOnHand}</strong> in stock
            <span className="med-card-stock-unit"> · {item.unit}</span>
          </span>
        </p>

        {hasPackOptions ? (
          <div className="med-card-pack">
            <label htmlFor={`pack-${item.id}`}>Choose pack size</label>
            <select
              id={`pack-${item.id}`}
              className="med-card-pack-select"
              value={packId}
              onChange={(e) => onPackChange(Number(e.target.value))}
            >
              {item.packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {formatNaira(p.priceNaira)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="med-card-actions">
          <div className="med-card-qty">
            <label htmlFor={`qty-${item.id}`}>Qty</label>
            <input
              id={`qty-${item.id}`}
              type="number"
              min={1}
              max={item.quantityOnHand}
              value={quantity}
              onChange={(e) => onQuantityChange(Number(e.target.value))}
            />
          </div>
          <button type="button" className="med-card-add-btn" onClick={onAddToCart}>
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
