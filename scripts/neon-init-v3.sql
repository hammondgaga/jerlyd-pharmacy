-- Marketplace + Arc wallet (run once in Neon SQL Editor after v1/v2)

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS price_naira NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS price_usdc NUMERIC(10,6) NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;

ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS total_naira NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS total_usdc NUMERIC(12,6) NOT NULL DEFAULT 0;
