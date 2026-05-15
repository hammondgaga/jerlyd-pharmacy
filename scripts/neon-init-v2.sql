-- Run once in Neon SQL Editor if you already have users/prescriptions from the first setup.

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS pharmacist_reply text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS stock_items (
  id serial PRIMARY KEY,
  drug_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  quantity_on_hand integer NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'units',
  is_available boolean NOT NULL DEFAULT true,
  updated_by_user_id integer REFERENCES users(id),
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS medication_orders (
  id serial PRIMARY KEY,
  patient_user_id integer NOT NULL REFERENCES users(id),
  stock_item_id integer NOT NULL REFERENCES stock_items(id),
  quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  patient_note text NOT NULL DEFAULT '',
  pharmacist_note text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_patient ON medication_orders (patient_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_stock ON medication_orders (stock_item_id);
