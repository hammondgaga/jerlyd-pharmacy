const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function openDb() {
  const dir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "pharmacy.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('patient', 'pharmacist')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_user_id INTEGER NOT NULL,
      pharmacist_user_id INTEGER NOT NULL,
      drug_name TEXT NOT NULL,
      indication TEXT NOT NULL,
      dosage TEXT NOT NULL,
      duration TEXT NOT NULL,
      dispensed_on TEXT,
      pharmacist_note TEXT NOT NULL DEFAULT '',
      patient_feedback TEXT NOT NULL DEFAULT '',
      side_effects_observed TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_user_id) REFERENCES users (id),
      FOREIGN KEY (pharmacist_user_id) REFERENCES users (id)
    );

    CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions (patient_user_id);
  `);
  return db;
}

module.exports = { openDb };
