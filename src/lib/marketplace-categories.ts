export const STOCK_CATEGORIES = [
  { id: "anti_malaria", label: "Anti-malaria", color: "#0f6e56", accent: "#e1f5ee" },
  { id: "antibiotics", label: "Antibiotics", color: "#2563eb", accent: "#eff6ff" },
  { id: "pain_relief", label: "Pain Relief", color: "#c2410c", accent: "#fff7ed" },
  { id: "supplements", label: "Supplements", color: "#7c3aed", accent: "#f5f3ff" },
  { id: "vitamins", label: "Vitamins", color: "#ca8a04", accent: "#fefce8" },
  { id: "others", label: "Others", color: "#5a6b66", accent: "#f1efe8" },
] as const;

export type StockCategoryId = (typeof STOCK_CATEGORIES)[number]["id"];

const CATEGORY_IDS = new Set(STOCK_CATEGORIES.map((c) => c.id));

export function normalizeCategory(value: string | null | undefined): StockCategoryId {
  const id = String(value || "others").trim().toLowerCase();
  return CATEGORY_IDS.has(id as StockCategoryId) ? (id as StockCategoryId) : "others";
}

export function getCategoryMeta(id: string) {
  return STOCK_CATEGORIES.find((c) => c.id === normalizeCategory(id)) ?? STOCK_CATEGORIES[5];
}
