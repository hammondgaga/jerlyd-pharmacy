const TTL_MS = 10 * 60 * 1000;

let cache: { ngnPerUsd: number; fetchedAt: number } | null = null;

/** NGN per 1 USD (USDC ≈ USD). Cached 10 minutes. */
export async function getNgnPerUsd(): Promise<number> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.ngnPerUsd;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error("Rate fetch failed");
    const data = (await res.json()) as { rates?: { NGN?: number } };
    const ngn = Number(data.rates?.NGN);
    if (!Number.isFinite(ngn) || ngn <= 0) throw new Error("Invalid NGN rate");
    cache = { ngnPerUsd: ngn, fetchedAt: Date.now() };
    return ngn;
  } catch {
    const fallback = 1580;
    if (!cache) cache = { ngnPerUsd: fallback, fetchedAt: Date.now() };
    return cache.ngnPerUsd;
  }
}

export function nairaToUsdc(priceNaira: number, ngnPerUsd: number): number {
  if (ngnPerUsd <= 0) return 0;
  return Math.round((priceNaira / ngnPerUsd) * 1_000_000) / 1_000_000;
}

export function formatNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUsdc(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`;
}
