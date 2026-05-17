"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PharmacistRxPanel } from "@/components/PharmacistRxPanel";
import { PatientWalletPanel } from "@/components/PatientWalletPanel";
import { StockMarketplace, type MarketplaceOrder } from "@/components/StockMarketplace";
import { ensurePatientWallet, fetchPatientWalletAddress } from "@/lib/arc/patient-wallet";

const TOKEN_KEY = "jerlyd-session-token";

type PortalUser = {
  id: number;
  email: string;
  role: "patient" | "pharmacist";
  displayName: string;
  walletAddress?: string | null;
  createdAt?: string;
};

type Prescription = {
  id: number;
  drugName: string;
  indication: string;
  dosage: string;
  duration: string;
  dispensedOn: string | null;
  pharmacistNote: string;
  patientFeedback: string;
  sideEffectsObserved: string;
  pharmacistReply: string;
  pharmacistDisplayName?: string;
  createdAt?: string;
  updatedAt?: string;
};

type StockItem = {
  id: number;
  drugName: string;
  description: string;
  quantityOnHand: number;
  unit: string;
  isAvailable?: boolean;
  priceNaira?: number;
  priceUsdc?: number;
};

type PatientOrder = {
  id: number;
  stockItemId: number;
  quantity: number;
  status: string;
  patientNote: string;
  pharmacistNote: string;
  drugName: string;
  unit: string;
  createdAt: string;
  updatedAt: string;
};

type PharmacistOrder = PatientOrder & {
  patientUserId: number;
  patientDisplayName: string;
  patientEmail: string;
};

type PatientTab = "meds" | "shop" | "wallet";
type AdminTab = "patients" | "stock" | "orders";

type PatientRow = {
  id: number;
  email: string;
  displayName: string;
  createdAt: string;
  prescriptionCount: number;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && typeof init.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    const msg = (data.error as string) || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data as T;
}

type View = "welcome" | "patient" | "admin";
type AuthSub = "login" | "register";
type Flash = { msg: string; kind: "success" | "error" | "info" } | null;

export function PharmacyPortal() {
  const [view, setView] = useState<View>("welcome");
  const [patientSub, setPatientSub] = useState<AuthSub>("login");
  const [adminSub, setAdminSub] = useState<AuthSub>("login");
  const [flash, setFlash] = useState<Flash>(null);
  const [currentUser, setCurrentUser] = useState<PortalUser | null>(null);
  const [patientTab, setPatientTab] = useState<PatientTab>("meds");
  const [adminTab, setAdminTab] = useState<AdminTab>("patients");
  const [patientPrescriptions, setPatientPrescriptions] = useState<Prescription[] | null>(null);
  const [patientStock, setPatientStock] = useState<StockItem[] | null>(null);
  const [patientOrders, setPatientOrders] = useState<PatientOrder[] | null>(null);
  const [pharmacistPatients, setPharmacistPatients] = useState<PatientRow[] | null>(null);
  const [pharmacistStock, setPharmacistStock] = useState<StockItem[] | null>(null);
  const [pharmacistOrders, setPharmacistOrders] = useState<PharmacistOrder[] | null>(null);
  const [showAddStock, setShowAddStock] = useState(false);
  const [addRxPatientId, setAddRxPatientId] = useState<string | null>(null);
  const [rxPanel, setRxPanel] = useState<
    | { open: false }
    | { open: true; loading: true; patientId: string }
    | {
        open: true;
        loading: false;
        patientId: string;
        patient: { id: number; email: string; displayName: string };
        prescriptions: Prescription[];
      }
  >({ open: false });

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 10000);
    return () => window.clearTimeout(t);
  }, [flash]);

  const flashBanner =
    flash ? (
      <div
        className={`alert ${
          flash.kind === "error" ? "alert-error" : flash.kind === "success" ? "alert-success" : "alert-info"
        }`}
        role="status"
      >
        {flash.msg}
      </div>
    ) : null;

  const loadPatientRx = useCallback(async () => {
    try {
      const data = await api<{ prescriptions: Prescription[] }>("/patient/prescriptions");
      setPatientPrescriptions(data.prescriptions);
    } catch {
      setPatientPrescriptions([]);
    }
  }, []);

  const loadPharmacistPatients = useCallback(async () => {
    try {
      const data = await api<{ patients: PatientRow[] }>("/pharmacist/patients");
      setPharmacistPatients(data.patients || []);
    } catch {
      setPharmacistPatients([]);
    }
  }, []);

  const loadPatientShop = useCallback(async () => {
    try {
      const [stockRes, ordersRes] = await Promise.all([
        api<{ items: StockItem[] }>("/patient/stock"),
        api<{ orders: PatientOrder[] }>("/patient/orders"),
      ]);
      setPatientStock(stockRes.items || []);
      setPatientOrders(ordersRes.orders || []);
    } catch {
      setPatientStock([]);
      setPatientOrders([]);
    }
  }, []);

  const loadPharmacistStock = useCallback(async () => {
    try {
      const data = await api<{ items: StockItem[] }>("/pharmacist/stock");
      setPharmacistStock(data.items || []);
    } catch {
      setPharmacistStock([]);
    }
  }, []);

  const loadPharmacistOrders = useCallback(async () => {
    try {
      const data = await api<{ orders: PharmacistOrder[] }>("/pharmacist/orders");
      setPharmacistOrders(data.orders || []);
    } catch {
      setPharmacistOrders([]);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      const token = getToken();
      if (!token) {
        setCurrentUser(null);
        return;
      }
      try {
        const data = await api<{ user: PortalUser }>("/me");
        setCurrentUser(data.user);
      } catch {
        setToken(null);
        setCurrentUser(null);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (currentUser?.role === "patient" && view === "patient" && patientPrescriptions === null) {
      void loadPatientRx();
    }
  }, [currentUser, view, patientPrescriptions, loadPatientRx]);

  useEffect(() => {
    if (currentUser?.role === "pharmacist" && view === "admin" && pharmacistPatients === null) {
      void loadPharmacistPatients();
    }
  }, [currentUser, view, pharmacistPatients, loadPharmacistPatients]);

  useEffect(() => {
    if (currentUser?.role === "patient" && view === "patient" && patientTab === "shop" && patientStock === null) {
      void loadPatientShop();
    }
  }, [currentUser, view, patientTab, patientStock, loadPatientShop]);

  useEffect(() => {
    if (currentUser?.role !== "patient" || view !== "patient") return;

    void (async () => {
      try {
        const existing = await fetchPatientWalletAddress(api);
        if (existing) return;
        await ensurePatientWallet(api, currentUser.id, currentUser.email);
        const data = await api<{ user: PortalUser }>("/me");
        setCurrentUser(data.user);
      } catch {
        /* wallet can be created later from My wallet or checkout */
      }
    })();
  }, [currentUser?.id, currentUser?.role, currentUser?.email, view]);

  useEffect(() => {
    if (currentUser?.role === "pharmacist" && view === "admin" && adminTab === "stock" && pharmacistStock === null) {
      void loadPharmacistStock();
    }
  }, [currentUser, view, adminTab, pharmacistStock, loadPharmacistStock]);

  useEffect(() => {
    if (currentUser?.role === "pharmacist" && view === "admin" && adminTab === "orders" && pharmacistOrders === null) {
      void loadPharmacistOrders();
    }
  }, [currentUser, view, adminTab, pharmacistOrders, loadPharmacistOrders]);

  useEffect(() => {
    const onHash = () => {
      const h = (location.hash || "").replace(/^#/, "").toLowerCase();
      if (h === "register" || h === "signup" || h === "patient-register") {
        setView("patient");
        setPatientSub("register");
      }
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openRxPanel = useCallback(async (patientId: string) => {
    setRxPanel({ open: true, loading: true, patientId });
    try {
      const data = await api<{
        patient: { id: number; email: string; displayName: string };
        prescriptions: Prescription[];
      }>(`/pharmacist/patients/${patientId}/prescriptions`);
      setRxPanel({
        open: true,
        loading: false,
        patientId,
        patient: data.patient,
        prescriptions: data.prescriptions || [],
      });
      const el = document.getElementById("rxPanel");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setFlash({ msg: (err as Error).message, kind: "error" });
      setRxPanel({ open: false });
    }
  }, []);

  const welcome = (
    <>
      <section className="hero" aria-labelledby="welcome-title">
        <div className="hero-inner">
          <div className="hero-content">
            <h1 id="welcome-title">Welcome to Jerlyd Pharmacy</h1>
            <p className="hero-subtitle">Your medications, tracked and accessible — anytime.</p>
            <div className="hero-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setView("patient");
                  setPatientSub("login");
                }}
              >
                Patient sign-in
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setView("patient");
                  setPatientSub("register");
                }}
              >
                Create account
              </button>
            </div>
            <p className="hero-staff">
              Pharmacy staff?{" "}
              <button
                type="button"
                className="hero-staff-link"
                onClick={() => {
                  setView("admin");
                  setAdminSub("login");
                }}
              >
                Pharmacist sign-in
              </button>
            </p>
          </div>
          <div className="hero-art" aria-hidden>
            <svg className="hero-illustration" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="88" stroke="#0F6E56" strokeWidth="2" strokeOpacity="0.15" />
              <circle cx="100" cy="100" r="68" fill="#0F6E56" fillOpacity="0.06" />
              <rect x="38" y="78" width="52" height="44" rx="22" stroke="#0F6E56" strokeWidth="2.5" />
              <rect x="58" y="78" width="32" height="44" rx="16" fill="#0F6E56" fillOpacity="0.18" />
              <line x1="64" y1="100" x2="84" y2="100" stroke="#0F6E56" strokeWidth="2" strokeOpacity="0.35" />
              <circle cx="138" cy="92" r="28" stroke="#085041" strokeWidth="2.5" />
              <path d="M138 78v28M124 92h28" stroke="#085041" strokeWidth="2.5" strokeLinecap="round" />
              <path
                d="M52 148c12-8 28-8 40 0M108 148c10-6 24-6 34 0"
                stroke="#0F6E56"
                strokeWidth="2"
                strokeLinecap="round"
                strokeOpacity="0.4"
              />
              <circle cx="72" cy="52" r="6" fill="#0F6E56" fillOpacity="0.25" />
              <circle cx="148" cy="138" r="5" fill="#0F6E56" fillOpacity="0.2" />
              <circle cx="48" cy="118" r="4" fill="#085041" fillOpacity="0.15" />
            </svg>
          </div>
        </div>
      </section>
      <section className="panel" aria-labelledby="how-title">
        <h2 id="how-title">How this portal works</h2>
        <p className="panel-sub">
          Anyone with this site link can <strong>register as a patient</strong> with an email and password. Your
          pharmacist uses a separate staff account to record medications dispensed from Jerlyd Pharmacy. Patients cannot
          add their own medications; they can only view what the pharmacy has listed and add notes.
        </p>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>Patients: create an account, then sign in any time to see listed medications and update feedback.</li>
          <li>Pharmacists: staff accounts require the invite code configured on the server.</li>
          <li>Data is stored in the pharmacy database (secure cloud hosting), not only in your browser.</li>
        </ul>
      </section>
    </>
  );

  const patientAuth =
    patientSub === "register" ? (
      <section className="panel">
        <h2>Create your patient account</h2>
        <p className="panel-sub">Use the email you would like Jerlyd Pharmacy to recognize for this portal.</p>
        {flashBanner}
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const pw = String(fd.get("password") || "");
            const pw2 = String(fd.get("password2") || "");
            if (pw !== pw2) {
              setFlash({ msg: "Passwords did not match.", kind: "error" });
              return;
            }
            try {
              const data = await api<{ token: string; user: PortalUser }>("/auth/register", {
                method: "POST",
                body: JSON.stringify({
                  email: String(fd.get("email") || ""),
                  password: pw,
                  displayName: String(fd.get("displayName") || ""),
                  role: "patient",
                }),
              });
              setToken(data.token);
              setCurrentUser(data.user);
              setPatientPrescriptions(null);
              setPatientSub("login");
              setFlash({ msg: "Account created. You are signed in.", kind: "success" });
            } catch (err) {
              setFlash({ msg: (err as Error).message, kind: "error" });
            }
          }}
        >
          <div>
            <label htmlFor="prEmail">Email</label>
            <input id="prEmail" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="prName">Preferred name</label>
            <input id="prName" name="displayName" autoComplete="name" required maxLength={120} />
          </div>
          <div>
            <label htmlFor="prPw">Password</label>
            <input id="prPw" name="password" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div>
            <label htmlFor="prPw2">Confirm password</label>
            <input id="prPw2" name="password2" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPatientSub("login")}>
              Already have an account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setView("welcome")}>
              Home
            </button>
          </div>
        </form>
      </section>
    ) : (
      <section className="panel">
        <h2>Patient sign-in</h2>
        <p className="panel-sub">Sign in with the email and password you used when you created your account.</p>
        {flashBanner}
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              const data = await api<{ token: string; user: PortalUser }>("/auth/login", {
                method: "POST",
                body: JSON.stringify({
                  email: String(fd.get("email") || ""),
                  password: String(fd.get("password") || ""),
                }),
              });
              if (data.user.role !== "patient") {
                setFlash({ msg: "This email is registered as a pharmacist. Use the pharmacist sign-in instead.", kind: "error" });
                return;
              }
              setToken(data.token);
              setCurrentUser(data.user);
              setPatientPrescriptions(null);
              setFlash({ msg: "Signed in successfully.", kind: "success" });
            } catch (err) {
              setFlash({ msg: (err as Error).message, kind: "error" });
            }
          }}
        >
          <div>
            <label htmlFor="plEmail">Email</label>
            <input id="plEmail" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="plPw">Password</label>
            <input id="plPw" name="password" type="password" autoComplete="current-password" required />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Sign in
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPatientSub("register")}>
              Create account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setView("welcome")}>
              Home
            </button>
          </div>
        </form>
      </section>
    );

  const patientDashboard =
    currentUser && patientPrescriptions !== null ? (
      <section className="panel">
        <h2>Hello, {currentUser.displayName}</h2>
        <p className="panel-sub">Your medications, feedback, and orders from Jerlyd Pharmacy stock.</p>
        {flashBanner}
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Signed in as {currentUser.email} ·{" "}
          <button
            type="button"
            className="btn-small"
            onClick={() => {
              setToken(null);
              setCurrentUser(null);
              setPatientPrescriptions(null);
              setPatientStock(null);
              setPatientOrders(null);
              setView("patient");
              setPatientSub("login");
              setFlash({ msg: "You have been signed out.", kind: "info" });
            }}
          >
            Sign out
          </button>
        </p>
        <div className="portal-tabs" role="tablist" aria-label="Patient sections">
          <button
            type="button"
            role="tab"
            className={`portal-tab${patientTab === "meds" ? " is-active" : ""}`}
            aria-selected={patientTab === "meds"}
            onClick={() => setPatientTab("meds")}
          >
            My medications
          </button>
          <button
            type="button"
            role="tab"
            className={`portal-tab${patientTab === "shop" ? " is-active" : ""}`}
            aria-selected={patientTab === "shop"}
            onClick={() => setPatientTab("shop")}
          >
            Marketplace
          </button>
          <button
            type="button"
            role="tab"
            className={`portal-tab${patientTab === "wallet" ? " is-active" : ""}`}
            aria-selected={patientTab === "wallet"}
            onClick={() => {
              setPatientTab("wallet");
              if (patientOrders === null) void loadPatientShop();
            }}
          >
            My wallet
          </button>
        </div>
        {patientTab === "shop" ? (
          <StockMarketplace
            userId={currentUser.id}
            userEmail={currentUser.email}
            api={api}
            onFlash={(msg, kind) => setFlash({ msg, kind })}
            onOrdersChanged={() => {
              setPatientStock(null);
              setPatientOrders(null);
            }}
          />
        ) : null}
        {patientTab === "wallet" ? (
          <PatientWalletPanel
            userId={currentUser.id}
            email={currentUser.email}
            walletAddress={currentUser.walletAddress}
            orders={(patientOrders as MarketplaceOrder[] | null) || []}
            api={api}
            onWalletLinked={async () => {
              try {
                const data = await api<{ user: PortalUser }>("/me");
                setCurrentUser(data.user);
              } catch {
                /* ignore */
              }
            }}
          />
        ) : null}
        {patientTab === "meds" && patientPrescriptions.length === 0 ? (
          <div className="empty-state">
            <p>
              <strong>No medications listed yet.</strong>
            </p>
            <p className="muted">When your pharmacist records a dispensed medication for your account, it will appear here.</p>
          </div>
        ) : null}
        {patientTab === "meds" && patientPrescriptions.length > 0 ? (
          <div className="med-list">
            {patientPrescriptions.map((m) => (
              <article key={m.id} className="med-card">
                <h3>{m.drugName}</h3>
                <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
                  Recorded by {m.pharmacistDisplayName || "your pharmacist"}
                </p>
                <dl className="med-meta">
                  <div>
                    <dt>Indication</dt>
                    <dd>{m.indication || "—"}</dd>
                  </div>
                  <div>
                    <dt>Dosage &amp; directions</dt>
                    <dd>{m.dosage || "—"}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{m.duration || "—"}</dd>
                  </div>
                  <div>
                    <dt>Dispensed</dt>
                    <dd>{m.dispensedOn || "—"}</dd>
                  </div>
                </dl>
                {m.pharmacistNote ? (
                  <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
                    <strong>From your pharmacist:</strong> {m.pharmacistNote}
                  </p>
                ) : null}
                <div className="divider" />
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    try {
                      await api(`/patient/prescriptions/${m.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          patientFeedback: String(fd.get("patientFeedback") || ""),
                          sideEffectsObserved: String(fd.get("sideEffectsObserved") || ""),
                        }),
                      });
                      setPatientPrescriptions(null);
                      setFlash({ msg: "Your notes were saved. Thank you for keeping us informed.", kind: "success" });
                    } catch (err) {
                      setFlash({ msg: (err as Error).message, kind: "error" });
                    }
                  }}
                >
                  <label htmlFor={`fb-${m.id}`}>Your feedback or questions</label>
                  <textarea
                    id={`fb-${m.id}`}
                    name="patientFeedback"
                    rows={3}
                    placeholder="How is the medication working for you? Any questions?"
                    defaultValue={m.patientFeedback}
                  />
                  <label htmlFor={`se-${m.id}`} style={{ marginTop: "0.75rem" }}>
                    Observed side effects
                  </label>
                  <textarea
                    id={`se-${m.id}`}
                    name="sideEffectsObserved"
                    rows={3}
                    placeholder="Describe anything unusual you noticed. If this is urgent, seek medical care."
                    defaultValue={m.sideEffectsObserved}
                  />
                  <div className="form-actions" style={{ marginTop: "0.75rem" }}>
                    <button type="submit" className="btn btn-primary">
                      Save notes
                    </button>
                  </div>
                </form>
                {m.pharmacistReply ? (
                  <div className="pharmacist-reply-box" style={{ marginTop: "1rem" }}>
                    <strong>Pharmacist reply:</strong> {m.pharmacistReply}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    ) : (
      <section className="panel">
        <p className="muted">Loading your medications…</p>
      </section>
    );

  const adminAuth =
    adminSub === "register" ? (
      <section className="panel">
        <h2>Pharmacist staff registration</h2>
        <p className="panel-sub">
          Enter the staff invite code provided by your pharmacy IT or manager. Patient accounts do not need this code.
        </p>
        {flashBanner}
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const pw = String(fd.get("password") || "");
            const pw2 = String(fd.get("password2") || "");
            if (pw !== pw2) {
              setFlash({ msg: "Passwords did not match.", kind: "error" });
              return;
            }
            try {
              const data = await api<{ token: string; user: PortalUser }>("/auth/register", {
                method: "POST",
                body: JSON.stringify({
                  email: String(fd.get("email") || ""),
                  password: pw,
                  displayName: String(fd.get("displayName") || ""),
                  role: "pharmacist",
                  inviteCode: String(fd.get("inviteCode") || ""),
                }),
              });
              setToken(data.token);
              setCurrentUser(data.user);
              setPharmacistPatients(null);
              setAdminSub("login");
              setFlash({ msg: "Staff account created. You are signed in.", kind: "success" });
            } catch (err) {
              setFlash({ msg: (err as Error).message, kind: "error" });
            }
          }}
        >
          <div>
            <label htmlFor="arEmail">Work email</label>
            <input id="arEmail" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="arName">Display name</label>
            <input id="arName" name="displayName" autoComplete="name" required maxLength={120} />
          </div>
          <div>
            <label htmlFor="arInvite">Staff invite code</label>
            <input id="arInvite" name="inviteCode" autoComplete="off" required />
          </div>
          <div>
            <label htmlFor="arPw">Password</label>
            <input id="arPw" name="password" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div>
            <label htmlFor="arPw2">Confirm password</label>
            <input id="arPw2" name="password2" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create staff account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdminSub("login")}>
              Staff sign-in
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setView("welcome")}>
              Home
            </button>
          </div>
        </form>
      </section>
    ) : (
      <section className="panel">
        <h2>Pharmacist sign-in</h2>
        <p className="panel-sub">Sign in to view registered patients and record dispensed medications.</p>
        {flashBanner}
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              const data = await api<{ token: string; user: PortalUser }>("/auth/login", {
                method: "POST",
                body: JSON.stringify({
                  email: String(fd.get("email") || ""),
                  password: String(fd.get("password") || ""),
                }),
              });
              if (data.user.role !== "pharmacist") {
                setFlash({ msg: "This email is registered as a patient. Use the patient portal instead.", kind: "error" });
                return;
              }
              setToken(data.token);
              setCurrentUser(data.user);
              setPharmacistPatients(null);
              setFlash({ msg: "Welcome back.", kind: "success" });
            } catch (err) {
              setFlash({ msg: (err as Error).message, kind: "error" });
            }
          }}
        >
          <div>
            <label htmlFor="alEmail">Email</label>
            <input id="alEmail" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="alPw">Password</label>
            <input id="alPw" name="password" type="password" autoComplete="current-password" required />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Sign in
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdminSub("register")}>
              New staff account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setView("welcome")}>
              Home
            </button>
          </div>
        </form>
      </section>
    );

  const adminDashboard =
    pharmacistPatients !== null ? (
      <>
        {flashBanner}
        <section className="panel">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
            <div>
              <h2>Pharmacist dashboard</h2>
              <p className="panel-sub" style={{ marginBottom: 0 }}>
                Manage patients, reply to feedback, stock inventory, and patient orders.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setToken(null);
                setCurrentUser(null);
                setPharmacistPatients(null);
                setPharmacistStock(null);
                setPharmacistOrders(null);
                setRxPanel({ open: false });
                setAddRxPatientId(null);
                setShowAddStock(false);
                setView("admin");
                setAdminSub("login");
                setFlash({ msg: "Signed out of pharmacist account.", kind: "info" });
              }}
            >
              Sign out
            </button>
          </div>
          <div className="portal-tabs" role="tablist" aria-label="Pharmacist sections">
            <button
              type="button"
              className={`portal-tab${adminTab === "patients" ? " is-active" : ""}`}
              onClick={() => setAdminTab("patients")}
            >
              Patients
            </button>
            <button
              type="button"
              className={`portal-tab${adminTab === "stock" ? " is-active" : ""}`}
              onClick={() => setAdminTab("stock")}
            >
              Stock list
            </button>
            <button
              type="button"
              className={`portal-tab${adminTab === "orders" ? " is-active" : ""}`}
              onClick={() => setAdminTab("orders")}
            >
              Patient orders
            </button>
          </div>
          {adminTab === "patients" && pharmacistPatients.length === 0 ? (
            <p className="empty-state muted">No patient accounts yet. Patients can register from the public link; they will appear here automatically.</p>
          ) : null}
          {adminTab === "patients" && pharmacistPatients.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Meds listed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pharmacistPatients.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.displayName}</strong>
                        <br />
                        <span className="muted" style={{ fontSize: "0.82rem" }}>
                          {p.email} · #{p.id}
                        </span>
                      </td>
                      <td>{Number(p.prescriptionCount)}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn-small"
                          onClick={() => {
                            setAddRxPatientId(String(p.id));
                            setTimeout(() => document.getElementById("rxDrug")?.focus(), 0);
                          }}
                        >
                          Add medication
                        </button>
                        <button type="button" className="btn-small" onClick={() => void openRxPanel(String(p.id))}>
                          View / manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {adminTab === "stock" ? (
            pharmacistStock === null ? (
              <p className="muted">Loading stock…</p>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                  <button type="button" className="btn btn-primary" onClick={() => setShowAddStock((v) => !v)}>
                    {showAddStock ? "Cancel" : "Add stock item"}
                  </button>
                </div>
                {showAddStock ? (
                  <form
                    className="form-grid"
                    style={{ marginBottom: "1.25rem", padding: "1rem", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      try {
                        await api("/pharmacist/stock", {
                          method: "POST",
                          body: JSON.stringify({
                            drugName: String(fd.get("drugName") || ""),
                            description: String(fd.get("description") || ""),
                            quantityOnHand: Number(fd.get("quantityOnHand") || 0),
                            unit: String(fd.get("unit") || "units"),
                            isAvailable: fd.get("isAvailable") === "on",
                            priceNaira: Number(fd.get("priceNaira") || 0),
                            priceUsdc: Number(fd.get("priceUsdc") || 0),
                          }),
                        });
                        setPharmacistStock(null);
                        setShowAddStock(false);
                        setFlash({ msg: "Stock item added.", kind: "success" });
                      } catch (err) {
                        setFlash({ msg: (err as Error).message, kind: "error" });
                      }
                    }}
                  >
                    <div>
                      <label htmlFor="stkName">Medication name</label>
                      <input id="stkName" name="drugName" required />
                    </div>
                    <div>
                      <label htmlFor="stkDesc">Description (optional)</label>
                      <input id="stkDesc" name="description" />
                    </div>
                    <div className="form-grid two" style={{ gridColumn: "1 / -1" }}>
                      <div>
                        <label htmlFor="stkQty">Quantity on hand</label>
                        <input id="stkQty" name="quantityOnHand" type="number" min={0} defaultValue={0} required />
                      </div>
                      <div>
                        <label htmlFor="stkUnit">Unit</label>
                        <input id="stkUnit" name="unit" defaultValue="units" placeholder="e.g. tablets, bottles" />
                      </div>
                    </div>
                    <div className="form-grid two" style={{ gridColumn: "1 / -1" }}>
                      <div>
                        <label htmlFor="stkNaira">Price (₦ Naira)</label>
                        <input id="stkNaira" name="priceNaira" type="number" min={0} step="0.01" defaultValue={0} />
                      </div>
                      <div>
                        <label htmlFor="stkUsdc">Price (USDC)</label>
                        <input id="stkUsdc" name="priceUsdc" type="number" min={0} step="0.000001" defaultValue={0} />
                      </div>
                    </div>
                    <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                      If USDC is 0, the marketplace estimates it from the live ₦/USDC rate.
                    </p>
                    <div>
                      <label>
                        <input type="checkbox" name="isAvailable" defaultChecked /> Available for patient orders
                      </label>
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary">
                        Save to stock list
                      </button>
                    </div>
                  </form>
                ) : null}
                {pharmacistStock.length === 0 ? (
                  <p className="muted">No stock items yet. Add medications patients can order.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Medication</th>
                          <th>In stock</th>
                          <th>Available</th>
                          <th>Update</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pharmacistStock.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.drugName}</strong>
                              {item.description ? (
                                <div className="muted" style={{ fontSize: "0.82rem" }}>
                                  {item.description}
                                </div>
                              ) : null}
                              <div className="muted" style={{ fontSize: "0.82rem", marginTop: "0.35rem" }}>
                                ₦{Number(item.priceNaira || 0).toFixed(2)} · {Number(item.priceUsdc || 0).toFixed(4)} USDC
                              </div>
                            </td>
                            <td>{item.quantityOnHand}</td>
                            <td>{item.isAvailable !== false ? "Yes" : "No"}</td>
                            <td>
                              <form
                                className="form-grid two"
                                style={{ margin: 0 }}
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  const fd = new FormData(e.currentTarget);
                                  try {
                                    await api(`/pharmacist/stock/${item.id}`, {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        drugName: String(fd.get("drugName") || ""),
                                        description: String(fd.get("description") || ""),
                                        quantityOnHand: Number(fd.get("quantityOnHand") || 0),
                                        unit: String(fd.get("unit") || "units"),
                                        isAvailable: fd.get("isAvailable") === "on",
                                        priceNaira: Number(fd.get("priceNaira") || 0),
                                        priceUsdc: Number(fd.get("priceUsdc") || 0),
                                      }),
                                    });
                                    setPharmacistStock(null);
                                    setFlash({ msg: "Stock updated.", kind: "success" });
                                  } catch (err) {
                                    setFlash({ msg: (err as Error).message, kind: "error" });
                                  }
                                }}
                              >
                                <div>
                                  <label className="sr-only">Name</label>
                                  <input name="drugName" defaultValue={item.drugName} required />
                                </div>
                                <div>
                                  <label className="sr-only">Qty</label>
                                  <input name="quantityOnHand" type="number" min={0} defaultValue={item.quantityOnHand} />
                                </div>
                                <div>
                                  <input name="description" defaultValue={item.description} placeholder="Description" />
                                </div>
                                <div>
                                  <input name="unit" defaultValue={item.unit} />
                                </div>
                                <div>
                                  <input name="priceNaira" type="number" min={0} step="0.01" defaultValue={item.priceNaira ?? 0} placeholder="₦ price" />
                                </div>
                                <div>
                                  <input name="priceUsdc" type="number" min={0} step="0.000001" defaultValue={item.priceUsdc ?? 0} placeholder="USDC" />
                                </div>
                                <div>
                                  <label>
                                    <input type="checkbox" name="isAvailable" defaultChecked={item.isAvailable !== false} />{" "}
                                    Available
                                  </label>
                                </div>
                                <div className="row-actions">
                                  <button type="submit" className="btn-small">
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-small"
                                    onClick={async () => {
                                      if (!confirm(`Remove ${item.drugName} from stock list?`)) return;
                                      try {
                                        await api(`/pharmacist/stock/${item.id}`, { method: "DELETE" });
                                        setPharmacistStock(null);
                                        setFlash({ msg: "Stock item removed.", kind: "success" });
                                      } catch (err) {
                                        setFlash({ msg: (err as Error).message, kind: "error" });
                                      }
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          ) : null}
          {adminTab === "orders" ? (
            pharmacistOrders === null ? (
              <p className="muted">Loading orders…</p>
            ) : pharmacistOrders.length === 0 ? (
              <p className="muted">No patient orders yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Medication</th>
                      <th>Qty</th>
                      <th>Status</th>
                      <th>Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pharmacistOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.patientDisplayName}</strong>
                          <br />
                          <span className="muted" style={{ fontSize: "0.8rem" }}>
                            {o.patientEmail}
                          </span>
                        </td>
                        <td>
                          {o.drugName}
                          {o.patientNote ? (
                            <div className="muted" style={{ fontSize: "0.82rem" }}>
                              Patient: {o.patientNote}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {o.quantity} {o.unit}
                        </td>
                        <td>
                          <span className={`status-pill status-pill--${o.status}`}>{o.status}</span>
                        </td>
                        <td>
                          <form
                            className="form-grid"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const fd = new FormData(e.currentTarget);
                              try {
                                await api(`/pharmacist/orders/${o.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    status: String(fd.get("status") || o.status),
                                    pharmacistNote: String(fd.get("pharmacistNote") || ""),
                                  }),
                                });
                                setPharmacistOrders(null);
                                setFlash({ msg: "Order updated.", kind: "success" });
                              } catch (err) {
                                setFlash({ msg: (err as Error).message, kind: "error" });
                              }
                            }}
                          >
                            <div>
                              <label className="sr-only">Status</label>
                              <select name="status" defaultValue={o.status}>
                                <option value="pending">pending</option>
                                <option value="confirmed">confirmed</option>
                                <option value="ready">ready</option>
                                <option value="fulfilled">fulfilled</option>
                                <option value="cancelled">cancelled</option>
                              </select>
                            </div>
                            <div>
                              <input name="pharmacistNote" defaultValue={o.pharmacistNote} placeholder="Note to patient" />
                            </div>
                            <button type="submit" className="btn-small">
                              Update
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </section>

        <section className="panel" id="rxPanel" hidden={!rxPanel.open || adminTab !== "patients"}>
          <h2 id="rxPanelTitle">
            {rxPanel.open && !rxPanel.loading ? `Medications — ${rxPanel.patient.displayName}` : "Medications for patient"}
          </h2>
          <p className="panel-sub" id="rxPanelSub">
            {rxPanel.open && !rxPanel.loading ? (
              <>
                {rxPanel.patient.email} · Patient #{rxPanel.patient.id}
              </>
            ) : (
              " "
            )}
          </p>
          <div id="rxPanelBody">
            {rxPanel.open && rxPanel.loading ? <p className="muted">Loading…</p> : null}
            {rxPanel.open && !rxPanel.loading ? (
              <PharmacistRxPanel
                prescriptions={rxPanel.prescriptions}
                onSaveReply={async (prescriptionId, pharmacistReply) => {
                  if (!rxPanel.open || rxPanel.loading) return;
                  const patientId = rxPanel.patientId;
                  await api(`/pharmacist/prescriptions/${prescriptionId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ pharmacistReply }),
                  });
                  setFlash({ msg: "Reply saved for the patient.", kind: "success" });
                  await openRxPanel(patientId);
                }}
                onRemove={async (prescriptionId) => {
                  if (!rxPanel.open || rxPanel.loading) return;
                  const patientId = rxPanel.patientId;
                  await api(`/pharmacist/prescriptions/${prescriptionId}`, { method: "DELETE" });
                  setPharmacistPatients(null);
                  await openRxPanel(patientId);
                }}
              />
            ) : null}
          </div>
        </section>

        <section className="panel" id="addRxPanel" hidden={!addRxPatientId || adminTab !== "patients"}>
          <h2>Record dispensed medication</h2>
          <p className="panel-sub">This information is visible to the patient when they sign in.</p>
          <form
            id="addRxForm"
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const patientUserId = Number(fd.get("patientId"));
              try {
                await api("/pharmacist/prescriptions", {
                  method: "POST",
                  body: JSON.stringify({
                    patientUserId,
                    drugName: String(fd.get("drugName") || ""),
                    indication: String(fd.get("indication") || ""),
                    dosage: String(fd.get("dosage") || ""),
                    duration: String(fd.get("duration") || ""),
                    dispensedOn: String(fd.get("dispensedOn") || ""),
                    pharmacistNote: String(fd.get("pharmacistNote") || ""),
                  }),
                });
                setAddRxPatientId(null);
                setPharmacistPatients(null);
                setFlash({ msg: "Medication saved.", kind: "success" });
                await openRxPanel(String(patientUserId));
              } catch (err) {
                setFlash({ msg: (err as Error).message, kind: "error" });
              }
            }}
          >
            <input type="hidden" name="patientId" value={addRxPatientId || ""} readOnly />
            <div className="form-grid two" style={{ gridColumn: "1 / -1" }}>
              <div>
                <label htmlFor="rxDrug">Medication name</label>
                <input id="rxDrug" name="drugName" required placeholder="e.g. Amoxicillin 500 mg capsule" />
              </div>
              <div>
                <label htmlFor="rxDispensed">Dispensed on</label>
                <input id="rxDispensed" name="dispensedOn" type="date" />
              </div>
            </div>
            <div>
              <label htmlFor="rxIndication">Indication</label>
              <input id="rxIndication" name="indication" required placeholder="What it is being used for" />
            </div>
            <div className="form-grid two" style={{ gridColumn: "1 / -1" }}>
              <div>
                <label htmlFor="rxDosage">Dosage &amp; directions</label>
                <textarea
                  id="rxDosage"
                  name="dosage"
                  rows={2}
                  required
                  placeholder="e.g. Take 1 capsule by mouth three times daily with food"
                />
              </div>
              <div>
                <label htmlFor="rxDuration">Duration</label>
                <input id="rxDuration" name="duration" required placeholder="e.g. 10 days" />
              </div>
            </div>
            <div>
              <label htmlFor="rxNote">Pharmacist note (optional)</label>
              <textarea id="rxNote" name="pharmacistNote" rows={2} placeholder="Counseling highlights, storage, cautions…" />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Save medication
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAddRxPatientId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      </>
    ) : (
      <section className="panel">
        <p className="muted">Loading patients…</p>
      </section>
    );

  let main: ReactNode = welcome;
  if (view === "patient") {
    main = currentUser?.role === "patient" ? patientDashboard : patientAuth;
  } else if (view === "admin") {
    main = currentUser?.role === "pharmacist" ? adminDashboard : adminAuth;
  }

  return (
    <>
      <div className="bg-pattern" aria-hidden />
      <header className="site-header">
        <div className="brand">
          <span className="brand-icon" aria-hidden>
            <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="10" width="11" height="8" rx="4" stroke="currentColor" strokeWidth="1.75" />
              <rect x="6.5" y="10" width="6" height="8" rx="3" fill="currentColor" fillOpacity="0.2" />
              <circle cx="20" cy="14" r="6.5" stroke="currentColor" strokeWidth="1.75" />
              <path d="M20 11.25v5.5M17.25 14h5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="brand-name">Jerlyd Pharmacy</p>
            <p className="brand-tag">Trusted care, clear guidance</p>
          </div>
        </div>
        <nav className="site-nav">
          <button
            type="button"
            className={`nav-btn${view === "welcome" ? " is-active" : ""}`}
            onClick={() => setView("welcome")}
          >
            Home
          </button>
          <button
            type="button"
            className={`nav-btn${view === "patient" ? " is-active" : ""}`}
            onClick={() => {
              setView("patient");
              if (currentUser?.role !== "patient") setPatientSub("login");
            }}
          >
            Patient portal
          </button>
          <button
            type="button"
            className={`nav-btn nav-btn--accent${view === "admin" ? " is-active" : ""}`}
            onClick={() => {
              setView("admin");
              if (currentUser?.role !== "pharmacist") setAdminSub("login");
            }}
          >
            Pharmacist
          </button>
        </nav>
      </header>

      <main className="main">{main}</main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="site-footer-copy">© 2026 Jerlyd Pharmacy. All rights reserved.</p>
          <p className="site-footer-disclaimer">This portal does not replace professional medical advice.</p>
        </div>
      </footer>
    </>
  );
}
