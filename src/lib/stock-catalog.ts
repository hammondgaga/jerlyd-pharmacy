import { STOCK_CATEGORIES, normalizeCategory, type StockCategoryId } from "@/lib/marketplace-categories";

export type StockPackDto = {
  id: number;
  label: string;
  priceNaira: number;
  priceUsdc: number;
};

export type StockItemDto = {
  id: number;
  drugName: string;
  description: string;
  category: StockCategoryId;
  imageUrl: string | null;
  quantityOnHand: number;
  unit: string;
  isAvailable: boolean;
  priceNaira: number;
  priceUsdc: number;
  inStock: boolean;
  packs: StockPackDto[];
};

export type PackInput = {
  label: string;
  priceNaira: number;
  priceUsdc: number;
};

export function num(v: string | null | undefined): number {
  return Number(v || 0);
}

export function normalizeImageUrl(value: string | null | undefined): string | null {
  const url = String(value || "").trim();
  if (!url) return null;
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/")) {
    if (url.startsWith("data:image/") && url.length > 400_000) {
      throw new Error("Image is too large. Use a smaller file (under ~300KB).");
    }
    return url;
  }
  return null;
}

export function normalizePackInputs(raw: unknown): PackInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const row = p as PackInput;
      const label = String(row.label || "").trim().slice(0, 80);
      if (!label) return null;
      return {
        label,
        priceNaira: Math.max(0, Number(row.priceNaira) || 0),
        priceUsdc: Math.max(0, Number(row.priceUsdc) || 0),
      };
    })
    .filter((p): p is PackInput => p !== null);
}

/** Ensure every item has at least one pack (fallback to base item prices). */
export function withDefaultPacks(
  item: Omit<StockItemDto, "packs"> & { packs?: StockPackDto[] }
): StockItemDto {
  const category = normalizeCategory(item.category);
  const packs =
    item.packs && item.packs.length > 0
      ? item.packs
      : [
          {
            id: 0,
            label: item.unit || "Standard pack",
            priceNaira: item.priceNaira,
            priceUsdc: item.priceUsdc,
          },
        ];
  return { ...item, category, packs };
}

export function categoryCountsFromItems(items: StockItemDto[]) {
  const counts: Record<string, number> = {};
  for (const c of STOCK_CATEGORIES) counts[c.id] = 0;
  for (const item of items) {
    if (item.isAvailable && item.inStock) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
  }
  return counts;
}
