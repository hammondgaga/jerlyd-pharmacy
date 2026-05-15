ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "pharmacist_reply" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "drug_name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "quantity_on_hand" integer DEFAULT 0 NOT NULL,
  "unit" text DEFAULT 'units' NOT NULL,
  "is_available" boolean DEFAULT true NOT NULL,
  "updated_by_user_id" integer,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medication_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_user_id" integer NOT NULL,
  "stock_item_id" integer NOT NULL,
  "quantity" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "patient_note" text DEFAULT '' NOT NULL,
  "pharmacist_note" text DEFAULT '' NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_patient_user_id_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_patient" ON "medication_orders" USING btree ("patient_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_stock" ON "medication_orders" USING btree ("stock_item_id");
