-- Categories, images, and pack sizes (run once in Neon SQL Editor after v1–v3)

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'others';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS stock_item_packs (
  id SERIAL PRIMARY KEY,
  stock_item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_naira NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_usdc NUMERIC(10,6) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stock_packs_item ON stock_item_packs(stock_item_id);

ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS pack_id INTEGER REFERENCES stock_item_packs(id);
ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS pack_label TEXT NOT NULL DEFAULT '';
