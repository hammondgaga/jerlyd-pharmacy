require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { openDb } = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const PHARMACIST_INVITE_CODE = process.env.PHARMACIST_INVITE_CODE || "";

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error("Set JWT_SECRET in .env (at least 16 characters).");
  process.exit(1);
}

const db = openDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "14d" }
  );
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET);
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
  }
}

function getUserRow(id) {
  return db.prepare("SELECT id, email, role, display_name AS displayName, created_at AS createdAt FROM users WHERE id = ?").get(id);
}

app.post("/api/auth/register", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  const displayName = String(req.body?.displayName || "").trim();
  const wantsPharmacist = req.body?.role === "pharmacist";
  const inviteCode = String(req.body?.inviteCode || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!displayName || displayName.length > 120) {
    return res.status(400).json({ error: "Please enter your name (max 120 characters)." });
  }

  let role = "patient";
  if (wantsPharmacist) {
    if (!PHARMACIST_INVITE_CODE) {
      return res.status(403).json({
        error: "Pharmacist self-registration is disabled. Set PHARMACIST_INVITE_CODE on the server.",
      });
    }
    if (inviteCode !== PHARMACIST_INVITE_CODE) {
      return res.status(403).json({ error: "Invalid staff invite code." });
    }
    role = "pharmacist";
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = new Date().toISOString();

  try {
    const info = db
      .prepare(
        "INSERT INTO users (email, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(email, passwordHash, role, displayName, createdAt);
    const user = getUserRow(info.lastInsertRowid);
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "An account with this email already exists. Try signing in." });
    }
    console.error(e);
    return res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  const user = getUserRow(row.id);
  const token = signToken(user);
  return res.json({ token, user });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const user = getUserRow(req.auth.sub);
  if (!user) return res.status(401).json({ error: "Account not found." });
  return res.json({ user });
});

app.get("/api/pharmacist/patients", authMiddleware, (req, res) => {
  if (req.auth.role !== "pharmacist") {
    return res.status(403).json({ error: "Pharmacist access required." });
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.display_name AS displayName, u.created_at AS createdAt,
        (SELECT COUNT(*) FROM prescriptions p WHERE p.patient_user_id = u.id) AS prescriptionCount
       FROM users u WHERE u.role = 'patient' ORDER BY u.id DESC`
    )
    .all();
  return res.json({ patients: rows });
});

app.get("/api/pharmacist/patients/:patientId/prescriptions", authMiddleware, (req, res) => {
  if (req.auth.role !== "pharmacist") {
    return res.status(403).json({ error: "Pharmacist access required." });
  }
  const patientId = Number(req.params.patientId);
  const patient = db.prepare("SELECT id, email, display_name AS displayName FROM users WHERE id = ? AND role = 'patient'").get(patientId);
  if (!patient) return res.status(404).json({ error: "Patient not found." });
  const rx = db
    .prepare(
      `SELECT id, patient_user_id AS patientUserId, drug_name AS drugName, indication, dosage, duration,
        dispensed_on AS dispensedOn, pharmacist_note AS pharmacistNote,
        patient_feedback AS patientFeedback, side_effects_observed AS sideEffectsObserved,
        created_at AS createdAt, updated_at AS updatedAt
       FROM prescriptions WHERE patient_user_id = ? ORDER BY id DESC`
    )
    .all(patientId);
  return res.json({ patient, prescriptions: rx });
});

app.post("/api/pharmacist/prescriptions", authMiddleware, (req, res) => {
  if (req.auth.role !== "pharmacist") {
    return res.status(403).json({ error: "Pharmacist access required." });
  }
  const patientUserId = Number(req.body?.patientUserId);
  const drugName = String(req.body?.drugName || "").trim();
  const indication = String(req.body?.indication || "").trim();
  const dosage = String(req.body?.dosage || "").trim();
  const duration = String(req.body?.duration || "").trim();
  const dispensedOn = String(req.body?.dispensedOn || "").trim();
  const pharmacistNote = String(req.body?.pharmacistNote || "").trim();

  if (!patientUserId || !drugName || !indication || !dosage || !duration) {
    return res.status(400).json({ error: "Patient, medication name, indication, dosage, and duration are required." });
  }

  const patient = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'patient'").get(patientUserId);
  if (!patient) return res.status(404).json({ error: "Patient not found." });

  const t = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO prescriptions (
        patient_user_id, pharmacist_user_id, drug_name, indication, dosage, duration,
        dispensed_on, pharmacist_note, patient_feedback, side_effects_observed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)`
    )
    .run(
      patientUserId,
      req.auth.sub,
      drugName,
      indication,
      dosage,
      duration,
      dispensedOn || null,
      pharmacistNote,
      t,
      t
    );

  const created = db
    .prepare(
      `SELECT id, patient_user_id AS patientUserId, drug_name AS drugName, indication, dosage, duration,
        dispensed_on AS dispensedOn, pharmacist_note AS pharmacistNote,
        patient_feedback AS patientFeedback, side_effects_observed AS sideEffectsObserved,
        created_at AS createdAt, updated_at AS updatedAt
       FROM prescriptions WHERE id = ?`
    )
    .get(info.lastInsertRowid);

  return res.status(201).json({ prescription: created });
});

app.delete("/api/pharmacist/prescriptions/:id", authMiddleware, (req, res) => {
  if (req.auth.role !== "pharmacist") {
    return res.status(403).json({ error: "Pharmacist access required." });
  }
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM prescriptions WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Prescription not found." });
  return res.json({ ok: true });
});

app.get("/api/patient/prescriptions", authMiddleware, (req, res) => {
  if (req.auth.role !== "patient") {
    return res.status(403).json({ error: "Patient access required." });
  }
  const rows = db
    .prepare(
      `SELECT p.id, p.drug_name AS drugName, p.indication, p.dosage, p.duration,
        p.dispensed_on AS dispensedOn, p.pharmacist_note AS pharmacistNote,
        p.patient_feedback AS patientFeedback, p.side_effects_observed AS sideEffectsObserved,
        p.created_at AS createdAt, p.updated_at AS updatedAt,
        u.display_name AS pharmacistDisplayName
       FROM prescriptions p
       JOIN users u ON u.id = p.pharmacist_user_id
       WHERE p.patient_user_id = ?
       ORDER BY p.id DESC`
    )
    .all(req.auth.sub);
  return res.json({ prescriptions: rows });
});

app.patch("/api/patient/prescriptions/:id", authMiddleware, (req, res) => {
  if (req.auth.role !== "patient") {
    return res.status(403).json({ error: "Patient access required." });
  }
  const id = Number(req.params.id);
  const patientFeedback = String(req.body?.patientFeedback ?? "").trim();
  const sideEffectsObserved = String(req.body?.sideEffectsObserved ?? "").trim();

  const row = db.prepare("SELECT id FROM prescriptions WHERE id = ? AND patient_user_id = ?").get(id, req.auth.sub);
  if (!row) return res.status(404).json({ error: "Prescription not found." });

  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE prescriptions SET patient_feedback = ?, side_effects_observed = ?, updated_at = ? WHERE id = ?"
  ).run(patientFeedback, sideEffectsObserved, updatedAt, id);

  const updated = db
    .prepare(
      `SELECT p.id, p.drug_name AS drugName, p.indication, p.dosage, p.duration,
        p.dispensed_on AS dispensedOn, p.pharmacist_note AS pharmacistNote,
        p.patient_feedback AS patientFeedback, p.side_effects_observed AS sideEffectsObserved,
        p.created_at AS createdAt, p.updated_at AS updatedAt,
        u.display_name AS pharmacistDisplayName
       FROM prescriptions p
       JOIN users u ON u.id = p.pharmacist_user_id
       WHERE p.id = ?`
    )
    .get(id);

  return res.json({ prescription: updated });
});

const publicDir = path.join(__dirname, "..");
app.use(express.static(publicDir));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

app.listen(PORT, () => {
  console.log(`Jerlyd Pharmacy server listening on http://localhost:${PORT}`);
});
