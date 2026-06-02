import { boolean, index, integer, numeric, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    displayName: text("display_name").notNull(),
    walletAddress: text("wallet_address"),
    encryptedPrivateKey: text("encrypted_private_key"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_password_reset_user").on(t.userId),
    index("idx_password_reset_hash").on(t.tokenHash),
  ]
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: serial("id").primaryKey(),
    patientUserId: integer("patient_user_id")
      .notNull()
      .references(() => users.id),
    pharmacistUserId: integer("pharmacist_user_id")
      .notNull()
      .references(() => users.id),
    drugName: text("drug_name").notNull(),
    indication: text("indication").notNull(),
    dosage: text("dosage").notNull(),
    duration: text("duration").notNull(),
    dispensedOn: text("dispensed_on"),
    pharmacistNote: text("pharmacist_note").notNull().default(""),
    patientFeedback: text("patient_feedback").notNull().default(""),
    sideEffectsObserved: text("side_effects_observed").notNull().default(""),
    pharmacistReply: text("pharmacist_reply").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_prescriptions_patient").on(t.patientUserId)]
);

export const stockItems = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  drugName: text("drug_name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("others"),
  imageUrl: text("image_url"),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  unit: text("unit").notNull().default("units"),
  isAvailable: boolean("is_available").notNull().default(true),
  priceNaira: numeric("price_naira", { precision: 10, scale: 2 }).notNull().default("0"),
  priceUsdc: numeric("price_usdc", { precision: 10, scale: 6 }).notNull().default("0"),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const stockItemPacks = pgTable(
  "stock_item_packs",
  {
    id: serial("id").primaryKey(),
    stockItemId: integer("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    priceNaira: numeric("price_naira", { precision: 10, scale: 2 }).notNull().default("0"),
    priceUsdc: numeric("price_usdc", { precision: 10, scale: 6 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("idx_stock_packs_item").on(t.stockItemId)]
);

export const medicationOrders = pgTable(
  "medication_orders",
  {
    id: serial("id").primaryKey(),
    patientUserId: integer("patient_user_id")
      .notNull()
      .references(() => users.id),
    stockItemId: integer("stock_item_id")
      .notNull()
      .references(() => stockItems.id),
    packId: integer("pack_id").references(() => stockItemPacks.id),
    packLabel: text("pack_label").notNull().default(""),
    quantity: integer("quantity").notNull(),
    status: text("status").notNull().default("pending"),
    patientNote: text("patient_note").notNull().default(""),
    pharmacistNote: text("pharmacist_note").notNull().default(""),
    paymentMethod: text("payment_method").notNull().default("pending"),
    txHash: text("tx_hash"),
    totalNaira: numeric("total_naira", { precision: 12, scale: 2 }).notNull().default("0"),
    totalUsdc: numeric("total_usdc", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_orders_patient").on(t.patientUserId),
    index("idx_orders_stock").on(t.stockItemId),
  ]
);
