import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stockItemPacks, stockItems } from "@/db/schema";
import { normalizeCategory } from "@/lib/marketplace-categories";
import {
  num,
  withDefaultPacks,
  type StockItemDto,
  type StockPackDto,
  type PackInput,
} from "@/lib/stock-catalog";

export async function fetchPacksByStockIds(stockItemIds: number[]): Promise<Map<number, StockPackDto[]>> {
  const map = new Map<number, StockPackDto[]>();
  if (stockItemIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select()
    .from(stockItemPacks)
    .where(inArray(stockItemPacks.stockItemId, stockItemIds))
    .orderBy(asc(stockItemPacks.sortOrder), asc(stockItemPacks.id));

  for (const row of rows) {
    const pack: StockPackDto = {
      id: row.id,
      label: row.label,
      priceNaira: num(row.priceNaira),
      priceUsdc: num(row.priceUsdc),
    };
    const list = map.get(row.stockItemId) || [];
    list.push(pack);
    map.set(row.stockItemId, list);
  }
  return map;
}

export function mapStockRow(
  row: typeof stockItems.$inferSelect,
  packs: StockPackDto[],
  options?: { patientView?: boolean }
): StockItemDto {
  const patientView = options?.patientView ?? false;
  const inStock = row.quantityOnHand > 0;
  const isAvailable = patientView ? row.isAvailable && inStock : row.isAvailable;

  return withDefaultPacks({
    id: row.id,
    drugName: row.drugName,
    description: row.description,
    category: normalizeCategory(row.category),
    imageUrl: row.imageUrl,
    quantityOnHand: row.quantityOnHand,
    unit: row.unit,
    isAvailable,
    priceNaira: num(row.priceNaira),
    priceUsdc: num(row.priceUsdc),
    inStock,
    packs,
  });
}

export async function replaceStockPacks(
  stockItemId: number,
  packs: PackInput[],
  fallback: { priceNaira: number; priceUsdc: number; unit: string }
) {
  const db = getDb();
  await db.delete(stockItemPacks).where(eq(stockItemPacks.stockItemId, stockItemId));

  const toInsert =
    packs.length > 0
      ? packs
      : [{ label: fallback.unit || "Standard pack", priceNaira: fallback.priceNaira, priceUsdc: fallback.priceUsdc }];

  if (toInsert.length === 0) return;

  await db.insert(stockItemPacks).values(
    toInsert.map((p, index) => ({
      stockItemId,
      label: p.label,
      priceNaira: String(p.priceNaira.toFixed(2)),
      priceUsdc: String(p.priceUsdc.toFixed(6)),
      sortOrder: index,
    }))
  );
}

export async function resolvePackPricing(
  stockItemId: number,
  packId: number | null | undefined,
  item: typeof stockItems.$inferSelect
): Promise<{ packId: number | null; packLabel: string; unitNaira: number; unitUsdc: number }> {
  const db = getDb();
  if (packId && packId > 0) {
    const packs = await db
      .select()
      .from(stockItemPacks)
      .where(eq(stockItemPacks.id, packId))
      .limit(1);
    const pack = packs[0];
    if (pack && pack.stockItemId === stockItemId) {
      return {
        packId: pack.id,
        packLabel: pack.label,
        unitNaira: num(pack.priceNaira),
        unitUsdc: num(pack.priceUsdc),
      };
    }
  }

  const allPacks = await db
    .select()
    .from(stockItemPacks)
    .where(eq(stockItemPacks.stockItemId, stockItemId))
    .orderBy(asc(stockItemPacks.sortOrder))
    .limit(1);

  if (allPacks[0]) {
    return {
      packId: allPacks[0].id,
      packLabel: allPacks[0].label,
      unitNaira: num(allPacks[0].priceNaira),
      unitUsdc: num(allPacks[0].priceUsdc),
    };
  }

  return {
    packId: null,
    packLabel: item.unit || "Standard pack",
    unitNaira: num(item.priceNaira),
    unitUsdc: num(item.priceUsdc),
  };
}
