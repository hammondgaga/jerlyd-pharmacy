"use client";

import { useState } from "react";
import { STOCK_CATEGORIES } from "@/lib/marketplace-categories";
import type { PackInput, StockItemDto } from "@/lib/stock-catalog";

type PackRow = PackInput & { key: string };

function newPackRow(): PackRow {
  return { key: String(Date.now()) + Math.random(), label: "", priceNaira: 0, priceUsdc: 0 };
}

type Props = {
  initial?: Partial<StockItemDto>;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
};

export function PharmacistStockForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || "");
  const [packs, setPacks] = useState<PackRow[]>(() => {
    if (initial?.packs && initial.packs.length > 0) {
      return initial.packs.map((p) => ({
        key: `p-${p.id}`,
        label: p.label,
        priceNaira: p.priceNaira,
        priceUsdc: p.priceUsdc,
      }));
    }
    return [newPackRow()];
  });
  const [saving, setSaving] = useState(false);

  const readImageFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 350_000) {
      alert("Image must be under 350KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  return (
    <form
      className="form-grid pharmacist-stock-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const fd = new FormData(e.currentTarget);
          await onSubmit({
            drugName: String(fd.get("drugName") || ""),
            description: String(fd.get("description") || ""),
            category: String(fd.get("category") || "others"),
            imageUrl: imageUrl.trim() || null,
            quantityOnHand: Number(fd.get("quantityOnHand") || 0),
            unit: String(fd.get("unit") || "units"),
            isAvailable: fd.get("isAvailable") === "on",
            priceNaira: Number(fd.get("priceNaira") || 0),
            priceUsdc: Number(fd.get("priceUsdc") || 0),
            packs: packs
              .filter((p) => p.label.trim())
              .map((p) => ({
                label: p.label.trim(),
                priceNaira: p.priceNaira,
                priceUsdc: p.priceUsdc,
              })),
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <label htmlFor="stkName">Medication name</label>
        <input id="stkName" name="drugName" defaultValue={initial?.drugName} required />
      </div>
      <div>
        <label htmlFor="stkCategory">Category</label>
        <select id="stkCategory" name="category" defaultValue={initial?.category || "others"} required>
          {STOCK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="stkDesc">Description (optional)</label>
        <input id="stkDesc" name="description" defaultValue={initial?.description} />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label>Medication image</label>
        <div className="stock-image-field">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="stock-image-preview" />
          ) : (
            <div className="stock-image-preview stock-image-preview--empty">No image</div>
          )}
          <div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => readImageFile(e.target.files?.[0])}
            />
            <p className="muted" style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>
              Upload a photo (max ~350KB) or paste an image URL below.
            </p>
            <input
              type="url"
              placeholder="https://… image URL"
              value={imageUrl.startsWith("data:") ? "" : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            {imageUrl ? (
              <button type="button" className="btn-small" style={{ marginTop: "0.35rem" }} onClick={() => setImageUrl("")}>
                Remove image
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="form-grid two" style={{ gridColumn: "1 / -1" }}>
        <div>
          <label htmlFor="stkQty">Quantity on hand</label>
          <input
            id="stkQty"
            name="quantityOnHand"
            type="number"
            min={0}
            defaultValue={initial?.quantityOnHand ?? 0}
            required
          />
        </div>
        <div>
          <label htmlFor="stkUnit">Unit</label>
          <input id="stkUnit" name="unit" defaultValue={initial?.unit || "units"} placeholder="e.g. tablets" />
        </div>
      </div>
      <div className="form-grid two" style={{ gridColumn: "1 / -1" }}>
        <div>
          <label htmlFor="stkNaira">Base price (₦) — fallback if no packs</label>
          <input id="stkNaira" name="priceNaira" type="number" min={0} step="0.01" defaultValue={initial?.priceNaira ?? 0} />
        </div>
        <div>
          <label htmlFor="stkUsdc">Base price (USDC)</label>
          <input id="stkUsdc" name="priceUsdc" type="number" min={0} step="0.000001" defaultValue={initial?.priceUsdc ?? 0} />
        </div>
      </div>
      <fieldset className="pack-sizes-fieldset" style={{ gridColumn: "1 / -1" }}>
        <legend>Pack sizes &amp; prices</legend>
        <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 0.75rem" }}>
          Add one row per pack (e.g. &quot;10 tablets&quot;, &quot;1 bottle&quot;). Patients choose a pack when ordering.
        </p>
        {packs.map((pack, index) => (
          <div key={pack.key} className="pack-size-row">
            <input
              placeholder="Pack label"
              value={pack.label}
              onChange={(e) =>
                setPacks((prev) => prev.map((p, i) => (i === index ? { ...p, label: e.target.value } : p)))
              }
              required={index === 0}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="₦"
              value={pack.priceNaira || ""}
              onChange={(e) =>
                setPacks((prev) =>
                  prev.map((p, i) => (i === index ? { ...p, priceNaira: Number(e.target.value) } : p))
                )
              }
            />
            <input
              type="number"
              min={0}
              step="0.000001"
              placeholder="USDC"
              value={pack.priceUsdc || ""}
              onChange={(e) =>
                setPacks((prev) =>
                  prev.map((p, i) => (i === index ? { ...p, priceUsdc: Number(e.target.value) } : p))
                )
              }
            />
            <button
              type="button"
              className="btn-small"
              disabled={packs.length <= 1}
              onClick={() => setPacks((prev) => prev.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => setPacks((prev) => [...prev, newPackRow()])}>
          + Add pack size
        </button>
      </fieldset>
      <div>
        <label>
          <input type="checkbox" name="isAvailable" defaultChecked={initial?.isAvailable !== false} /> Available for
          patient orders
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
