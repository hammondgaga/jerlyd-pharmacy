import { boolean, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)]
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
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  unit: text("unit").notNull().default("units"),
  isAvailable: boolean("is_available").notNull().default(true),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

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
    quantity: integer("quantity").notNull(),
    status: text("status").notNull().default("pending"),
    patientNote: text("patient_note").notNull().default(""),
    pharmacistNote: text("pharmacist_note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_orders_patient").on(t.patientUserId),
    index("idx_orders_stock").on(t.stockItemId),
  ]
);
